# Daggor end-to-end tests

Multi-client Playwright suite. Each test opens up to three browser contexts
— the DM dashboard at `/dashboard`, the projector at `/display`, and a player
phone at `/` — and exercises features by acting on one surface and asserting
state on another. This is the only way to catch real-time sync regressions
in a Socket.IO app.

## Run

```sh
npm test                # headless, full suite
npm run test:headed     # visible browser windows, useful for debugging
npm run test:ui         # Playwright's interactive UI mode
```

The runner will start `npm run dev` if it's not already running, and reuse
an existing server on `:3000` when there is one.

To run a single spec or filter:

```sh
npx playwright test tests/e2e/fog.spec.ts
npx playwright test --grep "broadcast"
```

After a failure, open the report:

```sh
npx playwright show-report
```

## What's covered

| Spec | Surface(s) | What it verifies |
|---|---|---|
| `smoke.spec.ts` | dm, display, player | All three surfaces load, no console errors, distinct socket ids |
| `token-spawn.spec.ts` | dm → display + player | DM drops a Red token from the catalog; both other surfaces render it |
| `spawn-area.spec.ts` | dm → player | DM drags the spawn-area tool; player observes a `battlemap:updated` with new spawnArea |
| `fog.spec.ts` | dm → display + player | DM drags fog rectangle; display + player render the new shape with opacity ≥ 0.99 |
| `floors.spec.ts` | dm → display | DM switches floors via toolbar; display observes activeImageId change |
| `initiative.spec.ts` | dm → player | DM seeds initiative entries; player observes `initiative:updated` event |
| `soundboard.spec.ts` | dm → player | DM broadcasts a clip; player receives `soundboard:played`. Toggling to DM-only suppresses it |
| `toolbar.spec.ts` | dm | Each dropdown renders the Expedition 33 parchment styling; long-press opens customize editor |
| `zzz-battlemap-crud.spec.ts` | dm | Create + rename + delete a uniquely-named battlemap. Runs last so its state changes don't pollute earlier tests |

## How it works

- `tests/e2e/fixtures/surfaces.ts` exports a Playwright fixture with three
  named contexts: `dm`, `display`, `player`. Each gets its own
  `BrowserContext` (isolated localStorage → distinct `persistentUserId` →
  distinct Socket.IO connection).
- `tests/e2e/fixtures/socket-helpers.ts` reads the live socket exposed at
  `window.__daggor.socket` (a dev-only hook in `app/hooks/useSocket.ts`,
  stripped from production builds via `process.env.NODE_ENV !== "production"`).
  Helpers: `waitForSocket`, `captureSocketEvent`, `expectCapturedCount`,
  `readCapturedEvents`.
- `tests/e2e/fixtures/drag.ts` exposes `pointerDrag` (mouse-based, used for
  spawn / fog drag-to-draw on canvas) and `htmlDragDrop` (HTML5 dragstart/drop
  with a synthetic `DataTransfer`, used for the TokenPicker → canvas handoff
  because Playwright's built-in `dragTo` doesn't fire HTML5 drag events
  reliably).

## Selectors

When tests need stable hooks, prefer aria-labels (already in the UI) over
adding `data-testid`. Where neither was good enough, we added a few:

- `[data-testid="map-canvas"]` — DM dashboard's drop target
- `[data-testid="token"]` + `[data-token-color="<hex>"]` — rendered tokens
- `[data-testid="fog-overlay"]` + `[data-fog-shape-count="<n>"]` — fog state
- `button[data-token-color="<hex>"]` — TokenPicker swatches (the aria-label
  contains the user-customizable name, so we can't filter on it)

## Caveats

- **Supabase**: tests hit whatever Supabase project `NEXT_PUBLIC_SUPABASE_URL`
  points at. `tests/e2e/global-setup.ts` aborts if that URL looks
  production-shaped (matches `/prod|production|live/i`). Use a dev/test
  project. The CRUD spec creates and deletes a uniquely-named battlemap
  per run, so it does not accumulate orphans, but other specs may leave
  spawn-area / fog-shape tweaks on the active battlemap. That's acceptable
  for a dev DB and trivially reset by deleting the battlemap manually.
- **In-memory server state**: `server.js` keeps `users` and the active
  battlemap in process memory. Running specs in parallel against one shared
  server cross-pollutes; `playwright.config.ts` sets `workers: 1` and
  `fullyParallel: false` for that reason.
- **Test order**: `zzz-battlemap-crud.spec.ts` is named to sort last because
  it deletes the active battlemap, after which the dashboard goes to its
  loading screen. Other specs need a stable active battlemap, so the CRUD
  spec runs after them.
- **Soundboard autoplay**: Chromium blocks autoplay without a user gesture.
  We assert that `soundboard:played` reaches the player socket; we do *not*
  assert that audio actually plays. The DM-side click is a real gesture so
  the DM-only path does play locally.
- **Drag coordinates**: spawn-area and fog drags use absolute pixel coords
  (e.g. `(600, 400)` → `(1100, 700)`). They assume the dashboard viewport is
  1920×1080 (the default in `surfaces.ts`).

## Debugging a failing spec

1. Run with `--headed` to watch the browsers in real time.
2. Open `playwright-report/index.html` for the trace, screenshots, and the
   exact action that failed.
3. `npx playwright show-trace test-results/<...>/trace.zip` for the
   step-by-step replay with DOM snapshots.
4. Add `await dm.page.pause()` anywhere to step through interactively.

## Adding a new spec

1. Drop a `*.spec.ts` file in `tests/e2e/`.
2. Import `test, expect` from `./fixtures/surfaces` (not from
   `@playwright/test`).
3. Pull in only the contexts you need: `async ({ dm, player }) => {...}`.
4. For cross-context assertions, capture the event on the receiving page
   *before* triggering it on the sender — `captureSocketEvent` registers a
   listener that survives the rest of the test.
5. Always poll cross-context state with `expect.poll`; a single-shot
   assertion will race the network.

## Production safety

The dev-only socket hook in `app/hooks/useSocket.ts` is gated by
`process.env.NODE_ENV !== "production"`. `next build` strips that branch
out — the production bundle does not expose `window.__daggor`.
