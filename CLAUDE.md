# Daggor — project map

> Living architecture doc. Read this before any non-trivial change. Update it in the same commit when you change file layout, add a socket event, alter state ownership, or shift permission gating.

## What this is

A real-time shared battlemap for tabletop play. Three browser surfaces talk to one Node process over Socket.IO; long-lived state is in Supabase, ephemeral state is in-memory on the server.

- **Mobile player** (`/`) — touch UI, owns one token, can move it.
- **GM dashboard** (`/dashboard`) — full toolbar, the only surface allowed to mutate battlemap structure (create/rename/delete maps, change settings, edit fog, run initiative, spawn NPCs, soundboard).
- **Display** (`/display`) — read-only projector view. Same component tree as the dashboard but with the toolbar/panels stripped.

Stack: Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + Socket.IO 4.8 + Supabase. Image grid detection via `sharp`. Drag/drop via `@dnd-kit`, mobile gestures via Hammer.

## The dual-socket pattern (important)

**Every page opens TWO sockets to the server**, both with the same `persistentUserId` from localStorage:

1. The presence socket from `app/hooks/useSocket.ts` — owns the player token, emits position/image/size updates, listens for other players' tokens.
2. The companion socket from `app/providers/BattlemapProvider.tsx` — only handles battlemap data (list, get, settings, fog, etc.). Identifies with `suppressPresence: true`.

The reason this matters: both sockets share `persistentUserId`. Without a guard, the companion socket's identify would trigger takeover of the presence socket, kicking the player off their own token. The guard is `claimsPresence = !isDisplay && !suppressPresence` in `server.js` `initializeUser` (~line 1137); takeover and disconnected-user restoration only run for `claimsPresence === true`. The flag is also mirrored onto `socket.data.claimsPresence` so the battlemap-switch reseat loop skips companion sockets too.

**If you add a new socket on the client, decide explicitly whether it claims presence.**

## Server.js as authority

`server.js` (~2350 LOC) is the single source of truth for all live state. Don't try to coordinate state between clients via Supabase polling or peer events; everything goes through the server.

### What lives where

| State | Location | Survives restart? |
|---|---|---|
| Battlemaps, floors, grid settings, spawn area, map paths | Supabase (`battlemaps`, `battlemap_images`) | yes |
| Battlemap covers | Supabase (`battlemap_covers`) | yes |
| Characters | Supabase (`characters`) | yes |
| Monsters (token templates) | Supabase (`monsters`) | yes |
| Active battlemap pointer | `battlemapState.activeBattlemapId` (memory) | no — derived from "first map by sort_index" |
| Connected users | `users: Map<socketId, userData>` | no |
| Disconnected users (30-min TTL) | `disconnectedUsers: Map<persistentUserId, userData>` | no |
| Display/dashboard sockets | `displayModeUsers: Map<socketId, userData>` (separate from `users` so they're invisible to players) | no |
| Initiative tracker | `battlemap.initiative` (per-battlemap, in-memory) | no |
| Fog of war | `battlemap.fogByImage[imageId]` (per-floor, in-memory) | no |
| Soundboard library | dashboard's `localStorage` | client-side only |

### Helpers worth knowing

- `broadcastToActive(event, payload)` — emits to every socket in the active battlemap's room (`bm:<id>`). Use for token/cover/fog/presence events.
- `broadcastFromSocketToActive(socket, event, payload)` — same, but excludes the sender. Server.js ~588.
- `runBackgroundTask(desc, asyncFn)` — fires the task with `setImmediate` and logs failures. Used to push Supabase writes off the request path.
- `ensureBattlemapMutator(eventName, ack)` — gates handlers that mutate battlemap structure to dashboard sockets only. Server.js ~1050.
- `sanitize*` family — `sanitizeAssetUrl`, `sanitizeHexColor`, `sanitizePosition`, `sanitizeSpawnArea`, `sanitizeFogShape`, `sanitizeTokenSize`, `sanitizeGridData`, `sanitizeInitiativeEntry`. Use these for any incoming client value before it touches state.

## Permission model

| Surface | `isDisplay` | `allowBattlemapMutations` | `claimsPresence` | `suppressPresence` |
|---|---|---|---|---|
| `mobile` (presence socket) | false | false | **true** | false |
| `mobile` (companion socket) | false | false | false | **true** |
| `display` (presence socket) | **true** | false | false | false |
| `display` (companion socket) | true | false | false | true |
| `dashboard` (presence socket) | **true** | **true** | false | false |
| `dashboard` (companion socket) | true | true | false | true |

Three rules everything else follows from:

1. **Only `dashboard` can mutate battlemap structure.** Enforced by `ensureBattlemapMutator`. Display *can* observe; only dashboard can change.
2. **Only DM surfaces (`display`/`dashboard`) can spawn or remove tokens.** Enforced by `userData?.isDisplay` checks in `add-token` / `remove-token` / `token-size-update` handlers.
3. **Players can only move/recolor/resize their own token.** Enforced by `position-update` / `token-image-update` handlers comparing `persistentUserId`. Dashboards/displays bypass this check.

## Key data flows (with file:line refs)

- **Token move (player):** `MapViewMobile` → `usePosition` → `useSocket.updateMyPosition` → server `position-update` (server.js ~2080) → ownership check → `broadcastToActive('user-moved')` → all observers' `useSocket` → `setOtherUsers`.
- **Battlemap switch (DM):** `BattlemapManager.selectBattlemap` → `BattlemapProvider.selectBattlemap` (`set-active` emit) → server `battlemap:set-active` (~1590) → `resetTokensForActiveBattlemap` (~729): broadcasts `token-removed` for everyone, clears `users` + `disconnectedUsers`, wipes new map's initiative, reseats every connected presence socket into the spawn area, broadcasts fresh `user-joined` + `all-users` + `initiative:updated`. Then `moveSocketsToActiveBattlemapRoom` (~829) migrates every socket between rooms.
- **Fog rectangle add/remove/move/clear:** `FogManager` UI → `BattlemapProvider.addFogArea` etc. → server `fog:*` handlers (~1786) → mutate `battlemap.fogByImage[imageId]` → `emitBattlemapUpdate(id)` → all observers re-render via `BattlemapProvider`'s `battlemap:updated` listener.
- **Initiative auto-population:** triggered by player join (`initializeUser` ~1240), NPC spawn (`add-token` ~2295), name update (`user-name-update` ~2235), battlemap switch (reseat loop ~813). Removal triggered by disconnect (~2225) or `remove-token` (~2280). Drag-reorder via dashboard's `InitiativePanel` → `initiative:reorder` (~1953). Order is DM-authoritative; the server does not sort by score.
- **Name propagation:** mobile player picks character → `CharacterProvider` sets state → `MapViewMobile` effect calls `useSocket.updateMyName` → server `user-name-update` (~2235) → broadcasts `user-name-updated` to active room → observers patch `otherUsers`/`disconnectedUsers` and dashboard re-renders the players panel. `updateMyName` is `useCallback`'d and gated by `lastSentNameRef` so it does not re-emit on every render — see "Known issues / regression risks" below.

## Critical conventions

- `persistentUserId` is the **stable** identity across reconnects. Initiative entries are keyed by it. The socket id is ephemeral.
- All position coordinates are **image-relative percentages 0–100**. Conversion to/from screen pixels lives in `app/hooks/useCoordinateMapper.ts` and `app/utils/coordinates.ts`. Snap-to-grid happens client-side before emitting.
- Per-map broadcasts go through `broadcastToActive`; only `battlemap:list` and `battlemap:active` use raw `io.emit` because every client needs them regardless of room.
- `display` and `dashboard` sockets live in `displayModeUsers`, **not** in `users`. They have no token, are invisible to players, but still join the active battlemap's room so they receive per-map events.
- Mobile player sees own token via `myUserId` / `myColor` / `myPosition` / etc. (top-level useSocket return), not via `otherUsers`. The current-turn check uses `myPersistentUserId` because initiative is keyed by persistent id.
- Token size lives in a fixed enum (`tiny`/`small`/`medium`/`large`/`huge`/`gargantuan`) with multipliers in `app/utils/tokenSizes.ts`.

## File map

```
server.js                                # The authority. ~2350 LOC.
  - lines  ~588      broadcast helpers
  - lines  ~611–728  initiative helpers (outer scope, used by reseat loop too)
  - lines  ~729–824  resetTokensForActiveBattlemap (battlemap-switch flow)
  - lines  ~957+     io.on('connection', ...) — all socket handlers
  - lines  ~957–1305 initializeUser (takeover, restoration, room join)
  - lines  ~1325+    battlemap:* handlers
  - lines  ~1786+    fog:* handlers
  - lines  ~1865+    soundboard:* handlers
  - lines  ~1884+    initiative:* handlers
  - lines  ~2080+    position/token/user handlers + disconnect

app/
  layout.tsx                              # TooltipProvider only
  page.tsx → SurfaceShell surface=mobile
  dashboard/page.tsx → SurfaceShell surface=dashboard
  display/page.tsx → SurfaceShell surface=display
  globals.css                             # Tailwind v4 + theatrical theme tokens
  providers/
    BattlemapProvider.tsx                 # Companion socket. Owns battlemap state.
    CharacterProvider.tsx                 # Supabase character row.
  components/
    SurfaceShell.tsx                      # Provider wiring. Fine-pointer gate.
    MapView/
      MapView.tsx                         # Surface router + LoadingScreen gate.
      MapViewDisplay.tsx                  # Used by /display AND /dashboard.
      MapViewMobile/index.tsx + hooks/    # /  (touch + pan/zoom/auto-center).
      MapImage.tsx                        # Next/Image wrapper. Falls back to default map.
      GridLines.tsx
      FogOfWar.tsx                        # Rendering only.
      FogManager.tsx                      # Drag handles for the GM. Dashboard-only.
      LoadingScreen.tsx                   # 5s minimum visible duration.
    Token/
      Token.tsx                           # Renderer + image preload.
      TokenManager.tsx                    # Maps users → DraggableTokens.
      DraggableToken.tsx                  # Mouse/touch drag + long-press menu.
      TokenActionsMenu.tsx
      UserToken.tsx
    Dashboard/
      InitiativePanel.tsx                 # @dnd-kit/sortable drag-reorder.
      PlayerStatusPanel.tsx
      SoundboardPanel.tsx
    Toolbar/
      SidebarToolbar.tsx                  # Grid scale, offset, floor switcher, tools.
      BattlemapManager.tsx                # Map list + CRUD.
      TokenPicker.tsx                     # Color palette + monster templates.
      Settings/                           # Grid offset joystick, etc.
  hooks/
    useSocket.ts                          # Presence socket bus.
    useSurface.ts + useFinePointer.ts
    useViewMode.ts                        # SSR-safe mobile breakpoint detection.
    useImageBounds.ts + useCoordinateMapper.ts
    useDrag.ts + usePosition.ts           # Drag primitives.
    useInitiative.ts                      # Wraps initiative socket events.
    useSoundboardListener.ts
  api/
    gridlines/route.ts                    # Sobel edge detection grid inference.
    map-upload/route.ts                   # Supabase storage upload (10 MB cap).
    token-upload/route.ts                 # Supabase storage upload (5 MB cap).
  utils/
    coordinates.ts + grid.ts + gridData.ts
    imageBounds.ts + tokenSizes.ts
    supabase.ts                           # Browser supabase client.
  types/index.ts                          # User, TokenTemplate, Position, etc.

migrations/                               # 8 SQL files. 002 + 007 + 008 are the relevant ones.
tests/e2e/                                # Playwright. fixtures/ has surface fixtures + socket helpers.
public/maps/                              # Default battlemap fallback lives here.
lib/                                      # supabaseServer, defaultBattlemap.
```

## Common change recipes

**Adding a new socket event (server → client broadcast).**
1. Add the handler to `server.js` (gate via `ensureBattlemapMutator` or `userData?.isDisplay` as appropriate). Sanitize all inputs. Mutate state. Broadcast via `broadcastToActive` or `broadcastFromSocketToActive`.
2. Add the listener in `app/hooks/useSocket.ts` (or a domain-specific hook like `useInitiative.ts` if it's not presence-related).
3. Update the User type in `app/types/index.ts` if the payload changes the user shape.
4. Update the relevant section of this file.

**Adding a new battlemap field (e.g., a per-map theme color).**
1. Migration in `migrations/00N_*.sql` adding the column with default.
2. Add to `loadBattlemapStateFromSupabase` (column list + mapping).
3. Add to `serializeBattlemap` (~line 253) + `serializeBattlemapSummary` (~line 221).
4. Add a `battlemap:update-<field>` handler that mutates state, broadcasts, and queues the Supabase write via `runBackgroundTask`.
5. Add to `BattlemapData` interface and `normalizeBattlemapPayload` in `app/providers/BattlemapProvider.tsx`.
6. Surface a setter from the provider's context value if dashboard UI needs to write it.

**Adding a new dashboard panel.**
1. New component under `app/components/Dashboard/`.
2. Mount inside `MapViewDisplay.tsx` gated on `showToolbar` (~line 397).
3. If it talks to the server, route through the existing presence `socket` from `useSocket(surface)` rather than opening a new one.

**Adding a CSS class to the display container or any panel.**
Two traps the codebase has hit twice each:

1. **Don't override `position: fixed`** — Tailwind's `fixed` class is on most panels. Setting `position: relative` (e.g. for an `::after`) drops the element back into normal flow, neutralizes `inset-0` / `right-4` / etc., and stretches it to full viewport width. The `theatrical-vignette` class did this and made `/display` blank. The `.glass-panel` class did the *same* thing later. The `fixed` parent is already a positioned ancestor for absolute children — you don't need to set it again on the panel.

2. **Don't put `overflow: hidden` on a panel that hosts flyouts or tooltips.** Most panels in the dashboard (toolbar, players, soundboard) have absolute children that extend *outside* their bounding box (`absolute left-full`, `absolute top-full`, etc.). `overflow: hidden` will clip those. If you need clipping for a scrolling list, opt in via inline style on the inner scroll container, not the outer panel.

3. **Don't put `transform` (or `perspective`/`filter`) on an element whose descendants use `position: fixed`.** Any of those CSS properties makes the element the *containing block* for fixed-position children, so `top`/`left`/etc. become relative to that ancestor instead of the viewport. The toolbar used to be `fixed left-4 top-1/2 -translate-y-1/2` with flyouts inside it; the `-translate-y-1/2` shifted every fixed flyout by ~half the toolbar height. Fix is to wrap the toolbar in an outer `fixed left-4 top-0 bottom-0 flex items-center` container so vertical centering happens via flexbox (no transform) and the toolbar itself has no transform on it. See `SidebarToolbar.tsx`.

## Known issues / backlog

Items I or the audit pass have flagged. Severity is user-visible impact × likelihood, not bug sharpness. I've removed the agents' speculative items that didn't survive verification.

### Open

#### Medium

- **`useCoordinateMapper`** memoizes on dimensions, not battlemap identity. Switching to a same-sized map keeps the stale mapper. Low-impact today because all current maps are 100×100 — the math is purely dimension-based, so the mapper produces correct results regardless. Re-flag if maps with different gridData dimensions are introduced.
- **No CI.** No GitHub Actions. Lint/typecheck/test only run when someone remembers locally.
- **Test gaps.** Map image upload + render path: untested. Supabase persistence (write → restart server → reload): untested. Multi-server presence (would require Redis adapter): untested.

#### Low

- `as unknown as` escape hatches in `useSocket.ts` and `DraggableToken.tsx` — both are dev/debug helpers. Acceptable; keep an eye on growth.
- `DISCONNECTED_USER_TTL_MS` (30 min) and the 5-min sweep interval are hardcoded — fine for now, would want env vars before prod tuning.
- No `/api/status` health endpoint despite the README mentioning the intent.
- Single-instance only (no `@socket.io/redis-adapter`). Scaling beyond one process needs that and a persistence story for in-memory state.
- `displayModeUsers` sockets get joined to the active battlemap room and therefore *receive their own* `broadcastToActive` events. Harmless today (handlers no-op), latent footgun if a future handler isn't sender-aware.

### Resolved

- ~~Mobile gesture refs lag state~~ — `usePanZoom.ts` now wraps the setters with `makeMirroredSetter` so the ref updates synchronously with the state.
- ~~No error boundary~~ — `app/components/ErrorBoundary.tsx` wraps every surface in `SurfaceShell`; uncaught render errors now show a "The realm collapsed" panel with try-again / reload instead of leaving a frozen LoadingScreen.
- ~~`CharacterProvider.updateCharacter` stale closure~~ — now reads the target character from `characterRef` at call time and skips the success-branch `setCharacter` if the user has switched characters during the round-trip.
- ~~`BattlemapProvider` settings-debounce has no in-flight-emit cleanup~~ — added `isMountedRef`; the scheduled emit and its `.catch`/`.finally` all bail if the provider has unmounted.
- ~~`battlemap:delete-image` doesn't cascade fog shapes~~ — server now deletes `battlemap.fogByImage[imageId]` alongside the cover cleanup.
- ~~Fog/cover IDs use `Date.now() + Math.random()`~~ — both now use `crypto.randomUUID()`.
- ~~`TokenManager.handleTokenContextMenu` is not memoized~~ — wrapped in `useCallback`. (Note: the inline `(e) => handleTokenContextMenu(e, persistentUserId)` at the call site still creates a new arrow per token per render; if `DraggableToken` is later wrapped in `React.memo`, that closure should be stabilized too.)
- ~~`prefetchImage` in `BattlemapProvider` has no `onerror`~~ — failures now log via `debugLog` and stay in the dedupe set so we don't spin retrying a broken URL.
- ~~`BattlemapProvider` `debugLog` always on~~ — now elided in production builds (`process.env.NODE_ENV === "production"`).

### Verified-as-non-issues (keeping the note so the audit isn't re-run)

- `.env` is **not** committed — `.gitignore` has `.env*` and `git ls-files .env` is empty.
- The local `SUPABASE_KEY` is also an anon key (decoded JWT `role: "anon"`), despite the misleading non-`NEXT_PUBLIC_` name.
- Supabase fallback retry uses a hardcoded column allowlist, not user input — no SQL injection risk.
- ~~`DraggableToken` long-press timer~~ — already cleared on unmount via `useEffect` cleanup at `DraggableToken.tsx:392-398`. Audit overreached.

## How to keep this doc current

If a change…

- **Moves files or renames public exports** — update the file map.
- **Adds or removes a socket event** — update "Key data flows" and the relevant change recipe.
- **Shifts state ownership** (e.g., moving something from in-memory to Supabase) — update the "What lives where" table.
- **Changes a permission gate** — update the permission-model table and the `claimsPresence` discussion.
- **Hits one of the issues backlog** — strike it from the list. If you discover a new one, add it with severity and a file:line reference.

The doc is allowed to be terse. It is **not** allowed to be wrong.
