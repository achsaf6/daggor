import 'dotenv/config';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import next from 'next';
import { getSupabaseServerClient } from './lib/supabaseServer.js';
import {
  DEFAULT_BATTLEMAP_NAME,
  DEFAULT_BATTLEMAP_MAP_PATH,
  DEFAULT_BATTLEMAP_GRID_DATA,
  createDefaultGridData,
} from './lib/defaultBattlemap.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const supabase = getSupabaseServerClient();

const DEFAULT_SETTINGS = {
  gridScale: 1,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

const VALID_TOKEN_SIZES = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
const DEFAULT_TOKEN_SIZE = "medium";
const sanitizeTokenSize = (value) =>
  typeof value === "string" && VALID_TOKEN_SIZES.has(value) ? value : DEFAULT_TOKEN_SIZE;

const battlemapState = {
  order: [],
  maps: new Map(),
  activeBattlemapId: null,
};

// Schema capability flags (set during initial load; also used for best-effort fallbacks)
let supportsBattlemapImages = false;
let supportsBattlemapActiveImageId = true; // optimistic; will be disabled if column missing
let supportsBattlemapCoverImageId = false;
let supportsBattlemapSpawnArea = true; // optimistic; disabled if migration 008 not applied

// supabase-js resolves with `{ data, error }` instead of rejecting on DB errors,
// so background persistence used to swallow failures silently. This wrapper
// turns `{ error }` into a thrown exception so `runBackgroundTask`'s catch logs it.
const throwIfSupabaseError = ({ error }) => {
  if (error) throw error;
};

const persistBattlemapOrder = async (orderedIds) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return;
  }

  const results = await Promise.all(
    orderedIds.map((battlemapId, index) =>
      supabase.from('battlemaps').update({ sort_index: index }).eq('id', battlemapId)
    )
  );
  for (const result of results) throwIfSupabaseError(result);
};

const getDefaultBattlemapId = () => {
  for (const id of battlemapState.order) {
    const battlemap = battlemapState.maps.get(id);
    if (battlemap && battlemap.mapPath === DEFAULT_BATTLEMAP_MAP_PATH) {
      return id;
    }
  }
  return null;
};

const sanitizeGridData = (input) => {
  const fallback = createDefaultGridData();

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const candidate = input;
  const verticalLines =
    Array.isArray(candidate.verticalLines) && candidate.verticalLines.length > 0
      ? [...candidate.verticalLines]
      : [...fallback.verticalLines];
  const horizontalLines =
    Array.isArray(candidate.horizontalLines) && candidate.horizontalLines.length > 0
      ? [...candidate.horizontalLines]
      : [...fallback.horizontalLines];
  const imageWidth =
    typeof candidate.imageWidth === 'number' && candidate.imageWidth > 0
      ? candidate.imageWidth
      : fallback.imageWidth;
  const imageHeight =
    typeof candidate.imageHeight === 'number' && candidate.imageHeight > 0
      ? candidate.imageHeight
      : fallback.imageHeight;

  return {
    verticalLines,
    horizontalLines,
    imageWidth,
    imageHeight,
  };
};

const cloneGridData = (gridData = DEFAULT_BATTLEMAP_GRID_DATA) => sanitizeGridData(gridData);

const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const sanitizeHexColor = (value, fallback = '#808080') => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
};

// Reject non-finite numbers and clamp to [0, 100] image-relative %.
const sanitizePositionComponent = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clampValue(value, 0, 100);
};

const sanitizePosition = (input, fallback = { x: 50, y: 50 }) => {
  if (!input || typeof input !== 'object') return { ...fallback };
  const x = sanitizePositionComponent(input.x);
  const y = sanitizePositionComponent(input.y);
  if (x === null || y === null) return { ...fallback };
  return { x, y };
};

// Block data:, file:, javascript:, vbscript:, embedded nulls, and anything over 2 KiB.
// Accept http(s) URLs and relative paths starting with '/'.
const MAX_URL_LENGTH = 2048;
const BLOCKED_URL_SCHEMES = /^(?:data|file|javascript|vbscript|blob):/i;
const sanitizeAssetUrl = (value) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_URL_LENGTH) return null;
  if (trimmed.includes('\0') || trimmed.includes('\n') || trimmed.includes('\r')) return null;
  if (BLOCKED_URL_SCHEMES.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
};

// A spawn area is a rectangle in image-relative % coordinates ({x, y, width,
// height}, all 0..100). Returns the default 20x20 centred square if anything
// is malformed.
const DEFAULT_SPAWN_AREA = { x: 40, y: 40, width: 20, height: 20 };
const sanitizeSpawnArea = (input) => {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SPAWN_AREA };
  const width = clampValue(typeof input.width === 'number' ? input.width : DEFAULT_SPAWN_AREA.width, 1, 100);
  const height = clampValue(typeof input.height === 'number' ? input.height : DEFAULT_SPAWN_AREA.height, 1, 100);
  const maxX = 100 - width;
  const maxY = 100 - height;
  return {
    x: clampValue(typeof input.x === 'number' ? input.x : DEFAULT_SPAWN_AREA.x, 0, maxX),
    y: clampValue(typeof input.y === 'number' ? input.y : DEFAULT_SPAWN_AREA.y, 0, maxY),
    width,
    height,
  };
};

// Pick `count` distinct spawn positions inside the rectangle. Cells are laid
// out in a grid that is roughly square so 1, 2, 4, 9 players space out
// naturally. Returns image-relative {x, y} centres.
const pickSpawnPositions = (spawnArea, count) => {
  if (count <= 0) return [];
  const area = sanitizeSpawnArea(spawnArea);
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = area.width / cols;
  const cellH = area.height / rows;
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: area.x + cellW * (col + 0.5),
      y: area.y + cellH * (row + 0.5),
    });
  }
  return positions;
};

// Fog of war "reveal" shape: a rectangle (in image-relative %) that the DM
// drew to expose part of the map. Fog is the inverse — the renderer covers
// everything except the union of these shapes.
const sanitizeFogShape = (input) => {
  if (!input || typeof input !== 'object') return null;
  const x = sanitizePositionComponent(input.x);
  const y = sanitizePositionComponent(input.y);
  const w = clampValue(typeof input.width === 'number' ? input.width : 0, 0, 100);
  const h = clampValue(typeof input.height === 'number' ? input.height : 0, 0, 100);
  if (x === null || y === null || w < 0.5 || h < 0.5) return null;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    x: clampValue(x, 0, 100 - w),
    y: clampValue(y, 0, 100 - h),
    width: w,
    height: h,
  };
};

const sanitizeCover = (input) => {
  const width = clampValue(typeof input.width === 'number' ? input.width : 0, 0, 100);
  const height = clampValue(typeof input.height === 'number' ? input.height : 0, 0, 100);
  const maxX = 100 - width;
  const maxY = 100 - height;

  return {
    id: input.id,
    width,
    height,
    x: clampValue(typeof input.x === 'number' ? input.x : 0, 0, maxX),
    y: clampValue(typeof input.y === 'number' ? input.y : 0, 0, maxY),
    color: sanitizeHexColor(input.color),
  };
};

const generateCoverId = () => randomUUID();

const serializeBattlemapSummary = (battlemap) => ({
  id: battlemap.id,
  name: battlemap.name,
  mapPath: battlemap.mapPath,
});

const getBattlemapCoversForActiveImage = (battlemap) => {
  const coversMap = battlemap?.covers instanceof Map ? battlemap.covers : new Map();

  // Migrated schema: we store covers with a private _imageId marker and only expose the active image covers.
  if (supportsBattlemapCoverImageId && battlemap?.activeImageId) {
    const result = [];
    for (const value of coversMap.values()) {
      if (value && (value._imageId === battlemap.activeImageId || !value._imageId)) {
        // Strip internal marker before sending to clients
        const { _imageId, ...rest } = value;
        result.push(rest);
      }
    }
    return result;
  }

  // Legacy schema: covers are battlemap-wide
  return Array.from(coversMap.values());
};

const getFogShapesForActiveImage = (battlemap) => {
  if (!battlemap?.fogByImage || !battlemap?.activeImageId) return [];
  const arr = battlemap.fogByImage[battlemap.activeImageId];
  return Array.isArray(arr) ? arr : [];
};

const serializeBattlemap = (battlemap) => ({
  id: battlemap.id,
  name: battlemap.name,
  mapPath: battlemap.mapPath,
  images: Array.isArray(battlemap.images) ? battlemap.images : [],
  activeImageId: battlemap.activeImageId ?? null,
  gridScale: battlemap.gridScale,
  gridOffsetX: battlemap.gridOffsetX,
  gridOffsetY: battlemap.gridOffsetY,
  gridData: battlemap.gridData,
  spawnArea: sanitizeSpawnArea(battlemap.spawnArea),
  fogShapes: getFogShapesForActiveImage(battlemap),
});

const logEvent = (...args) => {
  console.log('[Battlemap]', ...args);
};

const loadBattlemapStateFromSupabase = async () => {
  logEvent('Loading battlemaps from Supabase…');
  let { data: battlemapRows, error } = await supabase
    .from('battlemaps')
    .select(
      `
        id,
        name,
        map_path,
        active_image_id,
        grid_scale,
        grid_offset_x,
        grid_offset_y,
        grid_data,
        spawn_area,
        sort_index
      `
    )
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    // Older schemas might not have active_image_id and/or spawn_area; retry
    // dropping whichever column is reported as missing.
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message.includes('active_image_id') || message.includes('spawn_area')) {
      if (message.includes('active_image_id')) supportsBattlemapActiveImageId = false;
      if (message.includes('spawn_area')) supportsBattlemapSpawnArea = false;
      const retryColumns = [
        'id',
        'name',
        'map_path',
        supportsBattlemapActiveImageId ? 'active_image_id' : null,
        'grid_scale',
        'grid_offset_x',
        'grid_offset_y',
        'grid_data',
        supportsBattlemapSpawnArea ? 'spawn_area' : null,
        'sort_index',
      ].filter(Boolean).join(',\n            ');
      const retry = await supabase
        .from('battlemaps')
        .select(retryColumns)
        .order('sort_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (retry.error) {
        // If the second column is missing too, retry once more without it.
        const m = typeof retry.error?.message === 'string' ? retry.error.message : '';
        if (m.includes('spawn_area')) {
          supportsBattlemapSpawnArea = false;
          const retry2 = await supabase
            .from('battlemaps')
            .select(`id, name, map_path, grid_scale, grid_offset_x, grid_offset_y, grid_data, sort_index`)
            .order('sort_index', { ascending: true })
            .order('created_at', { ascending: true });
          if (retry2.error) throw retry2.error;
          battlemapRows = retry2.data;
        } else {
          throw retry.error;
        }
      } else {
        battlemapRows = retry.data;
      }
    } else {
      throw error;
    }
  }

  if (!battlemapRows || battlemapRows.length === 0) {
    const { data: created, error: seedError } = await supabase
      .from('battlemaps')
      .insert({
        name: DEFAULT_BATTLEMAP_NAME,
        map_path: DEFAULT_BATTLEMAP_MAP_PATH,
        grid_scale: DEFAULT_SETTINGS.gridScale,
        grid_offset_x: DEFAULT_SETTINGS.gridOffsetX,
        grid_offset_y: DEFAULT_SETTINGS.gridOffsetY,
        grid_data: DEFAULT_BATTLEMAP_GRID_DATA,
        sort_index: 0,
      })
      .select(
        `
          id,
          name,
          map_path,
          grid_scale,
          grid_offset_x,
          grid_offset_y,
          grid_data
        `
      )
      .single();

    if (seedError) {
      throw seedError;
    }

    battlemapRows = created ? [created] : [];
  }

  // Attempt to load floors/images (battlemap_images). If table doesn't exist yet, we fall back to legacy single-image mode.
  let imageRows = null;
  supportsBattlemapImages = true;
  const imagesResult = await supabase
    .from('battlemap_images')
    .select('id, battlemap_id, name, map_path, sort_index, created_at')
    .order('battlemap_id', { ascending: true })
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (imagesResult.error) {
    const message = typeof imagesResult.error?.message === 'string' ? imagesResult.error.message : '';
    supportsBattlemapImages = false;
    if (!message.includes('battlemap_images')) {
      // Unexpected error (not "relation does not exist") → surface it.
      throw imagesResult.error;
    }
  } else {
    imageRows = imagesResult.data ?? [];
  }

  // Attempt to load covers with floor scope. If the new column doesn't exist yet, fall back to legacy covers-per-battlemap.
  let coverRows = null;
  supportsBattlemapCoverImageId = true;
  const coversResult = await supabase
    .from('battlemap_covers')
    .select('id, battlemap_id, battlemap_image_id, x, y, width, height, color');
  if (coversResult.error) {
    const message = typeof coversResult.error?.message === 'string' ? coversResult.error.message : '';
    if (message.includes('battlemap_image_id')) {
      supportsBattlemapCoverImageId = false;
      const legacyCovers = await supabase
        .from('battlemap_covers')
        .select('id, battlemap_id, x, y, width, height, color');
      if (legacyCovers.error) {
        throw legacyCovers.error;
      }
      coverRows = legacyCovers.data ?? [];
    } else {
      throw coversResult.error;
    }
  } else {
    coverRows = coversResult.data ?? [];
  }

  battlemapState.order = [];
  battlemapState.maps.clear();

  for (const row of battlemapRows) {
    battlemapState.order.push(row.id);
    battlemapState.maps.set(row.id, {
      id: row.id,
      name: row.name ?? DEFAULT_BATTLEMAP_NAME,
      mapPath: row.map_path ?? null,
      images: [],
      activeImageId: supportsBattlemapActiveImageId ? row.active_image_id ?? null : null,
      gridScale: typeof row.grid_scale === 'number' ? row.grid_scale : DEFAULT_SETTINGS.gridScale,
      gridOffsetX:
        typeof row.grid_offset_x === 'number' ? row.grid_offset_x : DEFAULT_SETTINGS.gridOffsetX,
      gridOffsetY:
        typeof row.grid_offset_y === 'number' ? row.grid_offset_y : DEFAULT_SETTINGS.gridOffsetY,
      gridData: sanitizeGridData(row.grid_data),
      spawnArea: sanitizeSpawnArea(row.spawn_area),
      covers: new Map(),
    });
  }

  // Attach images (floors)
  if (supportsBattlemapImages && Array.isArray(imageRows)) {
    const byBattlemap = new Map();
    for (const image of imageRows) {
      if (!image?.battlemap_id) continue;
      const list = byBattlemap.get(image.battlemap_id) ?? [];
      list.push({
        id: image.id,
        name: image.name ?? 'Floor',
        mapPath: image.map_path ?? null,
        sortIndex: typeof image.sort_index === 'number' ? image.sort_index : 0,
      });
      byBattlemap.set(image.battlemap_id, list);
    }

    for (const [battlemapId, list] of byBattlemap.entries()) {
      const battlemap = battlemapState.maps.get(battlemapId);
      if (!battlemap) continue;
      battlemap.images = list.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
      if (!battlemap.activeImageId) {
        battlemap.activeImageId = battlemap.images[0]?.id ?? null;
      }
      // Keep legacy mapPath pointing at the active image for UI compatibility
      const activeImage = battlemap.images.find((img) => img.id === battlemap.activeImageId) ?? battlemap.images[0];
      battlemap.mapPath = activeImage?.mapPath ?? battlemap.mapPath ?? null;
    }
  } else {
    // Legacy: represent the single map_path as a single implicit image (no persisted id)
    for (const id of battlemapState.order) {
      const battlemap = battlemapState.maps.get(id);
      if (!battlemap) continue;
      battlemap.images = [];
      battlemap.activeImageId = null;
    }
  }

  // Attach covers (scoped to an image when available)
  for (const cover of coverRows || []) {
    const parent = battlemapState.maps.get(cover.battlemap_id);
    if (!parent) continue;

    // If cover has an image id, but the parent has no images loaded (shouldn't happen in migrated schema),
    // fall back to battlemap-level covers.
    if (supportsBattlemapCoverImageId && cover.battlemap_image_id) {
      if (!parent.images || parent.images.length === 0) {
        parent.covers.set(cover.id, sanitizeCover({ ...cover, id: cover.id }));
        continue;
      }

      // Only store covers for active image in-memory? We keep all covers but filter on serialize.
      // Store as a composite key in-memory to avoid collisions across floors.
      const compositeId = `${cover.battlemap_image_id}:${cover.id}`;
      parent.covers.set(compositeId, { ...sanitizeCover({ ...cover, id: cover.id }), _imageId: cover.battlemap_image_id });
      continue;
    }

    parent.covers.set(cover.id, sanitizeCover({ ...cover, id: cover.id }));
  }

  logEvent(
    `Loaded ${battlemapState.order.length} battlemaps`,
    `(${coverRows?.length ?? 0} covers)`
  );

  battlemapState.activeBattlemapId =
    getDefaultBattlemapId() ?? battlemapState.order[0] ?? null;
  logEvent('Initial active battlemap', battlemapState.activeBattlemapId ?? 'none');
};

// Store connected users (in-memory)
const users = new Map();
// Store disconnected users temporarily to restore on reconnect (in-memory)
const disconnectedUsers = new Map();

// Generate random color
function getRandomColor() {
  const colors = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

app.prepare().then(async () => {
  try {
    await loadBattlemapStateFromSupabase();
  } catch (error) {
    console.error('Failed to load battlemap state from Supabase', error);
    process.exit(1);
  }
  // Create HTTP server with Next.js handler
  const httpServer = createServer(handler);
  
  // Create Socket.IO server
  const io = new Server(httpServer);

  // Evict disconnected users that have been gone longer than the TTL so the
  // in-memory map does not grow unbounded over a long session.
  const DISCONNECTED_USER_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const DISCONNECTED_USER_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - DISCONNECTED_USER_TTL_MS;
    for (const [persistentId, entry] of disconnectedUsers.entries()) {
      const since = typeof entry?.disconnectedAt === 'number' ? entry.disconnectedAt : 0;
      if (since && since < cutoff) {
        disconnectedUsers.delete(persistentId);
        io.emit('token-removed', { persistentUserId: persistentId });
      }
    }
  }, DISCONNECTED_USER_SWEEP_INTERVAL_MS).unref();

  const runBackgroundTask = (description, task) => {
    setImmediate(() => {
      Promise.resolve()
        .then(task)
        .catch((err) => {
          console.error(`[Battlemap Persistence] ${description} failed`, err);
        });
    });
  };

  const broadcastBattlemapList = () => {
    const summaries = battlemapState.order
      .map((id) => battlemapState.maps.get(id))
      .filter(Boolean)
      .map((battlemap) => serializeBattlemapSummary(battlemap));
    logEvent('Broadcasting battlemap list', summaries.map((item) => item.id));
    io.emit('battlemap:list', summaries);
  };

  const broadcastActiveBattlemap = () => {
    logEvent('Broadcasting active battlemap', battlemapState.activeBattlemapId ?? 'none');
    io.emit('battlemap:active', { battlemapId: battlemapState.activeBattlemapId });
  };

  // Per-battlemap broadcast helper. Token moves, cover edits, presence — anything
  // that only matters to clients viewing the same map — should fan out via this
  // helper instead of io.emit so we can scope to the room. Keeps `battlemap:list`
  // and friends on io.emit since every client needs them regardless of room.
  const battlemapRoom = (battlemapId) =>
    battlemapId ? `bm:${battlemapId}` : null;
  const broadcastToActive = (event, payload) => {
    const room = battlemapRoom(battlemapState.activeBattlemapId);
    if (room) {
      io.to(room).emit(event, payload);
    } else {
      io.emit(event, payload);
    }
  };
  // socket.broadcast.emit equivalent that is also room-scoped (excludes sender).
  const broadcastFromSocketToActive = (originSocket, event, payload) => {
    const room = battlemapRoom(battlemapState.activeBattlemapId);
    if (room) {
      originSocket.to(room).emit(event, payload);
    } else {
      originSocket.broadcast.emit(event, payload);
    }
  };

  // ---------------- Initiative tracker (outer-scope helpers) ----------------
  // In-memory only; lives on each battlemap so a map switch wipes it (matches
  // the "scene reset" model). Order is DM-authoritative — auto-population
  // appends in arrival order, reorders shuffle in place; we deliberately do
  // NOT sort by score on broadcast (score is informational, not authoritative).
  const ensureInitiativeState = (battlemap) => {
    if (!battlemap.initiative) {
      battlemap.initiative = { entries: [], currentIndex: -1, round: 0 };
    }
    return battlemap.initiative;
  };
  const sanitizeInitiativeEntry = (e) => {
    if (!e || typeof e !== 'object') return null;
    const tokenId = typeof e.tokenId === 'string' ? e.tokenId.trim() : '';
    if (!tokenId) return null;
    const score = typeof e.score === 'number' && Number.isFinite(e.score) ? e.score : 0;
    const name = typeof e.name === 'string' ? e.name.slice(0, 40) : '';
    return { tokenId, score, name };
  };
  const broadcastInitiative = (battlemap) => {
    const state = ensureInitiativeState(battlemap);
    broadcastToActive('initiative:updated', {
      battlemapId: battlemap.id,
      entries: state.entries,
      currentIndex: state.currentIndex,
      round: state.round,
    });
  };
  // tokenId is the persistentUserId (stable across socket reconnects for
  // players, the generated persistent id for NPCs).
  const ensureInitiativeMember = (battlemap, tokenId, name) => {
    if (!battlemap || !tokenId) return false;
    const state = ensureInitiativeState(battlemap);
    const existing = state.entries.find((e) => e.tokenId === tokenId);
    if (existing) {
      if (typeof name === 'string' && name && existing.name !== name) {
        existing.name = name.slice(0, 40);
        return true;
      }
      return false;
    }
    state.entries.push({ tokenId, score: 0, name: typeof name === 'string' ? name.slice(0, 40) : '' });
    if (state.currentIndex < 0) {
      state.currentIndex = 0;
      state.round = 1;
    }
    return true;
  };
  const removeInitiativeMember = (battlemap, tokenId) => {
    if (!battlemap || !tokenId) return false;
    const state = ensureInitiativeState(battlemap);
    const idx = state.entries.findIndex((e) => e.tokenId === tokenId);
    if (idx < 0) return false;
    state.entries.splice(idx, 1);
    if (state.entries.length === 0) {
      state.currentIndex = -1;
      state.round = 0;
    } else if (idx < state.currentIndex) {
      state.currentIndex -= 1;
    } else if (state.currentIndex >= state.entries.length) {
      state.currentIndex = 0;
    }
    return true;
  };
  const renameInitiativeMember = (battlemap, tokenId, name) => {
    if (!battlemap || !tokenId) return false;
    const state = ensureInitiativeState(battlemap);
    const entry = state.entries.find((e) => e.tokenId === tokenId);
    if (!entry) return false;
    const next = typeof name === 'string' ? name.slice(0, 40) : '';
    if (entry.name === next) return false;
    entry.name = next;
    return true;
  };
  // Reorder existing entries by tokenId list. Unknown ids are ignored,
  // missing ids drop to the end so partial reorders are tolerable.
  const reorderInitiative = (battlemap, orderedTokenIds) => {
    if (!battlemap || !Array.isArray(orderedTokenIds)) return false;
    const state = ensureInitiativeState(battlemap);
    if (state.entries.length === 0) return false;
    const byId = new Map(state.entries.map((e) => [e.tokenId, e]));
    const seen = new Set();
    const next = [];
    for (const id of orderedTokenIds) {
      if (typeof id !== 'string') continue;
      const entry = byId.get(id);
      if (!entry || seen.has(id)) continue;
      next.push(entry);
      seen.add(id);
    }
    for (const entry of state.entries) {
      if (!seen.has(entry.tokenId)) next.push(entry);
    }
    if (next.length === state.entries.length && next.every((e, i) => e === state.entries[i])) {
      return false;
    }
    state.entries = next;
    if (state.currentIndex >= 0 && state.currentIndex < state.entries.length) {
      // currentIndex may now point at a different entry — leave the cursor
      // where the DM left it (acting on position, not identity).
    }
    return true;
  };
  const setInitiativeScore = (battlemap, tokenId, score) => {
    if (!battlemap || !tokenId) return false;
    const state = ensureInitiativeState(battlemap);
    const entry = state.entries.find((e) => e.tokenId === tokenId);
    if (!entry) return false;
    const next = typeof score === 'number' && Number.isFinite(score) ? score : 0;
    if (entry.score === next) return false;
    entry.score = next;
    return true;
  };
  const mutateActiveInitiative = (mutator) => {
    const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
    if (!battlemap) return;
    if (mutator(battlemap)) broadcastInitiative(battlemap);
  };

  // Drop every active token (player + DM-spawned) and every disconnected
  // entry, then re-seat connected, non-DM sockets into spawn-area cells on the
  // new active battlemap. Called when the active battlemap changes — players
  // should never carry their old position onto a new map.
  const resetTokensForActiveBattlemap = async () => {
    // 1. Tell everyone the old tokens are gone.
    for (const [, user] of users.entries()) {
      const persistentId = user.persistentUserId || user.id;
      broadcastToActive('token-removed', { persistentUserId: persistentId });
    }
    for (const persistentId of disconnectedUsers.keys()) {
      broadcastToActive('token-removed', { persistentUserId: persistentId });
    }
    users.clear();
    disconnectedUsers.clear();

    // 2. Re-seat each connected non-DM socket. Use spawn area from the new
    // battlemap, distributed across distinct cells.
    const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
    // Wipe any stale initiative state on the destination battlemap — entries
    // may reference persistentUserIds that aren't present anymore. The
    // re-seat loop below repopulates from currently-connected sockets.
    if (battlemap) {
      const initState = ensureInitiativeState(battlemap);
      initState.entries = [];
      initState.currentIndex = -1;
      initState.round = 0;
    }
    const spawnArea = sanitizeSpawnArea(battlemap?.spawnArea);
    let connectedSockets;
    try {
      connectedSockets = await io.fetchSockets();
    } catch (err) {
      console.error('[Battlemap reset] fetchSockets failed', err);
      return;
    }
    const playerSockets = connectedSockets.filter((s) => {
      // displayModeUsers and absent userData both mean "not a re-seatable
      // player". BattlemapProvider companion sockets are flagged
      // claimsPresence=false in initializeUser; without this they'd be
      // re-seated and a single player would end up with two tokens.
      if (displayModeUsers.has(s.id)) return false;
      if (s.data && s.data.claimsPresence === false) return false;
      return true;
    });
    const positions = pickSpawnPositions(spawnArea, playerSockets.length);

    playerSockets.forEach((s, i) => {
      const stored = users.get(s.id); // empty after clear; rely on _userData ref instead
      // We keep the per-socket persistent ID by re-running the identification
      // path: ask each socket to reidentify by emitting a short "respawn" hint.
      // Simpler: synthesise a fresh user entry with the same persistent ID we
      // can derive from the socket's stored ref (set in initializeUser).
      const persistentId = s.data?.persistentUserId || stored?.persistentUserId || s.id;
      const color = s.data?.color || getRandomColor();
      const size = sanitizeTokenSize(s.data?.size);
      const name = s.data?.name ?? null;
      const position = positions[i] ?? { x: 50, y: 50 };
      const userData = {
        id: s.id,
        persistentUserId: persistentId,
        color,
        position,
        size,
        imageSrc: s.data?.imageSrc || null,
        name,
        surface: s.data?.surface || 'mobile',
        isDisplay: false,
      };
      users.set(s.id, userData);
      // Remember on the socket so future reconnects can restore.
      s.data = { ...(s.data || {}), persistentUserId: persistentId, color, size, name };
      // Tell each player their own new position, and broadcast to others.
      s.emit('user-connected', {
        userId: s.id,
        persistentUserId: persistentId,
        color,
        position,
        imageSrc: userData.imageSrc,
        size,
        name,
      });
      broadcastFromSocketToActive(s, 'user-joined', {
        userId: s.id,
        persistentUserId: persistentId,
        color,
        position,
        imageSrc: userData.imageSrc,
        size,
        name,
      });
      // The new battlemap starts with an empty initiative tracker; seed each
      // re-seated player so the panel doesn't appear suddenly empty.
      if (battlemap) ensureInitiativeMember(battlemap, persistentId, name || '');
    });
    // Re-broadcast the full active list to each player so everyone sees the
    // freshly-seated cohort consistently.
    const activeList = Array.from(users.values()).filter((u) => !u.isDisplay);
    io.to(battlemapRoom(battlemapState.activeBattlemapId)).emit('all-users', activeList);
    if (battlemap) broadcastInitiative(battlemap);
  };

  // Move every connected socket from the old battlemap room to the new one.
  // Used when the DM switches the active battlemap.
  const moveSocketsToActiveBattlemapRoom = (previousId) => {
    const previousRoom = battlemapRoom(previousId);
    const nextRoom = battlemapRoom(battlemapState.activeBattlemapId);
    if (previousRoom && previousRoom !== nextRoom) {
      io.in(previousRoom).socketsLeave(previousRoom);
    }
    if (nextRoom) {
      // Have every connected socket join the new room. Future surfaces that
      // want per-client room targeting should opt in instead, but right now
      // there is only ever one active battlemap globally.
      io.fetchSockets().then((sockets) => {
        sockets.forEach((s) => s.join(nextRoom));
      }).catch((err) => {
        console.error('[Battlemap rooms] failed to migrate sockets', err);
      });
    }
  };

  const ensureActiveBattlemap = () => {
    if (
      battlemapState.activeBattlemapId &&
      battlemapState.maps.has(battlemapState.activeBattlemapId)
    ) {
      return;
    }
    battlemapState.activeBattlemapId =
      getDefaultBattlemapId() ?? battlemapState.order[0] ?? null;
  };

  const emitBattlemapUpdate = (battlemapId) => {
    const battlemap = battlemapState.maps.get(battlemapId);
    if (!battlemap) {
      return;
    }
    io.emit('battlemap:updated', serializeBattlemap(battlemap));
  };

  const emitBattlemapDeleted = (battlemapId) => {
    io.emit('battlemap:deleted', { battlemapId });
  };

  // `battlemaps.active_image_id` and `battlemap_images.battlemap_id` reference
  // each other (migration 007), so one side must be inserted with the FK null
  // and patched up after the dependent row exists. Callers creating a brand
  // new battlemap pass { skipActiveImage: true } and then re-issue
  // `updateBattlemapRow` once the image row has been inserted.
  const insertBattlemapRow = async (battlemap, sortIndex = 0, { skipActiveImage = false } = {}) => {
    const row = {
      id: battlemap.id,
      name: battlemap.name,
      map_path: battlemap.mapPath,
      grid_scale: battlemap.gridScale,
      grid_offset_x: battlemap.gridOffsetX,
      grid_offset_y: battlemap.gridOffsetY,
      grid_data: battlemap.gridData,
      sort_index: sortIndex,
    };
    if (supportsBattlemapActiveImageId) {
      row.active_image_id = skipActiveImage ? null : (battlemap.activeImageId ?? null);
    }
    if (supportsBattlemapSpawnArea) {
      row.spawn_area = sanitizeSpawnArea(battlemap.spawnArea);
    }
    throwIfSupabaseError(await supabase.from('battlemaps').insert(row));
  };

  const updateBattlemapRow = async (battlemapId) => {
    const battlemap = battlemapState.maps.get(battlemapId);
    if (!battlemap) return;

    const row = {
      name: battlemap.name,
      map_path: battlemap.mapPath,
      grid_scale: battlemap.gridScale,
      grid_offset_x: battlemap.gridOffsetX,
      grid_offset_y: battlemap.gridOffsetY,
      grid_data: battlemap.gridData,
      updated_at: new Date().toISOString(),
    };
    if (supportsBattlemapActiveImageId) {
      row.active_image_id = battlemap.activeImageId ?? null;
    }
    if (supportsBattlemapSpawnArea) {
      row.spawn_area = sanitizeSpawnArea(battlemap.spawnArea);
    }
    throwIfSupabaseError(await supabase.from('battlemaps').update(row).eq('id', battlemapId));
  };

  const deleteBattlemapRow = async (battlemapId) => {
    throwIfSupabaseError(await supabase.from('battlemaps').delete().eq('id', battlemapId));
  };

  const deleteCoversForBattlemap = async (battlemapId) => {
    throwIfSupabaseError(
      await supabase.from('battlemap_covers').delete().eq('battlemap_id', battlemapId)
    );
  };

  const upsertCoverRow = async (battlemapId, cover, battlemapImageId = null) => {
    const row = {
      id: cover.id,
      battlemap_id: battlemapId,
      x: cover.x,
      y: cover.y,
      width: cover.width,
      height: cover.height,
      color: cover.color,
    };
    if (supportsBattlemapCoverImageId) {
      row.battlemap_image_id = battlemapImageId;
    }
    throwIfSupabaseError(await supabase.from('battlemap_covers').upsert(row));
  };

  const deleteCoverRow = async (coverId) => {
    throwIfSupabaseError(await supabase.from('battlemap_covers').delete().eq('id', coverId));
  };

  const insertBattlemapImageRow = async (image) => {
    throwIfSupabaseError(
      await supabase.from('battlemap_images').insert({
        id: image.id,
        battlemap_id: image.battlemapId,
        name: image.name,
        map_path: image.mapPath,
        sort_index: image.sortIndex ?? 0,
      })
    );
  };

  const updateBattlemapImageRow = async (imageId, updates) => {
    throwIfSupabaseError(
      await supabase.from('battlemap_images').update(updates).eq('id', imageId)
    );
  };

  const deleteBattlemapImageRow = async (imageId) => {
    throwIfSupabaseError(await supabase.from('battlemap_images').delete().eq('id', imageId));
  };

  const getBattlemapImageById = (battlemap, imageId) => {
    if (!battlemap || !Array.isArray(battlemap.images)) return null;
    return battlemap.images.find((img) => img.id === imageId) ?? null;
  };

  const ensureBattlemapHasAtLeastOneImage = (battlemap) => {
    if (!supportsBattlemapImages || !battlemap) return;
    if (Array.isArray(battlemap.images) && battlemap.images.length > 0) {
      if (!battlemap.activeImageId) {
        battlemap.activeImageId = battlemap.images[0]?.id ?? null;
      }
      const active = getBattlemapImageById(battlemap, battlemap.activeImageId) ?? battlemap.images[0];
      battlemap.mapPath = active?.mapPath ?? battlemap.mapPath ?? null;
      return;
    }

    // Best-effort backfill in memory (and persist in background) if the table exists but has no rows.
    const imageId = randomUUID();
    const image = {
      id: imageId,
      battlemapId: battlemap.id,
      name: 'Floor 1',
      mapPath: battlemap.mapPath ?? null,
      sortIndex: 0,
    };
    battlemap.images = [image];
    battlemap.activeImageId = imageId;
    runBackgroundTask('backfill battlemap image', async () => {
      await insertBattlemapImageRow(image);
      if (supportsBattlemapActiveImageId) {
        await updateBattlemapRow(battlemap.id);
      }
    });
  };

  const findCoverEntry = (battlemap, coverId, imageId = null) => {
    const coversMap = battlemap?.covers instanceof Map ? battlemap.covers : null;
    if (!coversMap || !coverId) {
      return null;
    }

    if (supportsBattlemapCoverImageId) {
      const effectiveImageId = imageId ?? battlemap?.activeImageId ?? null;
      if (effectiveImageId) {
        const key = `${effectiveImageId}:${coverId}`;
        const existing = coversMap.get(key);
        if (existing) {
          return { key, existing, imageId: effectiveImageId };
        }
        // Fallback scan
        for (const [k, value] of coversMap.entries()) {
          if (value?.id === coverId && value?._imageId === effectiveImageId) {
            return { key: k, existing: value, imageId: effectiveImageId };
          }
        }
      }
      return null;
    }

    const existing = coversMap.get(coverId);
    return existing ? { key: coverId, existing, imageId: null } : null;
  };

  // Store display mode users separately (they're not in the users Map)
  const displayModeUsers = new Map(); // socketId -> userData

  io.on('connection', (socket) => {
    const userId = socket.id;
    let userData = null;
    let identificationReceived = false;

    const respond = (ack, payload) => {
      if (typeof ack === 'function') {
        ack(payload);
      }
    };

    const getBattlemapOrRespond = (battlemapId, ack) => {
      if (!battlemapId || typeof battlemapId !== 'string') {
        respond(ack, { ok: false, error: 'invalid-battlemap-id' });
        return null;
      }
      const battlemap = battlemapState.maps.get(battlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'battlemap-not-found' });
        return null;
      }
      return battlemap;
    };

    const ensureBattlemapMutator = (eventName, ack) => {
      if (!userData || !userData.allowBattlemapMutations) {
        logEvent(
          'Denied battlemap mutation',
          eventName,
          'from socket',
          userId,
          'isDisplay=',
          userData?.isDisplay
        );
        respond(ack, { ok: false, error: 'forbidden' });
        return false;
      }
      return true;
    };

    const sendBattlemapList = () => {
      const summaries = battlemapState.order
        .map((id) => battlemapState.maps.get(id))
        .filter(Boolean)
        .map((battlemap) => serializeBattlemapSummary(battlemap));
      // logEvent('Sending battlemap list to socket', userId, summaries.map((item) => item.id));
      socket.emit('battlemap:list', summaries);
    };

    const sendActiveBattlemap = () => {
      ensureActiveBattlemap();
      //  logEvent('Sending active battlemap to socket', userId, battlemapState.activeBattlemapId ?? 'none');
      socket.emit('battlemap:active', { battlemapId: battlemapState.activeBattlemapId });
    };

    sendBattlemapList();
    sendActiveBattlemap();

    const findDisconnectedUser = (persistentId, fallbackId) => {
      if (persistentId && disconnectedUsers.has(persistentId)) {
        return { key: persistentId, value: disconnectedUsers.get(persistentId) };
      }
      // Fallback: search by stored persistentUserId field
      for (const [key, value] of disconnectedUsers.entries()) {
        if (value?.persistentUserId === persistentId || (fallbackId && key === fallbackId)) {
          return { key, value };
        }
      }
      return null;
    };

    // Function to initialize user
    const initializeUser = (data) => {
      const incomingPersistentId =
        typeof data?.persistentUserId === 'string' && data.persistentUserId.trim() !== ''
          ? data.persistentUserId
          : null;

      // If we already initialized but a later identify brings a real persistent ID, update it
      if (identificationReceived) {
        if (incomingPersistentId && userData && userData.persistentUserId !== incomingPersistentId) {
          userData.persistentUserId = incomingPersistentId;
        }
        return;
      }

      identificationReceived = true;

      const persistentUserId = incomingPersistentId || userId;
      let restoredUserData = null;

      // Surface = which route the client is on: 'mobile' (player), 'display'
      // (projector), or 'dashboard' (DM control panel). Dashboard and display
      // are DM-trusted; only dashboard is allowed to mutate battlemap structure.
      const VALID_SURFACES = new Set(['mobile', 'display', 'dashboard']);
      const surface = VALID_SURFACES.has(data?.surface)
        ? data.surface
        : (data?.isDisplay ? 'display' : 'mobile');
      const isDisplay = surface === 'display' || surface === 'dashboard';
      const suppressPresence = Boolean(data?.suppressPresence);
      // Only the dashboard is allowed to mutate battlemap structure. Display
      // and mobile clients can request mutations but the server refuses.
      const allowBattlemapMutations = surface === 'dashboard';

      // Takeover/restoration only applies to mobile presence sockets (those
      // claim an entry in `users`). DM surfaces (display/dashboard) and
      // suppressPresence companion sockets — e.g. BattlemapProvider opens its
      // own socket alongside useSocket — must NOT clobber a player's session
      // just because they happen to share localStorage. Without this guard,
      // BattlemapProvider's identify would kick the player's own useSocket
      // (same persistentUserId) moments after it joined.
      const claimsPresence = !isDisplay && !suppressPresence;

      // Takeover: a fresh socket carrying a persistentUserId that already
      // matches an active user is a reconnection while the old socket is
      // still considered alive. Mobile radios drop TCP without firing FIN,
      // so the server can sit on a zombie socket for a while. Most-recent-
      // wins: kick the old one and inherit its color/position/size. The
      // old socket's disconnect handler is gated by `takenOverBy` so it
      // does not park the user in disconnectedUsers — we are replacing,
      // not parking.
      if (claimsPresence && incomingPersistentId) {
        for (const [oldUserId, oldUser] of users.entries()) {
          if (oldUser.persistentUserId !== incomingPersistentId) continue;
          if (oldUserId === userId) continue;
          restoredUserData = {
            color: oldUser.color,
            position: oldUser.position,
            imageSrc: oldUser.imageSrc || null,
            size: oldUser.size,
          };
          users.delete(oldUserId);
          // Observers keyed otherUsers by oldUserId from the original
          // user-joined. user-reconnected adds the new socket id but doesn't
          // remove the stale one, and the suppressed user-disconnected won't
          // either — without this, every other client renders a ghost token.
          broadcastToActive('user-left', { userId: oldUserId });
          const oldSocket = io.sockets.sockets.get(oldUserId);
          if (oldSocket) {
            oldSocket.data = { ...(oldSocket.data || {}), takenOverBy: userId };
            oldSocket.disconnect(true);
          }
          logEvent('Takeover: persistentId', incomingPersistentId, 'reassigned from', oldUserId, 'to', userId);
          break;
        }
      }

      // Check if this user was previously disconnected (in-memory only).
      // Same gate: only mobile presence sockets should consume a parked entry.
      if (claimsPresence && !restoredUserData) {
        const match = findDisconnectedUser(persistentUserId, incomingPersistentId ? null : userId);
        if (match) {
          restoredUserData = match.value;
          disconnectedUsers.delete(match.key);
        }
      }

      // Use restored data or create new user
      const color = restoredUserData?.color || getRandomColor();
      // Drop new players into the active battlemap's spawn area at a fresh
      // cell so they don't all land on the same square.
      let position = restoredUserData?.position;
      if (!position) {
        const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
        const spawn = sanitizeSpawnArea(battlemap?.spawnArea);
        const existingCount = Array.from(users.values()).filter((u) => !u.isDisplay).length;
        const positions = pickSpawnPositions(spawn, existingCount + 1);
        position = positions[existingCount] ?? { x: spawn.x + spawn.width / 2, y: spawn.y + spawn.height / 2 };
      }
      const size = sanitizeTokenSize(restoredUserData?.size);
      // Display name: prefer the freshly-supplied value (mobile sends current
      // characterName on identify), fall back to a previously parked name on
      // a disconnected user, otherwise null. Trim and clip — clients render
      // this in tight panels so unbounded length is undesirable.
      const incomingName = typeof data?.name === 'string' ? data.name.trim().slice(0, 40) : null;
      const name = incomingName || restoredUserData?.name || null;

      userData = {
        id: userId,
        persistentUserId, // Always store under the persistent ID
        color,
        position,
        size,
        name,
        surface,
        isDisplay, // Kept for legacy code paths that read isDisplay directly.
        allowBattlemapMutations,
        suppressPresence,
      };

      // Mirror identity onto socket.data so the battlemap-switch reset can
      // re-seat this socket without losing color/size/persistentUserId/name.
      socket.data = {
        ...(socket.data || {}),
        persistentUserId,
        color,
        size,
        surface,
        name,
        // claimsPresence == "this socket owns a player token". The reset
        // loop uses it to skip BattlemapProvider companion sockets, which
        // share localStorage with the player's useSocket.
        claimsPresence: claimsPresence,
        imageSrc: null,
      };

      // Join the room for the currently active battlemap so per-map broadcasts
      // (token moves, covers, etc.) only fan out to clients on that map.
      if (battlemapState.activeBattlemapId) {
        socket.join(`bm:${battlemapState.activeBattlemapId}`);
      }

      if (suppressPresence) {
        return;
      }

      // Only add to users Map if NOT in display mode
      // Display mode users should not be visible to other users
      if (!isDisplay) {
        users.set(userId, userData);
        // Auto-add this player to the active battlemap's initiative tracker
        // so the DM doesn't have to enter edit mode every encounter.
        const activeBattlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
        if (activeBattlemap && ensureInitiativeMember(activeBattlemap, persistentUserId, name || '')) {
          broadcastInitiative(activeBattlemap);
        }
      } else {
        // Store display mode users separately so we can verify removal requests
        displayModeUsers.set(userId, userData);
      }

      // Send current user their info and all existing users (including disconnected)
      // Display mode users still receive their own info, but won't be added to the users list
      socket.emit('user-connected', {
        userId,
        persistentUserId: userData.persistentUserId,
        color,
        position,
        imageSrc: userData.imageSrc || null,
        size,
        name,
      });
      // Send all active users (excluding display mode users)
      // Filter out any display mode users that might have been added
      const activeUsersList = Array.from(users.values()).filter(user => !user.isDisplay);
      socket.emit('all-users', activeUsersList);

      // Send disconnected users (for display mode users to track)
      const disconnectedUsersList = Array.from(disconnectedUsers.values());
      if (disconnectedUsersList.length > 0) {
        socket.emit('disconnected-users', disconnectedUsersList);
      }

      // Only broadcast new user to all other clients if NOT in display mode
      // Display mode users should not be visible to other users
      if (!isDisplay) {
        // Broadcast new user to all other clients (only if not a restoration)
        if (!restoredUserData) {
          broadcastFromSocketToActive(socket, 'user-joined', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
            imageSrc: userData.imageSrc || null,
            size,
            name,
          });
        } else {
          // User reconnected - broadcast reconnection
          broadcastFromSocketToActive(socket, 'user-reconnected', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
            imageSrc: userData.imageSrc || null,
            size,
            name,
          });
        }
      }
    };

    // Listen for user identification
    socket.once('user-identify', (data) => {
      // logEvent('Socket identified', socket.id, JSON.stringify(data));
      initializeUser(data);
    });

    // If a socket connects but never sends user-identify within 5s it is not
    // a legitimate client (every real client emits it synchronously on
    // connect — see useSocket.ts). Don't allocate a token with no persistent
    // identity; just drop the socket so it can reconnect cleanly.
    setTimeout(() => {
      if (!identificationReceived) {
        socket.disconnect(true);
      }
    }, 5000);

    socket.on('battlemap:get', (payload, ack) => {
      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }
      ensureBattlemapHasAtLeastOneImage(battlemap);
      logEvent('Client requested battlemap', battlemapId);
      respond(ack, { ok: true, battlemap: serializeBattlemap(battlemap) });
    });

    socket.on('battlemap:create', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:create', ack)) {
        return;
      }

      const trimmedName =
        typeof payload?.name === 'string' && payload.name.trim() !== ''
          ? payload.name.trim()
          : 'Untitled Battlemap';
      // sanitizeAssetUrl rejects data:, file:, javascript:, and over-long inputs;
      // accepts http(s) URLs and relative paths starting with '/'.
      const sanitizedPath = sanitizeAssetUrl(payload?.mapPath);
      const battlemapId = randomUUID();
      const initialImageId = supportsBattlemapImages ? randomUUID() : null;

      const newBattlemap = {
        id: battlemapId,
        name: trimmedName,
        mapPath: sanitizedPath,
        images: supportsBattlemapImages
          ? [
              {
                id: initialImageId,
                battlemapId,
                name: 'Floor 1',
                mapPath: sanitizedPath,
                sortIndex: 0,
              },
            ]
          : [],
        activeImageId: supportsBattlemapImages ? initialImageId : null,
        gridScale: DEFAULT_SETTINGS.gridScale,
        gridOffsetX: DEFAULT_SETTINGS.gridOffsetX,
        gridOffsetY: DEFAULT_SETTINGS.gridOffsetY,
        gridData: cloneGridData(),
        covers: new Map(),
      };

      const newSortIndex = battlemapState.order.length;
      battlemapState.order.push(battlemapId);
      battlemapState.maps.set(battlemapId, newBattlemap);

      logEvent('Created battlemap', battlemapId, `"${trimmedName}"`);
      respond(ack, { ok: true, battlemapId });
      broadcastBattlemapList();
      if (!battlemapState.activeBattlemapId) {
        battlemapState.activeBattlemapId = battlemapId;
        moveSocketsToActiveBattlemapRoom(null);
        broadcastActiveBattlemap();
      }
      emitBattlemapUpdate(battlemapId);

      runBackgroundTask('insert battlemap', async () => {
        // Cyclic FK between battlemaps.active_image_id and battlemap_images.battlemap_id
        // forces a three-step write: parent with NULL FK, child, then patch parent.
        const hasInitialImage = supportsBattlemapImages && initialImageId;
        await insertBattlemapRow(newBattlemap, newSortIndex, { skipActiveImage: hasInitialImage });
        if (hasInitialImage) {
          await insertBattlemapImageRow({
            id: initialImageId,
            battlemapId,
            name: 'Floor 1',
            mapPath: sanitizedPath,
            sortIndex: 0,
          });
          await updateBattlemapRow(battlemapId);
        }
      });
    });

    socket.on('battlemap:set-active-image', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:set-active-image', ack)) {
        return;
      }

      if (!supportsBattlemapImages) {
        respond(ack, { ok: false, error: 'unsupported' });
        return;
      }

      const battlemapId = payload?.battlemapId;
      const imageId = payload?.imageId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      ensureBattlemapHasAtLeastOneImage(battlemap);
      if (typeof imageId !== 'string' || imageId.trim() === '') {
        respond(ack, { ok: false, error: 'invalid-image-id' });
        return;
      }

      const image = getBattlemapImageById(battlemap, imageId);
      if (!image) {
        respond(ack, { ok: false, error: 'image-not-found' });
        return;
      }

      battlemap.activeImageId = imageId;
      battlemap.mapPath = image.mapPath ?? null;

      logEvent('Active battlemap image set to', imageId, 'for', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('persist active battlemap image', () => updateBattlemapRow(battlemap.id));
    });

    socket.on('battlemap:add-image', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:add-image', ack)) {
        return;
      }

      if (!supportsBattlemapImages) {
        respond(ack, { ok: false, error: 'unsupported' });
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      ensureBattlemapHasAtLeastOneImage(battlemap);

      const trimmedName =
        typeof payload?.name === 'string' && payload.name.trim() !== ''
          ? payload.name.trim()
          : `Floor ${Array.isArray(battlemap.images) ? battlemap.images.length + 1 : 1}`;

      const imageId = randomUUID();
      const nextSortIndex = Array.isArray(battlemap.images) ? battlemap.images.length : 0;
      const image = {
        id: imageId,
        battlemapId: battlemap.id,
        name: trimmedName,
        mapPath: null,
        sortIndex: nextSortIndex,
      };

      battlemap.images = Array.isArray(battlemap.images) ? [...battlemap.images, image] : [image];
      battlemap.activeImageId = imageId;
      battlemap.mapPath = null;

      logEvent('Added battlemap image', imageId, 'to', battlemap.id);
      respond(ack, { ok: true, imageId });
      emitBattlemapUpdate(battlemap.id);

      runBackgroundTask('insert battlemap image', async () => {
        await insertBattlemapImageRow(image);
        await updateBattlemapRow(battlemap.id);
      });
    });

    socket.on('battlemap:rename-image', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:rename-image', ack)) {
        return;
      }

      if (!supportsBattlemapImages) {
        respond(ack, { ok: false, error: 'unsupported' });
        return;
      }

      const battlemapId = payload?.battlemapId;
      const imageId = payload?.imageId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      ensureBattlemapHasAtLeastOneImage(battlemap);
      if (typeof imageId !== 'string' || imageId.trim() === '') {
        respond(ack, { ok: false, error: 'invalid-image-id' });
        return;
      }

      const trimmedName =
        typeof payload?.name === 'string' && payload.name.trim() !== ''
          ? payload.name.trim()
          : 'Floor';

      const image = getBattlemapImageById(battlemap, imageId);
      if (!image) {
        respond(ack, { ok: false, error: 'image-not-found' });
        return;
      }

      image.name = trimmedName;
      logEvent('Renamed battlemap image', imageId, '→', `"${trimmedName}"`, 'for', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('rename battlemap image', () =>
        updateBattlemapImageRow(imageId, { name: trimmedName, updated_at: new Date().toISOString() })
      );
    });

    socket.on('battlemap:delete-image', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:delete-image', ack)) {
        return;
      }

      if (!supportsBattlemapImages) {
        respond(ack, { ok: false, error: 'unsupported' });
        return;
      }

      const battlemapId = payload?.battlemapId;
      const imageId = payload?.imageId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      ensureBattlemapHasAtLeastOneImage(battlemap);
      if (typeof imageId !== 'string' || imageId.trim() === '') {
        respond(ack, { ok: false, error: 'invalid-image-id' });
        return;
      }

      const existing = getBattlemapImageById(battlemap, imageId);
      if (!existing) {
        respond(ack, { ok: false, error: 'image-not-found' });
        return;
      }

      const remaining = (battlemap.images ?? []).filter((img) => img.id !== imageId);
      if (remaining.length === 0) {
        respond(ack, { ok: false, error: 'cannot-delete-last-image' });
        return;
      }

      battlemap.images = remaining;

      // Remove any in-memory covers for this image
      if (supportsBattlemapCoverImageId && battlemap.covers instanceof Map) {
        for (const [key, value] of battlemap.covers.entries()) {
          if (value?._imageId === imageId) {
            battlemap.covers.delete(key);
          }
        }
      }

      // Cascade fog cleanup. fogByImage is keyed by floor id; without this
      // the array leaks for the lifetime of the process every time a floor
      // is deleted, and a floor that re-uses the id (it shouldn't, but…)
      // would inherit stale shapes.
      if (battlemap.fogByImage && imageId in battlemap.fogByImage) {
        delete battlemap.fogByImage[imageId];
      }

      if (battlemap.activeImageId === imageId) {
        battlemap.activeImageId = remaining[0]?.id ?? null;
        const nextActive = getBattlemapImageById(battlemap, battlemap.activeImageId) ?? remaining[0];
        battlemap.mapPath = nextActive?.mapPath ?? null;
      }

      logEvent('Deleted battlemap image', imageId, 'from', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('delete battlemap image', async () => {
        await deleteBattlemapImageRow(imageId);
        await updateBattlemapRow(battlemap.id);
      });
    });

    socket.on('battlemap:set-active', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:set-active', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      if (!battlemapId || !battlemapState.maps.has(battlemapId)) {
        respond(ack, { ok: false, error: 'battlemap-not-found' });
        return;
      }

      if (battlemapState.activeBattlemapId !== battlemapId) {
        const previousId = battlemapState.activeBattlemapId;
        battlemapState.activeBattlemapId = battlemapId;
        logEvent('Active battlemap set to', battlemapId);
        // Move every connected socket from the previous battlemap room into
        // the new one before any per-battlemap broadcasts go out.
        moveSocketsToActiveBattlemapRoom(previousId);
        broadcastActiveBattlemap();
        // Players from the old map should not bleed into the new map. Reseat
        // them in the new battlemap's spawn area.
        resetTokensForActiveBattlemap().catch((err) => {
          console.error('[Battlemap reset] failed', err);
        });
      }

      respond(ack, { ok: true });
    });

    socket.on('battlemap:rename', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:rename', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      const trimmedName =
        typeof payload?.name === 'string' && payload.name.trim() !== ''
          ? payload.name.trim()
          : 'Untitled Battlemap';

      battlemap.name = trimmedName;

      logEvent('Renamed battlemap', battlemap.id, '→', `"${trimmedName}"`);
      respond(ack, { ok: true });
      broadcastBattlemapList();
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('update battlemap name', () => updateBattlemapRow(battlemap.id));
    });

    socket.on('battlemap:reorder', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:reorder', ack)) {
        return;
      }

      const orderedIds = Array.isArray(payload?.orderedIds) ? payload.orderedIds : null;
      if (!orderedIds || orderedIds.length !== battlemapState.order.length) {
        respond(ack, { ok: false, error: 'invalid-order' });
        return;
      }

      const seen = new Set();
      for (const id of orderedIds) {
        if (typeof id !== 'string' || !battlemapState.maps.has(id) || seen.has(id)) {
          respond(ack, { ok: false, error: 'invalid-order' });
          return;
        }
        seen.add(id);
      }

      battlemapState.order = [...orderedIds];

      logEvent('Reordered battlemaps', battlemapState.order);
      respond(ack, { ok: true });
      broadcastBattlemapList();
      runBackgroundTask('persist battlemap order', () => persistBattlemapOrder(battlemapState.order));
    });

    socket.on('battlemap:update-map-path', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:update-map-path', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      logEvent('Received map path update request for', battlemapId, 'from', userId);
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      // sanitizeAssetUrl rejects data:, file:, javascript:, and over-long inputs;
      // accepts http(s) URLs and relative paths starting with '/'.
      const sanitizedPath = sanitizeAssetUrl(payload?.mapPath);

      const targetImageId = payload?.battlemapImageId || payload?.imageId;

      if (supportsBattlemapImages) {
        ensureBattlemapHasAtLeastOneImage(battlemap);
        const effectiveTargetId =
          typeof targetImageId === 'string' && targetImageId.trim() !== ''
            ? targetImageId
            : battlemap.activeImageId ?? battlemap.images?.[0]?.id ?? null;
        const image = effectiveTargetId ? getBattlemapImageById(battlemap, effectiveTargetId) : null;
        if (!image) {
          respond(ack, { ok: false, error: 'image-not-found' });
          return;
        }

        image.mapPath = sanitizedPath;
        if (battlemap.activeImageId === image.id) {
          battlemap.mapPath = sanitizedPath;
        }

        // Preserve existing grid calibration for floor updates; only reset in legacy single-image updates.
        const shouldResetGridData = !targetImageId && (battlemap.images?.length ?? 0) <= 1;
        if (shouldResetGridData) {
          battlemap.gridData = cloneGridData();
        }
      } else {
        battlemap.mapPath = sanitizedPath;
        battlemap.gridData = cloneGridData();
      }

      logEvent('Updated map path for', battlemap.id, '→', sanitizedPath ?? '(none)');
      respond(ack, { ok: true });
      broadcastBattlemapList();
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('update battlemap map path', async () => {
        if (supportsBattlemapImages) {
          const effectiveTargetId =
            typeof (payload?.battlemapImageId || payload?.imageId) === 'string'
              ? payload?.battlemapImageId || payload?.imageId
              : battlemap.activeImageId;
          if (effectiveTargetId) {
            await updateBattlemapImageRow(effectiveTargetId, {
              map_path: sanitizedPath,
              updated_at: new Date().toISOString(),
            });
          }
        }
        await updateBattlemapRow(battlemap.id);
      });
    });

    socket.on('battlemap:update-settings', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:update-settings', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      if (typeof payload?.gridScale === 'number' && Number.isFinite(payload.gridScale)) {
        battlemap.gridScale = payload.gridScale;
      }

      if (typeof payload?.gridOffsetX === 'number' && Number.isFinite(payload.gridOffsetX)) {
        battlemap.gridOffsetX = payload.gridOffsetX;
      }

      if (typeof payload?.gridOffsetY === 'number' && Number.isFinite(payload.gridOffsetY)) {
        battlemap.gridOffsetY = payload.gridOffsetY;
      }

      logEvent('Updated grid settings for', battlemap.id, {
        scale: battlemap.gridScale,
        offsetX: battlemap.gridOffsetX,
        offsetY: battlemap.gridOffsetY,
      });
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('update battlemap settings', () => updateBattlemapRow(battlemap.id));
    });

    // ---------------- Fog of war ----------------
    // Per-floor fog shapes, in-memory only (resets on server restart).
    // The renderer draws fog ONLY inside these shapes — empty list means
    // the map is fully visible (default-open). The DM "lays down fog"
    // by dragging rectangles where they want concealment.
    const ensureFogBucket = (battlemap) => {
      if (!battlemap.fogByImage) battlemap.fogByImage = {};
      const imageId = battlemap.activeImageId;
      if (!imageId) return null;
      if (!Array.isArray(battlemap.fogByImage[imageId])) {
        battlemap.fogByImage[imageId] = [];
      }
      return battlemap.fogByImage[imageId];
    };

    socket.on('fog:add-area', (payload, ack) => {
      if (!ensureBattlemapMutator('fog:add-area', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const bucket = ensureFogBucket(battlemap);
      if (!bucket) {
        respond(ack, { ok: false, error: 'no-active-image' });
        return;
      }
      const shape = sanitizeFogShape(payload?.shape);
      if (!shape) {
        respond(ack, { ok: false, error: 'invalid-shape' });
        return;
      }
      bucket.push(shape);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
    });

    socket.on('fog:remove-area', (payload, ack) => {
      if (!ensureBattlemapMutator('fog:remove-area', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const bucket = ensureFogBucket(battlemap);
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (bucket && id) {
        const idx = bucket.findIndex((s) => s.id === id);
        if (idx >= 0) bucket.splice(idx, 1);
      }
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
    });

    socket.on('fog:update-area', (payload, ack) => {
      if (!ensureBattlemapMutator('fog:update-area', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const bucket = ensureFogBucket(battlemap);
      const id = typeof payload?.id === 'string' ? payload.id : '';
      const updates = (payload?.updates && typeof payload.updates === 'object') ? payload.updates : null;
      if (bucket && id && updates) {
        const idx = bucket.findIndex((s) => s.id === id);
        if (idx >= 0) {
          // sanitizeFogShape clamps and validates; we feed it the merged
          // result so it ignores any malformed fields the client sent.
          const sanitized = sanitizeFogShape({ ...bucket[idx], ...updates, id });
          if (sanitized) bucket[idx] = sanitized;
        }
      }
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
    });

    socket.on('fog:clear', (payload, ack) => {
      if (!ensureBattlemapMutator('fog:clear', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const bucket = ensureFogBucket(battlemap);
      if (bucket) bucket.length = 0;
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
    });

    // ---------------- Soundboard ----------------
    // The library of clips lives on the dashboard's localStorage; the server
    // only relays the "play this URL now" broadcast so phones in the room can
    // join the audio. URL is sanitised to reject data:/file:/javascript:.
    socket.on('soundboard:play', (payload) => {
      if (!userData?.isDisplay) return;
      const url = sanitizeAssetUrl(payload?.url);
      if (!url) return;
      const name = typeof payload?.name === 'string' ? payload.name.slice(0, 80) : '';
      const loop = Boolean(payload?.loop);
      broadcastToActive('soundboard:played', { url, name, loop });
    });

    socket.on('soundboard:stop', () => {
      if (!userData?.isDisplay) return;
      broadcastToActive('soundboard:stopped', {});
    });

    // ---------------- Initiative tracker ----------------
    // The state and helpers live at outer scope (defined alongside
    // broadcastToActive) so non-handler code paths — e.g. the battlemap-reset
    // re-seat loop — can mutate initiative too.

    socket.on('initiative:set-entries', (payload, ack) => {
      if (!ensureBattlemapMutator('initiative:set-entries', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const incoming = Array.isArray(payload?.entries) ? payload.entries : [];
      const entries = incoming.map(sanitizeInitiativeEntry).filter(Boolean);
      const state = ensureInitiativeState(battlemap);
      state.entries = entries;
      state.currentIndex = entries.length > 0 ? 0 : -1;
      state.round = entries.length > 0 ? 1 : 0;
      respond(ack, { ok: true });
      broadcastInitiative(battlemap);
    });

    socket.on('initiative:advance', (payload, ack) => {
      if (!ensureBattlemapMutator('initiative:advance', ack)) return;
      const direction = payload?.direction === 'prev' ? -1 : 1;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const state = ensureInitiativeState(battlemap);
      if (state.entries.length === 0) {
        respond(ack, { ok: true });
        return;
      }
      const nextIndex = state.currentIndex + direction;
      if (nextIndex >= state.entries.length) {
        state.currentIndex = 0;
        state.round += 1;
      } else if (nextIndex < 0) {
        state.currentIndex = state.entries.length - 1;
        state.round = Math.max(1, state.round - 1);
      } else {
        state.currentIndex = nextIndex;
      }
      respond(ack, { ok: true });
      broadcastInitiative(battlemap);
    });

    socket.on('initiative:reset', (payload, ack) => {
      if (!ensureBattlemapMutator('initiative:reset', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const state = ensureInitiativeState(battlemap);
      state.entries = [];
      state.currentIndex = -1;
      state.round = 0;
      // Re-seed from currently present tokens so reset == "restart turn order
      // with everyone who's actually here", not "blank slate forever".
      for (const u of users.values()) {
        if (u.isDisplay) continue;
        const tid = u.persistentUserId || u.id;
        ensureInitiativeMember(battlemap, tid, u.name || '');
      }
      respond(ack, { ok: true });
      broadcastInitiative(battlemap);
    });

    // Drag-to-reorder from the dashboard. Accepts a flat array of tokenIds in
    // the desired order; unknown ids are ignored, missing ones drop to the
    // end so partial payloads degrade gracefully.
    socket.on('initiative:reorder', (payload, ack) => {
      if (!ensureBattlemapMutator('initiative:reorder', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const order = Array.isArray(payload?.order) ? payload.order : [];
      if (reorderInitiative(battlemap, order)) {
        broadcastInitiative(battlemap);
      }
      respond(ack, { ok: true });
    });

    // Inline score edit. Score is informational only (doesn't affect order
    // anymore) but a "what did they roll?" column is still useful to the DM.
    socket.on('initiative:set-score', (payload, ack) => {
      if (!ensureBattlemapMutator('initiative:set-score', ack)) return;
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: false, error: 'no-active-battlemap' });
        return;
      }
      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : null;
      const score = typeof payload?.score === 'number' ? payload.score : 0;
      if (tokenId && setInitiativeScore(battlemap, tokenId, score)) {
        broadcastInitiative(battlemap);
      }
      respond(ack, { ok: true });
    });

    // Send initiative on connect so a late-joining client gets caught up.
    socket.on('initiative:request', (payload, ack) => {
      const battlemap = battlemapState.maps.get(battlemapState.activeBattlemapId);
      if (!battlemap) {
        respond(ack, { ok: true, state: { entries: [], currentIndex: -1, round: 0 } });
        return;
      }
      const state = ensureInitiativeState(battlemap);
      respond(ack, {
        ok: true,
        state: {
          battlemapId: battlemap.id,
          entries: state.entries,
          currentIndex: state.currentIndex,
          round: state.round,
        },
      });
    });

    socket.on('battlemap:update-spawn-area', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:update-spawn-area', ack)) {
        return;
      }
      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) return;

      battlemap.spawnArea = sanitizeSpawnArea(payload?.spawnArea);
      logEvent('Updated spawn area for', battlemap.id, battlemap.spawnArea);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      if (supportsBattlemapSpawnArea) {
        runBackgroundTask('update battlemap spawn area', () => updateBattlemapRow(battlemap.id));
      }
    });

    socket.on('battlemap:update-grid-data', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:update-grid-data', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      battlemap.gridData = sanitizeGridData(payload?.gridData);

      logEvent('Updated grid data for', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('update battlemap grid data', () => updateBattlemapRow(battlemap.id));
    });

    socket.on('battlemap:delete', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:delete', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      battlemapState.maps.delete(battlemap.id);
      battlemapState.order = battlemapState.order.filter((id) => id !== battlemap.id);

      logEvent('Deleted battlemap', battlemap.id);
      respond(ack, { ok: true });
      broadcastBattlemapList();
      emitBattlemapDeleted(battlemap.id);
      runBackgroundTask('persist battlemap order', () => persistBattlemapOrder(battlemapState.order));

      runBackgroundTask('delete battlemap', async () => {
        await deleteCoversForBattlemap(battlemap.id);
        await deleteBattlemapRow(battlemap.id);
      });

      if (battlemapState.activeBattlemapId === battlemap.id) {
        const previousId = battlemap.id;
        ensureActiveBattlemap();
        moveSocketsToActiveBattlemapRoom(previousId);
        broadcastActiveBattlemap();
        resetTokensForActiveBattlemap().catch((err) => {
          console.error('[Battlemap reset] failed', err);
        });
      }
    });

    // The cover system was removed; fog-of-war is the canonical
    // "rectangle on the map" feature now. See fog:add-area /
    // fog:remove-area / fog:update-area / fog:clear above.

    // Handle position updates
    socket.on('position-update', (data) => {
      // Support both old format (just position) and new format (tokenId + position)
      let targetUserId = userId;
      let rawPosition;

      if (data && typeof data === 'object' && data.tokenId && data.position) {
        targetUserId = data.tokenId;
        rawPosition = data.position;
      } else {
        rawPosition = data;
      }

      // Reject malformed payloads (NaN/Infinity/non-objects) before mutating state.
      if (!rawPosition || typeof rawPosition !== 'object') return;
      const x = sanitizePositionComponent(rawPosition.x);
      const y = sanitizePositionComponent(rawPosition.y);
      if (x === null || y === null) return;
      const position = { x, y };

      const callerIsDm = Boolean(userData?.isDisplay);
      const targetUser = users.get(targetUserId);
      if (targetUser) {
        // Players can only move their own token (matched by persistent ID, since
        // the socketId-keyed tokenId can change across reconnects). DMs can
        // move any token.
        const callerOwnsTarget =
          Boolean(userData?.persistentUserId) &&
          targetUser.persistentUserId === userData.persistentUserId;
        if (!callerIsDm && !callerOwnsTarget) return;

        targetUser.position = position;
        broadcastFromSocketToActive(socket, 'user-moved', {
          userId: targetUserId,
          position,
        });
        return;
      }

      // Disconnected players are only in disconnectedUsers (keyed by
      // persistentUserId). Only DMs can move them — players can't reach a
      // token they don't own anyway.
      if (!callerIsDm) return;
      const parkedUser = disconnectedUsers.get(targetUserId);
      if (!parkedUser) return;
      parkedUser.position = position;
      broadcastFromSocketToActive(socket, 'user-moved', {
        userId: targetUserId,
        position,
      });
    });

    // Handle token image updates
    socket.on('token-image-update', (data) => {
      if (!data || typeof data !== 'object') return;
      const { tokenId, imageSrc } = data;
      if (typeof tokenId !== 'string' || tokenId.trim() === '') return;

      // Reject data:/file:/javascript: and any URL we don't recognise as same-origin or http(s).
      const sanitizedImageSrc = sanitizeAssetUrl(imageSrc);

      const targetUser = users.get(tokenId);
      if (!targetUser) return;
      // Players can only set their own token's art; DM can set any.
      const callerIsDm = Boolean(userData?.isDisplay);
      const callerOwnsTarget =
        Boolean(userData?.persistentUserId) &&
        targetUser.persistentUserId === userData.persistentUserId;
      if (!callerIsDm && !callerOwnsTarget) return;

      targetUser.imageSrc = sanitizedImageSrc;
      broadcastToActive('token-image-updated', {
        userId: tokenId,
        imageSrc: sanitizedImageSrc,
      });
    });

    // Handle token size updates (display mode only)
    socket.on('token-size-update', (data) => {
      if (!userData || !userData.isDisplay) {
        return;
      }

      const tokenId = data?.tokenId;
      if (typeof tokenId !== 'string' || tokenId.trim() === '') {
        return;
      }

      const nextSize = sanitizeTokenSize(data?.size);

      const updateUserSize = (target) => {
        if (target) {
          target.size = nextSize;
          return true;
        }
        return false;
      };

      if (!updateUserSize(users.get(tokenId))) {
        if (!updateUserSize(disconnectedUsers.get(tokenId))) {
          for (const [, activeUser] of users.entries()) {
            if (activeUser.persistentUserId === tokenId) {
              updateUserSize(activeUser);
              break;
            }
          }
        }
      }

      broadcastToActive('token-size-updated', {
        userId: tokenId,
        size: nextSize,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const takenOverBy = socket.data?.takenOverBy;
      const user = users.get(userId);
      const displayUser = displayModeUsers.get(userId);

      if (takenOverBy) {
        // A newer socket with the same persistentUserId already absorbed
        // our state and broadcast user-reconnected. Don't park ourselves in
        // disconnectedUsers and don't emit user-disconnected — we are being
        // replaced, not parked.
        users.delete(userId);
        displayModeUsers.delete(userId);
        return;
      }

      if (user) {
        // Don't delete - move to disconnected users (in-memory)
        // Only do this for non-display users (display users are never in the users Map)
        const persistentId = user.persistentUserId || userId;
        const disconnectedUserData = {
          id: persistentId, // Use persistent ID for disconnected users
          persistentUserId: persistentId,
          color: user.color,
          position: user.position,
          imageSrc: user.imageSrc || null,
          size: sanitizeTokenSize(user.size),
          name: user.name ?? null,
          disconnectedAt: Date.now(),
        };

        disconnectedUsers.set(persistentId, disconnectedUserData);
        users.delete(userId);
        // Drop them from initiative — disconnected players shouldn't keep
        // their slot in the turn order.
        mutateActiveInitiative((bm) => removeInitiativeMember(bm, persistentId));
        // Broadcast to all other clients with color and position
        broadcastFromSocketToActive(socket, 'user-disconnected', {
          userId,
          persistentUserId: persistentId,
          color: user.color,
          position: user.position,
          imageSrc: user.imageSrc || null,
          size: sanitizeTokenSize(user.size),
          name: user.name ?? null,
        });
      } else if (displayUser) {
        // Clean up display mode user
        displayModeUsers.delete(userId);
      }
    });

    // Mobile clients send this whenever the player picks/changes their
    // character on the loading form. Update presence and broadcast so the
    // dashboard's players panel reflects the change in real time.
    socket.on('user-name-update', (payload) => {
      const incoming = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 40) : null;
      const next = incoming || null;
      const user = users.get(userId);
      if (user) {
        user.name = next;
      }
      const displayed = displayModeUsers.get(userId);
      if (displayed) {
        displayed.name = next;
      }
      const persistentId =
        user?.persistentUserId || displayed?.persistentUserId || socket.data?.persistentUserId || userId;
      const parked = persistentId ? disconnectedUsers.get(persistentId) : null;
      if (parked) {
        parked.name = next;
      }
      socket.data = { ...(socket.data || {}), name: next };
      // Reach observers on this battlemap so the players panel updates live.
      broadcastToActive('user-name-updated', {
        userId,
        persistentUserId: persistentId,
        name: next,
      });
      // Keep the initiative entry's name in sync with the chosen character.
      mutateActiveInitiative((bm) => renameInitiativeMember(bm, persistentId, next || ''));
    });

    // Handle token removal (only from display mode users)
    socket.on('remove-token', (data) => {
      // Check both regular users and display mode users
      const isDisplayUser = displayModeUsers.has(userId);
      
      if (isDisplayUser && data.persistentUserId) {
        // Remove from disconnected users
        if (disconnectedUsers.has(data.persistentUserId)) {
          disconnectedUsers.delete(data.persistentUserId);
        }
        
        // Also check active users (in case they're still connected)
        for (const [activeUserId, activeUser] of users.entries()) {
          if (activeUser.persistentUserId === data.persistentUserId) {
            users.delete(activeUserId);
            // Notify the user being removed if they're still connected
            const targetSocket = io.sockets.sockets.get(activeUserId);
            if (targetSocket) {
              targetSocket.emit('token-removed', { persistentUserId: data.persistentUserId });
            }
            break;
          }
        }
        
        // Broadcast removal to clients on the active battlemap.
        broadcastToActive('token-removed', { persistentUserId: data.persistentUserId });
        // Pull the entry from initiative too — the token no longer exists.
        mutateActiveInitiative((bm) => removeInitiativeMember(bm, data.persistentUserId));
      }
    });

    // Handle adding a new token (colored token, not a user)
    socket.on('add-token', (data) => {
      if (!data || typeof data !== 'object') return;
      // Only DM surfaces (display/dashboard) can spawn tokens.
      if (!userData?.isDisplay) return;
      const { color, position, size, imageSrc, name } = data;
      const tokenId = `token-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const persistentTokenId = `token-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const sanitizedName = typeof name === 'string' ? name.trim().slice(0, 40) : '';

      const tokenData = {
        id: tokenId,
        persistentUserId: persistentTokenId,
        color: sanitizeHexColor(color, getRandomColor()),
        position: sanitizePosition(position),
        size: sanitizeTokenSize(size),
        imageSrc: sanitizeAssetUrl(imageSrc),
        name: sanitizedName || null,
        isDisplay: false,
      };

      users.set(tokenId, tokenData);

      broadcastToActive('token-added', {
        userId: tokenId,
        persistentUserId: persistentTokenId,
        color: tokenData.color,
        position: tokenData.position,
        size: tokenData.size,
        imageSrc: tokenData.imageSrc,
        name: tokenData.name,
      });

      // Auto-add the NPC to initiative so the DM doesn't have to enter the
      // tracker every encounter — the same behavior as for player joins.
      mutateActiveInitiative((bm) => ensureInitiativeMember(bm, persistentTokenId, sanitizedName));
    });

    // Legacy global cover handlers (add-cover/remove-cover/update-cover) were
    // removed in favour of the battlemap-scoped variants
    // (battlemap:add-cover/update-cover/remove-cover) which persist to Supabase
    // and respect floor (battlemap_image) scoping.
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


