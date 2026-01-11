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

const persistBattlemapOrder = (orderedIds) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    orderedIds.map((battlemapId, index) =>
      supabase.from('battlemaps').update({ sort_index: index }).eq('id', battlemapId)
    )
  );
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
    color: typeof input.color === 'string' && input.color.trim() !== '' ? input.color : '#808080',
  };
};

const generateCoverId = () => `cover-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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
  covers: getBattlemapCoversForActiveImage(battlemap),
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
        sort_index
      `
    )
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    // Older schemas might not have active_image_id; retry without it.
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message.includes('active_image_id')) {
      supportsBattlemapActiveImageId = false;
      const retry = await supabase
        .from('battlemaps')
        .select(
          `
            id,
            name,
            map_path,
            grid_scale,
            grid_offset_x,
            grid_offset_y,
            grid_data,
            sort_index
          `
        )
        .order('sort_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (retry.error) {
        throw retry.error;
      }
      battlemapRows = retry.data;
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
// Store covers (in-memory)
const covers = new Map();

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

  const insertBattlemapRow = (battlemap, sortIndex = 0) =>
    supabase.from('battlemaps').insert((() => {
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
        row.active_image_id = battlemap.activeImageId ?? null;
      }
      return row;
    })());

  const updateBattlemapRow = (battlemapId) => {
    const battlemap = battlemapState.maps.get(battlemapId);
    if (!battlemap) {
      return Promise.resolve();
    }

    return supabase
      .from('battlemaps')
      .update((() => {
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
        return row;
      })())
      .eq('id', battlemapId);
  };

  const deleteBattlemapRow = (battlemapId) =>
    supabase.from('battlemaps').delete().eq('id', battlemapId);

  const deleteCoversForBattlemap = (battlemapId) =>
    supabase.from('battlemap_covers').delete().eq('battlemap_id', battlemapId);

  const upsertCoverRow = (battlemapId, cover, battlemapImageId = null) =>
    supabase.from('battlemap_covers').upsert((() => {
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
      return row;
    })());

  const deleteCoverRow = (coverId) => supabase.from('battlemap_covers').delete().eq('id', coverId);

  const insertBattlemapImageRow = (image) =>
    supabase.from('battlemap_images').insert({
      id: image.id,
      battlemap_id: image.battlemapId,
      name: image.name,
      map_path: image.mapPath,
      sort_index: image.sortIndex ?? 0,
    });

  const updateBattlemapImageRow = (imageId, updates) =>
    supabase.from('battlemap_images').update(updates).eq('id', imageId);

  const deleteBattlemapImageRow = (imageId) =>
    supabase.from('battlemap_images').delete().eq('id', imageId);

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

      // Check if this user was previously disconnected (in-memory only)
      const match = findDisconnectedUser(persistentUserId, incomingPersistentId ? null : userId);
      if (match) {
        restoredUserData = match.value;
        disconnectedUsers.delete(match.key);
      }

      // Use restored data or create new user
      const color = restoredUserData?.color || getRandomColor();
      const position = restoredUserData?.position || { x: 50, y: 50 };
      const size = sanitizeTokenSize(restoredUserData?.size);

      const isDisplay = data?.isDisplay || false;
      const suppressPresence = Boolean(data?.suppressPresence);
      const allowBattlemapMutations =
        typeof data?.allowBattlemapMutations === 'boolean'
          ? data.allowBattlemapMutations
          : isDisplay;

      userData = {
        id: userId,
        persistentUserId, // Always store under the persistent ID
        color,
        position,
        size,
        isDisplay, // Track if this is a display mode user
        allowBattlemapMutations,
        suppressPresence,
      };

      if (suppressPresence) {
        return;
      }

      // Only add to users Map if NOT in display mode
      // Display mode users should not be visible to other users
      if (!isDisplay) {
        users.set(userId, userData);
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
      });
      // Send all active users (excluding display mode users)
      // Filter out any display mode users that might have been added
      const activeUsersList = Array.from(users.values()).filter(user => !user.isDisplay);
      socket.emit('all-users', activeUsersList);

      if (covers.size > 0) {
        socket.emit('all-covers', Array.from(covers.values()));
      }

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
          socket.broadcast.emit('user-joined', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
            imageSrc: userData.imageSrc || null,
            size,
          });
        } else {
          // User reconnected - broadcast reconnection
          socket.broadcast.emit('user-reconnected', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
            imageSrc: userData.imageSrc || null,
            size,
          });
        }
      }
    };

    // Listen for user identification
    socket.once('user-identify', (data) => {
      // logEvent('Socket identified', socket.id, JSON.stringify(data));
      initializeUser(data);
    });

    // If client doesn't send identification within 1 second, proceed with new user
    setTimeout(() => {
      if (!identificationReceived) {
        initializeUser({});
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
      const sanitizedPath =
        typeof payload?.mapPath === 'string' && payload.mapPath.trim() !== ''
          ? payload.mapPath.trim()
          : null;
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
        broadcastActiveBattlemap();
      }
      emitBattlemapUpdate(battlemapId);

      runBackgroundTask('insert battlemap', async () => {
        await insertBattlemapRow(newBattlemap, newSortIndex);
        if (supportsBattlemapImages && initialImageId) {
          await insertBattlemapImageRow({
            id: initialImageId,
            battlemapId,
            name: 'Floor 1',
            mapPath: sanitizedPath,
            sortIndex: 0,
          });
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
        battlemapState.activeBattlemapId = battlemapId;
        logEvent('Active battlemap set to', battlemapId);
        broadcastActiveBattlemap();
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

      const sanitizedPath =
        typeof payload?.mapPath === 'string' && payload.mapPath.trim() !== ''
          ? payload.mapPath.trim()
          : null;

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
        ensureActiveBattlemap();
        broadcastActiveBattlemap();
      }
    });

    socket.on('battlemap:add-cover', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:add-cover', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      const requestedImageId = payload?.battlemapImageId || payload?.imageId || null;
      if (supportsBattlemapImages) {
        ensureBattlemapHasAtLeastOneImage(battlemap);
      }

      const coverInput = payload?.cover || {};
      const coverId =
        typeof coverInput.id === 'string' && coverInput.id.trim() !== ''
          ? coverInput.id
          : generateCoverId();
      const sanitized = sanitizeCover({ ...coverInput, id: coverId });
      if (supportsBattlemapCoverImageId && battlemap.activeImageId) {
        const effectiveImageId =
          typeof requestedImageId === 'string' && requestedImageId.trim() !== ''
            ? requestedImageId
            : battlemap.activeImageId;
        const key = `${effectiveImageId}:${sanitized.id}`;
        battlemap.covers.set(key, { ...sanitized, _imageId: effectiveImageId });
      } else {
        battlemap.covers.set(sanitized.id, sanitized);
      }

      logEvent('Added cover', sanitized.id, 'to', battlemap.id);
      respond(ack, { ok: true, coverId: sanitized.id });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('upsert cover', () => {
        const imageIdToPersist =
          supportsBattlemapCoverImageId && battlemap.activeImageId
            ? (typeof requestedImageId === 'string' && requestedImageId.trim() !== ''
                ? requestedImageId
                : battlemap.activeImageId)
            : null;
        return upsertCoverRow(battlemap.id, sanitized, imageIdToPersist);
      });
    });

    socket.on('battlemap:update-cover', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:update-cover', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const coverId = payload?.coverId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      const requestedImageId = payload?.battlemapImageId || payload?.imageId || null;
      const entry = coverId ? findCoverEntry(battlemap, coverId, requestedImageId) : null;
      if (!entry || !entry.existing) {
        respond(ack, { ok: false, error: 'cover-not-found' });
        return;
      }

      const existing = entry.existing;
      const sanitized = sanitizeCover({ ...existing, ...payload?.updates, id: coverId });
      if (supportsBattlemapCoverImageId && entry.imageId) {
        battlemap.covers.set(entry.key, { ...sanitized, _imageId: entry.imageId });
      } else {
        battlemap.covers.set(entry.key, sanitized);
      }

      logEvent('Updated cover', coverId, 'on', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('update cover', () => upsertCoverRow(battlemap.id, sanitized, entry.imageId ?? null));
    });

    socket.on('battlemap:remove-cover', (payload, ack) => {
      if (!ensureBattlemapMutator('battlemap:remove-cover', ack)) {
        return;
      }

      const battlemapId = payload?.battlemapId;
      const coverId = payload?.coverId;
      const battlemap = getBattlemapOrRespond(battlemapId, ack);
      if (!battlemap) {
        return;
      }

      const requestedImageId = payload?.battlemapImageId || payload?.imageId || null;
      const entry = coverId ? findCoverEntry(battlemap, coverId, requestedImageId) : null;
      if (!coverId || !entry) {
        respond(ack, { ok: false, error: 'cover-not-found' });
        return;
      }

      battlemap.covers.delete(entry.key);

      logEvent('Removed cover', coverId, 'from', battlemap.id);
      respond(ack, { ok: true });
      emitBattlemapUpdate(battlemap.id);
      runBackgroundTask('delete cover', () => deleteCoverRow(coverId));
    });

    // Handle position updates
    socket.on('position-update', (data) => {
      // Support both old format (just position) and new format (tokenId + position)
      let targetUserId = userId;
      let position;
      
      if (data && typeof data === 'object' && data.tokenId && data.position) {
        // New format: { tokenId, position }
        targetUserId = data.tokenId;
        position = data.position;
      } else {
        // Old format: just position (backward compatibility)
        position = data;
      }

      // Find the target user (could be the sender or any other user)
      const targetUser = users.get(targetUserId);
      if (targetUser) {
        targetUser.position = position;
        // Broadcast to all clients (including sender) so everyone sees the update
        socket.broadcast.emit('user-moved', {
          userId: targetUserId,
          position,
        });
      }
    });

    // Handle token image updates
    socket.on('token-image-update', (data) => {
      const { tokenId, imageSrc } = data;
      if (!tokenId) return;

      // Find the target user
      const targetUser = users.get(tokenId);
      if (targetUser) {
        targetUser.imageSrc = imageSrc || null;
        // Broadcast to all clients (including sender) so everyone sees the update
        io.emit('token-image-updated', {
          userId: tokenId,
          imageSrc: imageSrc || null,
        });
      }
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

      io.emit('token-size-updated', {
        userId: tokenId,
        size: nextSize,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = users.get(userId);
      const displayUser = displayModeUsers.get(userId);
      
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
          disconnectedAt: Date.now(),
        };

        disconnectedUsers.set(persistentId, disconnectedUserData);
        users.delete(userId);
        // Broadcast to all other clients with color and position
        socket.broadcast.emit('user-disconnected', {
          userId,
          persistentUserId: persistentId,
          color: user.color,
          position: user.position,
          imageSrc: user.imageSrc || null,
          size: sanitizeTokenSize(user.size),
        });
      } else if (displayUser) {
        // Clean up display mode user
        displayModeUsers.delete(userId);
      }
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
        
        // Broadcast removal to all clients
        io.emit('token-removed', { persistentUserId: data.persistentUserId });
      }
    });

    // Handle adding a new token (colored token, not a user)
    socket.on('add-token', (data) => {
      const { color, position, size, imageSrc } = data;
      // Generate a unique ID for this token
      const tokenId = `token-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const persistentTokenId = `token-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      
      // Create token data (treating it like a user for consistency)
      const tokenData = {
        id: tokenId,
        persistentUserId: persistentTokenId,
        color: color || getRandomColor(),
        position: position || { x: 50, y: 50 },
        size: sanitizeTokenSize(size),
        imageSrc: typeof imageSrc === 'string' ? imageSrc : null,
        isDisplay: false, // Tokens are not display mode users
      };

      // Add to users map (tokens are treated as users in the system)
      users.set(tokenId, tokenData);

      // Broadcast new token to all clients
      io.emit('token-added', {
        userId: tokenId,
        persistentUserId: persistentTokenId,
        color: tokenData.color,
        position: tokenData.position,
        size: tokenData.size,
        imageSrc: tokenData.imageSrc || null,
      });
    });

    socket.on('add-cover', (data) => {
      if (!data) return;
      const { id: incomingId, x, y, width, height, color } = data;

      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof width !== 'number' ||
        typeof height !== 'number'
      ) {
        return;
      }

      const id =
        typeof incomingId === 'string' && incomingId.trim() !== ''
          ? incomingId
          : `cover-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const sanitizedWidth = clamp(width, 0, 100);
      const sanitizedHeight = clamp(height, 0, 100);
      const maxX = 100 - sanitizedWidth;
      const maxY = 100 - sanitizedHeight;

      const cover = {
        id,
        x: clamp(x, 0, maxX),
        y: clamp(y, 0, maxY),
        width: sanitizedWidth,
        height: sanitizedHeight,
        color: typeof color === 'string' ? color : '#808080',
      };

      covers.set(id, cover);
      io.emit('cover-added', cover);
    });

    socket.on('remove-cover', (data) => {
      const id = data?.id;
      if (typeof id !== 'string') {
        return;
      }

      if (covers.delete(id)) {
        io.emit('cover-removed', { id });
      }
    });

    socket.on('update-cover', (data) => {
      const id = data?.id;
      if (typeof id !== 'string') {
        return;
      }

      const cover = covers.get(id);
      if (!cover) {
        return;
      }

      const updates = {};

      if (typeof data.x === 'number') {
        updates.x = data.x;
      }
      if (typeof data.y === 'number') {
        updates.y = data.y;
      }
      if (typeof data.width === 'number') {
        updates.width = clamp(data.width, 0, 100);
      }
      if (typeof data.height === 'number') {
        updates.height = clamp(data.height, 0, 100);
      }
      if (typeof data.color === 'string') {
        updates.color = data.color;
      }

      const nextWidth = updates.width ?? cover.width;
      const nextHeight = updates.height ?? cover.height;
      const maxX = 100 - nextWidth;
      const maxY = 100 - nextHeight;

      const nextCover = {
        ...cover,
        ...updates,
      };

      if (typeof updates.x === 'number') {
        nextCover.x = clamp(updates.x, 0, maxX);
      } else {
        nextCover.x = clamp(nextCover.x, 0, maxX);
      }

      if (typeof updates.y === 'number') {
        nextCover.y = clamp(updates.y, 0, maxY);
      } else {
        nextCover.y = clamp(nextCover.y, 0, maxY);
      }

      covers.set(id, nextCover);
      io.broadcast.emit('cover-updated', nextCover);
    });
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


