# Daggor

A collaborative online battlemap that lets a game master run a cinematic “display mode” on the table while each player moves their own token from a phone-friendly “mobile mode.” The app runs on Next.js 16 with a colocated Socket.IO server, Supabase for persistence, and on-demand grid detection powered by `sharp`.

## Contents

- [Overview](#overview)
- [Architecture Highlights](#architecture-highlights)
- [Frontend Surfaces](#frontend-surfaces)
- [Real-Time Collaboration Flow](#real-time-collaboration-flow)
- [Data &amp; Persistence](#data--persistence)
- [API Surface](#api-surface)
- [Environment &amp; Configuration](#environment--configuration)
- [Local Development](#local-development)
- [Supabase &amp; Data Migrations](#supabase--data-migrations)
- [Deployment](#deployment)
- [Testing &amp; Quality](#testing--quality)
- [Troubleshooting &amp; Tips](#troubleshooting--tips)

## Overview

Daggor renders a tactical map (`MapImage`) once and layers sockets-driven components—tokens, covers, and dynamic gridlines—on top. The root `MapView` inspects the client viewport at runtime and mounts either the large-screen display experience or the touch-first mobile canvas, keeping hydration safe by defaulting to display mode server-side.

```1:34:app/components/MapView.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useViewMode } from "../hooks/useViewMode";
import { MapViewDisplay } from "./MapViewDisplay";
import { MapViewMobile } from "./MapViewMobile";
import { LoadingScreen } from "./LoadingScreen";

export const MapView = () => {
  const { isMobile, isDisplay } = useViewMode();
  const [isMapReady, setIsMapReady] = useState(false);

  const handleReadyChange = useCallback((ready: boolean) => {
    setIsMapReady(ready);
  }, []);

  const renderedView = useMemo(() => {
    if (isDisplay) {
      return <MapViewDisplay onReadyChange={handleReadyChange} />;
    }

    if (isMobile) {
      return <MapViewMobile onReadyChange={handleReadyChange} />;
    }

    // Default to display mode during SSR/hydration
    return <MapViewDisplay onReadyChange={handleReadyChange} />;
  }, [handleReadyChange, isDisplay, isMobile]);

  return (
    <>
      <LoadingScreen isReady={isMapReady} />
      {renderedView}
    </>
  );
};
```

## Architecture Highlights

### Runtime stack

- **Next.js App Router + Tailwind CSS v4** render the UI, with fonts configured in `app/layout.tsx`.
- **Custom Node HTTP + Socket.IO server (`server.js`)** wraps `next`’s request handler so realtime traffic and SSR share the same port/hostname. Tokens and covers are tracked in-memory for low latency; Supabase persists long-lived map metadata/grid defaults.
- **Supabase** provides Postgres tables (`map_settings`, `battlemaps`, `battlemap_covers`) and object storage for uploaded map images.

```1:52:server.js
import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Store connected users (in-memory)
const users = new Map();
// Store disconnected users temporarily to restore on reconnect (in-memory)
const disconnectedUsers = new Map();
// Store covers (in-memory)
const covers = new Map();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    const userId = socket.id;
    let userData = null;
    let identificationReceived = false;
    const initializeUser = (data) => {
      if (identificationReceived) return;
      identificationReceived = true;
      const persistentUserId = data?.persistentUserId || null;
      ...
    };
    socket.once('user-identify', initializeUser);
    ...
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
```

### Client socket wrapper

`useSocket` encapsulates connection lifecycle, persistent player IDs, multi-transport fallbacks, and the full event surface (tokens, covers, reconnects). It reads `NEXT_PUBLIC_WS_URL` when present, otherwise falls back to the current origin so the same code works locally, on Vercel, or any Node host.

```64:112:app/hooks/useSocket.ts
  useEffect(() => {
    const getPersistentUserId = (): string => {
      if (typeof window === "undefined") {
        return `temp-${Date.now()}-${Math.random()}`;
      }
      const stored = localStorage.getItem("persistentUserId");
      if (stored) {
        return stored;
      }
      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem("persistentUserId", newId);
      return newId;
    };

    persistentUserIdRef.current = getPersistentUserId();

    const getWebSocketUrl = () => {
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
      }
      if (typeof window !== "undefined") {
        return window.location.origin;
      }
      return "http://localhost:3000";
    };

    const socketInstance = io(getWebSocketUrl(), {
      transports: ["websocket", "polling"],
    });
    ...
```

## Frontend Surfaces

### Display surface (GM / tabletop)

`MapViewDisplay` is optimized for a kiosk/TV: it freezes the camera, overlays the `SidebarToolbar`, renders draggable cover rectangles, and lets the DM drag/drop extra tokens that get broadcast to everyone. Gridlines are recomputed once via `/api/gridlines`, snapped to Supabase-controlled scale/offset, and cached in component state.

```327:381:app/components/MapViewDisplay.tsx
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      ...
    >
      <SidebarToolbar
        gridScale={displaySettings.gridScale}
        onGridScaleChange={setGridScale}
        gridOffsetX={displaySettings.gridOffsetX}
        gridOffsetY={displaySettings.gridOffsetY}
        onGridOffsetChange={setGridOffset}
        onTokenDragStart={handleTokenDragStart}
        onTokenDragEnd={handleTokenDragEnd}
        onSquareToolToggle={handleSquareToolToggle}
        onSquareToolLockToggle={handleSquareToolLockToggle}
        isSquareToolActive={isSquareToolActive}
        isSquareToolLocked={isSquareToolLocked}
      />
      <MapImage onLoad={updateBounds} />
      <CoverManager
        covers={covers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        isDraggable
        onRemoveCover={emitRemoveCover}
        onPositionUpdate={(id, x, y) => emitUpdateCover(id, { x, y })}
        onSizeUpdate={(id, width, height, x, y) =>
          emitUpdateCover(id, { width, height, x, y })
        }
      />
      {imageBounds && !isGridLoading && !settingsLoading && gridData && (
        <GridLines
          gridData={effectiveGridData}
          imageBounds={imageBounds}
          gridScale={displaySettings.gridScale}
          gridOffsetX={displaySettings.gridOffsetX}
          gridOffsetY={displaySettings.gridOffsetY}
        />
      )}
      <TokenManager
        activeUsers={otherUsers}
        disconnectedUsers={disconnectedUsers}
        imageBounds={imageBounds}
        worldMapWidth={worldMapWidth}
        worldMapHeight={worldMapHeight}
        gridData={effectiveGridData}
        gridScale={displaySettings.gridScale}
        gridOffsetX={displaySettings.gridOffsetX}
        gridOffsetY={displaySettings.gridOffsetY}
        isMounted={true}
        isDisplay={true}
        myUserId={myUserId}
        onRemoveToken={removeToken}
        onPositionUpdate={updateTokenPosition}
        transform={transform}
        onDragStateChange={() => {}}
      />
      ...
```

The toolbar bundles a grid slider, joystick-style offset control, token color picker, and long-press locked square tool.

```121:206:app/components/SidebarToolbar.tsx
      {/* Square Cover Tool */}
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isSquareToolLocked) {
            return;
          }
          squareToolPressStartRef.current = Date.now();
          squareToolLongPressDetectedRef.current = false;
          squareToolPressTimerRef.current = setTimeout(() => {
            squareToolLongPressDetectedRef.current = true;
            onSquareToolLockToggle();
            ...
          }, 500);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          if (squareToolPressTimerRef.current) {
            clearTimeout(squareToolPressTimerRef.current);
            squareToolPressTimerRef.current = null;
          }
          if (squareToolLongPressDetectedRef.current) {
            squareToolLongPressDetectedRef.current = false;
            squareToolPressStartRef.current = null;
            return;
          }
          if (isSquareToolLocked) {
            onSquareToolLockToggle();
            ...
          }
          const pressDuration = squareToolPressStartRef.current
            ? Date.now() - squareToolPressStartRef.current
            : 0;
          if (pressDuration < 500) {
            onSquareToolToggle();
          }
          squareToolPressStartRef.current = null;
          squareToolLongPressDetectedRef.current = false;
        }}
        className={`backdrop-blur-sm rounded-lg p-3 shadow-lg border text-white transition-all ${
          isSquareToolActive
            ? isSquareToolLocked
              ? "bg-blue-700/90 border-blue-500 hover:bg-blue-800/90"
              : "bg-blue-600/90 border-blue-400 hover:bg-blue-700/90"
            : "bg-black/80 border-white/20 hover:bg-black/90"
        }`}
        title={
          isSquareToolLocked
            ? "Square tool locked - click to unlock"
            : "Click to create one square, hold for 0.5s to lock"
        }
      >
        <svg ... />
      </button>
```

### Mobile surface (players)

The mobile canvas embraces zooming, pinching, and Hammer.js gesture recognition, auto-centering on the player’s token whenever they stop interacting. It renders draggable tokens inside a transformed wrapper so finger movement feels 1:1 even when zoomed, and reuses the same `TokenManager` for other participants.

```269:337:app/components/MapViewMobile/index.tsx
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      style={{
        touchAction: "none",
        userSelect: "none",
        ...
      }}
    >
      <div style={mapWrapperStyle}>
        <MapImage onLoad={updateBounds} />
        <CoverManager
          covers={covers}
          imageBounds={imageBounds}
          worldMapWidth={worldMapWidth}
          worldMapHeight={worldMapHeight}
        />
        {imageBounds && !isGridLoading && !settingsLoading && gridData && (
          <GridLines
            gridData={effectiveGridData}
            imageBounds={imageBounds}
            gridScale={displaySettings.gridScale}
            gridOffsetX={displaySettings.gridOffsetX}
            gridOffsetY={displaySettings.gridOffsetY}
          />
        )}
        {imageBounds && myUserId && (
          <div data-token>
            <DraggableToken
              tokenId={myUserId}
              position={myPosition}
              color={myColor}
              ...
              transform={transform as TransformConfig}
              onDragStateChange={handleDragStateChange}
              zIndex={20}
            />
          </div>
        )}
        <TokenManager
          activeUsers={otherUsers}
          disconnectedUsers={disconnectedUsers}
          imageBounds={imageBounds}
          ...
          transform={transform as TransformConfig}
          onDragStateChange={handleDragStateChange}
        />
      </div>
    </div>
  );
```

### Shared interaction primitives

`TokenManager` hydrates all active/disconnected tokens as draggable circles (or fades them when their socket drops). DM-mode adds double-click/right-click removal affordances, while player-mode restricts interaction to the user’s own token.

```74:136:app/components/TokenManager.tsx
      {Array.from(activeUsers.values()).map((user) => {
        const userWithPersistentId = user as User & { persistentUserId?: string };
        const persistentUserId = userWithPersistentId.persistentUserId || user.id;
        const isTokenInteractive = isDisplay || user.id === myUserId;
        const tokenZIndex = user.id === myUserId ? 20 : 10;
        return (
          <DraggableToken
            key={user.id}
            tokenId={user.id}
            position={user.position}
            color={user.color}
            ...
            onPositionUpdate={onPositionUpdate}
            transform={transform}
            onDragStateChange={onDragStateChange}
            isInteractive={isTokenInteractive}
            zIndex={tokenZIndex}
          />
        );
      })}
      {Array.from(disconnectedUsers.values()).map((user) => {
        const isTokenInteractive = isDisplay;
        return (
          <DraggableToken
            key={user.id}
            tokenId={user.id}
            position={user.position}
            color={user.color}
            ...
            opacity={0.6}
            title={isDisplay ? "Disconnected - Double-click or right-click to remove" : "Disconnected"}
            ...
          />
        );
      })}
```

## Real-Time Collaboration Flow

1. **Handshake** – Each client emits `user-identify` immediately after connecting, including a stable `persistentUserId` saved to `localStorage` and a flag for display/mobile mode. The server restores colors/positions for returning tokens and keeps a disconnected cache so the DM can still remove stale markers even if the socket is gone.
2. **Position updates** – Dragging a token emits `position-update` events with `{ tokenId, position }`. The server applies them to whichever token is referenced (supporting DM overrides) and broadcasts `user-moved`.
3. **Token lifecycle** – Display mode can spawn anonymous tokens (`add-token`), or remove players by `persistentUserId` (`remove-token`), and the client keeps both active + disconnected maps in sync.
4. **Covers** – Rectangles are treated similarly with `add-cover`, `remove-cover`, `update-cover`, and broadcast `cover-*` events.
5. **State reset** – Because user and cover maps live in-memory, restarting the Node process clears them; persistent data (maps, grid offsets) stays in Supabase.

See `server.js` and `app/hooks/useSocket.ts` in the previous snippets for the canonical event list. When scaling beyond a single instance, plug the bundled `@socket.io/redis-adapter` + `ioredis` dependencies into `server.js` to fan out presence state.

## Data & Persistence

- **Supabase tables**
  - `map_settings`: single-record table storing the live grid scale + offsets that every client subscribes to.
  - `battlemaps` + `battlemap_covers`: canonical list of map assets, metadata, and persisted cover rectangles.
  - All tables enable Row-Level Security (currently permissive) and timestamp triggers in `migrations/001_*.sql` and `002_*.sql`.

```4:56:migrations/002_create_battlemaps.sql
CREATE TABLE IF NOT EXISTS battlemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Battlemap',
  map_path TEXT,
  grid_scale DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  grid_offset_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  grid_offset_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  grid_data JSONB NOT NULL DEFAULT '{
    "verticalLines": [],
    "horizontalLines": [],
    "imageWidth": 0,
    "imageHeight": 0
  }',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battlemap_covers (
  id TEXT PRIMARY KEY,
  battlemap_id UUID NOT NULL REFERENCES battlemaps(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION NOT NULL DEFAULT 0,
  height DOUBLE PRECISION NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#808080',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

- **Grid settings** – `useSettings` loads/saves the latest grid parameters via Supabase and debounces writes so slider drags don’t spam the API.

```1:55:app/hooks/useSettings.ts
export const useSettings = () => {
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  ...
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('map_settings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        ...
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);
  ...
};
```

- **Battlemap provider** – `BattlemapProvider` (currently wired for management UI) handles listing maps, seeding a default entry, updating names/paths, and reloading covers for a selected map.

```123:213:app/providers/BattlemapProvider.tsx
  const seedDefaultBattlemap = useCallback(async (): Promise<BattlemapSummary | null> => {
    if (seedingDefaultBattlemapRef.current) {
      return null;
    }
    seedingDefaultBattlemapRef.current = true;
    try {
      const { data, error: insertError } = await supabase
        .from("battlemaps")
        .insert({
          name: DEFAULT_BATTLEMAP_NAME,
          map_path: DEFAULT_BATTLEMAP_MAP_PATH,
          grid_scale: DEFAULT_SETTINGS.gridScale,
          grid_offset_x: DEFAULT_SETTINGS.gridOffsetX,
          grid_offset_y: DEFAULT_SETTINGS.gridOffsetY,
          grid_data: initialGridData,
        })
        .select("id, name, map_path")
        .maybeSingle();
      ...
    } finally {
      seedingDefaultBattlemapRef.current = false;
    }
  }, []);

  const loadBattlemaps = useCallback(async () => {
    setIsListLoading(true);
    const { data } = await supabase
      .from("battlemaps")
      .select("id, name, map_path")
      .order("created_at", { ascending: true });
    ...
  }, [seedDefaultBattlemap]);
```

## API Surface

- **`GET /api/gridlines`** – Reads a map image from `public/maps`, runs Sobel edge detection (via `sharp`), infers square spacing, then emits normalized grid coordinates + metadata. When detection fails it returns an empty default to keep the UI responsive.

```1:66:app/api/gridlines/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
...
async function detectGridLines(imagePath: string): Promise<GridData> {
  const imageBuffer = readFileSync(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const grayscale = await sharp(imageBuffer)
    .greyscale()
    .normalize()
    .toBuffer();
  const edgeData = await applySobelEdgeDetection(grayscale, width, height);
  const verticalLineCandidates = detectVerticalLines(edgeData, width, height);
  const horizontalLineCandidates = detectHorizontalLines(edgeData, width, height);
  ...
}
```

- **`POST /api/map-upload`** – Accepts a `FormData` payload (`file`, `battlemapId`), validates size/type, uploads to the configured Supabase Storage bucket, and returns the public URL so `battlemaps.map_path` can point at CDN-safe assets.

```1:75:app/api/map-upload/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";

const DEFAULT_BUCKET = process.env.SUPABASE_MAPS_BUCKET || "maps";
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_UPLOAD_BYTES = Number(process.env.MAP_UPLOAD_MAX_BYTES) || DEFAULT_MAX_UPLOAD_BYTES;
...
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const battlemapId = formData.get("battlemapId");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  ...
  const supabase = getSupabaseServerClient();
  const uploadResult = await supabase.storage.from(DEFAULT_BUCKET).upload(objectPath, buffer, {
    contentType: file.type || `image/${extension}`,
    upsert: false,
  });
  ...
}
```

- **Status endpoint** – per ops guidelines we still need a lightweight `/api/status` that checks Next render, socket reachability, Supabase auth, and storage. Add it when hardening the deployment.

## Environment & Configuration

| Variable                                                   | Required                    | Description                                                                                                 |
| ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` | ✅                          | Client-side Supabase credentials used by `useSettings` and future public queries.                         |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`            | ✅ (server)                 | Full-access keys for API routes and uploads (`lib/supabaseServer`).                                       |
| `SUPABASE_PROJECT_URL`, `SUPABASE_KEY`                 | optional fallbacks          | Legacy names accepted by both Supabase clients.                                                             |
| `SUPABASE_MAPS_BUCKET`                                   | optional (default `maps`) | Object storage bucket storing uploaded battlemaps.                                                          |
| `MAP_UPLOAD_MAX_BYTES`                                   | optional                    | Override max upload size (default 10 MiB).                                                                 |
| `NEXT_PUBLIC_WS_URL`                                     | optional                    | Forces clients to connect to a specific Socket.IO origin (fallback is `window.location.origin`).          |
| `PORT`                                                   | optional                    | Port for `server.js` (`3000` default).                                                                  |
| `DAGOR_URL`                                              | ✅ in production            | Store the deployed Vercel URL so other services (and `NEXT_PUBLIC_WS_URL`) can reference it consistently. |
| `SUPABASE_MAPS_BUCKET`, `MAP_UPLOAD_MAX_BYTES`         | optional                    | Tune upload destination/limits.                                                                             |

The Supabase clients enforce these variables at import time:

```1:10:app/utils/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY)');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

## Local Development

1. **Prerequisites** – Install Node 20+, npm 10+, and ensure `brew install vips` (or OS equivalent) so `sharp` can run the gridline detector locally.
2. **Supabase** – Create a project (or run `supabase start` locally), then apply the SQL in `migrations/001_create_map_settings.sql` and `migrations/002_create_battlemaps.sql` via `psql` or the Supabase SQL console.
3. **Environment** – Create `.env.local` with at least: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MAPS_BUCKET=maps`, `PORT=3000`, and optionally `NEXT_PUBLIC_WS_URL=http://localhost:3000`.
4. **Install dependencies** – `npm install`.
5. **Run the combined server** – `npm run dev` launches `node server.js`, which boots Next.js and Socket.IO on the same port. Use `npm run dev:next` only when you explicitly do not need websockets.
6. **Lint** – `npm run lint` (ESLint 9) keeps hooks/components tidy.

```1:35:package.json
{
  "name": "dagor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "dev:next": "next dev",
    "build": "next build",
    "start": "NODE_ENV=production node server.js",
    "lint": "eslint"
  },
  "dependencies": {
    "@react-three/fiber": "^9.4.0",
    "@react-three/postprocessing": "^3.0.4",
    "@socket.io/redis-adapter": "^8.2.1",
    "@supabase/supabase-js": "^2.80.0",
    ...
  }
}
```

Tip: when testing from real devices on the same LAN, set `NEXT_PUBLIC_WS_URL` to your machine IP (`http://192.168.x.x:3000`) so phones can reach the dev socket.

## Supabase & Data Migrations

1. **Apply SQL** – `psql $SUPABASE_URL < migrations/001_create_map_settings.sql` and `psql ... < migrations/002_create_battlemaps.sql`, or paste the files into the Supabase SQL editor.
2. **Seed default battlemap** – the migration already inserts one row if the table is empty, and `BattlemapProvider` can seed again in-app if necessary.
3. **Storage** – Create a `maps` bucket (or rename + update `SUPABASE_MAPS_BUCKET`) and mark it public if you want direct asset URLs; otherwise proxy through signed URLs.

## Deployment

- **Platform** – Ship to Vercel (per project requirement) or any Node host that can run `node server.js`. Vercel’s Build Output API / `vercel deploy --prebuilt` can run the custom server as a single `Node.js` runtime, enabling websockets.
- **Build command** – `npm install && npm run build`.
- **Start command** – `npm run start` (which sets `NODE_ENV=production` and runs the same socket-aware server).
- **Environment** – Configure all variables listed above. Set `NEXT_PUBLIC_WS_URL` to `https://your-daggor-domain` (often the same as `DAGOR_URL`) so clients use the production hostname even when proxied behind Vercel.
- **Certificates / HTTPS** – Because sockets upgrade on the same origin, no extra configuration is necessary once the site is served via HTTPS.
- **No Cloud Run** – This project is not targeting Google Cloud Run; keep the deployment pipeline focused on Vercel or another long-lived Node host.

## Testing & Quality

- `npm run lint` before commits to catch hook or TypeScript mistakes.
- Manual flows to verify before merging:
  - Drag tokens (DM and player) and confirm positions propagate to all devices.
  - Upload a new map via `BattlemapManager`, confirm Supabase storage updates, and that gridlines recompute.
  - Draw covers with the square tool (single draw and locked multi-draw).
  - Use a phone to pinch/zoom in mobile view to ensure Hammer.js gestures still feel natural.
  - Restart the Node server to ensure reconnection/resurrection flows work as expected.

## Troubleshooting & Tips

- **Gridline detection errors** – Ensure `sharp` native deps (`libvips`) are installed. If detection keeps failing (e.g., due to high-contrast art), the API returns an empty grid so tokens fall back to 5 % sizing; adjust manually with the grid slider.
- **Sockets won’t connect** – Double-check `NEXT_PUBLIC_WS_URL` and CORS; connection errors appear in both the server logs and the browser console via `useSocket`.
- **Supabase auth errors** – Missing service keys throw during import time (see `lib/supabaseServer.js`); set all required variables before running the dev server.
- **Map uploads fail** – Files larger than `MAP_UPLOAD_MAX_BYTES` or disallowed MIME types (PNG/JPEG/WebP/GIF/SVG only) are rejected by `/api/map-upload`.
- **State resets on deploy** – Users, tokens, and covers are stored in-memory on the Node process. Persist critical data (e.g., tokens) to Supabase if you need durability across restarts.
- **Status endpoint** – Add a `/api/status` route that checks Next renderability, database connectivity, and socket liveness to satisfy the ops guideline (“status of all parts of the webapp”).
- **Mobile drift** – If tokens appear to drift when zoomed, ensure `useHammerGestures` is only active when no token drag is in progress (already handled by `draggingTokenIdRef`).

With this overview you should be able to jump into any portion of the stack—UI controls, realtime contracts, Supabase models, or deployment—and make confident changes quickly. Ping the team if you need the current `DAGOR_URL` value or Supabase keys. Happy hacking!
