"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { useViewMode } from "../hooks/useViewMode";
import { isDmSurface, useSurface } from "../hooks/useSurface";
import { GridData, sanitizeGridData } from "../utils/gridData";

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const DEFAULT_SETTINGS = {
  gridScale: 1,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

interface BattlemapSummary {
  id: string;
  name: string;
  mapPath: string | null;
}

interface BattlemapImageSummary {
  id: string;
  name: string;
  mapPath: string | null;
}

interface BattlemapSettings {
  gridScale: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

export interface SpawnArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FogShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BattlemapData extends BattlemapSettings {
  id: string;
  name: string;
  mapPath: string | null;
  images: BattlemapImageSummary[];
  activeImageId: string | null;
  gridData: GridData;
  spawnArea: SpawnArea;
  fogShapes: FogShape[];
}

interface CreateBattlemapInput {
  name: string;
  mapPath: string;
}

interface BattlemapContextValue {
  battlemaps: BattlemapSummary[];
  currentBattlemapId: string | null;
  currentBattlemap: BattlemapData | null;
  isListLoading: boolean;
  isBattlemapLoading: boolean;
  isSettingsSaving: boolean;
  isMutating: boolean;
  error: string | null;
  selectBattlemap: (battlemapId: string) => void;
  refreshBattlemap: () => Promise<void>;
  renameBattlemap: (name: string) => Promise<void>;
  updateBattlemapMapPath: (mapPath: string, battlemapImageId?: string | null) => Promise<void>;
  setActiveBattlemapImage: (imageId: string) => Promise<void>;
  createBattlemapImage: (name?: string) => Promise<string | null>;
  renameBattlemapImage: (imageId: string, name: string) => Promise<void>;
  deleteBattlemapImage: (imageId: string) => Promise<void>;
  updateBattlemapSettings: (updates: Partial<BattlemapSettings>) => void;
  createBattlemap: (input: CreateBattlemapInput) => Promise<BattlemapSummary | null>;
  syncBattlemapFromServer: (battlemapId: string | null) => void;
  deleteBattlemap: (battlemapId: string) => Promise<void>;
  reorderBattlemaps: (orderedIds: string[]) => Promise<void>;
  updateSpawnArea: (spawnArea: SpawnArea) => Promise<void>;
  addFogArea: (shape: Omit<FogShape, "id">) => Promise<void>;
  removeFogArea: (id: string) => Promise<void>;
  updateFogArea: (id: string, updates: Partial<Omit<FogShape, "id">>) => Promise<void>;
  clearFog: () => Promise<void>;
  canManageBattlemaps: boolean;
}

interface BattlemapPayload {
  id: string;
  name?: string | null;
  mapPath?: string | null;
  images?: BattlemapImageSummary[] | null;
  activeImageId?: string | null;
  gridScale?: number | null;
  gridOffsetX?: number | null;
  gridOffsetY?: number | null;
  gridData?: GridData | null;
  spawnArea?: Partial<SpawnArea> | null;
  fogShapes?: Partial<FogShape>[] | null;
}

const DEFAULT_SPAWN_AREA: SpawnArea = { x: 40, y: 40, width: 20, height: 20 };
const sanitizeSpawnArea = (input: Partial<SpawnArea> | null | undefined): SpawnArea => {
  if (!input || typeof input !== "object") return { ...DEFAULT_SPAWN_AREA };
  const width = clampValue(typeof input.width === "number" ? input.width : DEFAULT_SPAWN_AREA.width, 1, 100);
  const height = clampValue(typeof input.height === "number" ? input.height : DEFAULT_SPAWN_AREA.height, 1, 100);
  return {
    x: clampValue(typeof input.x === "number" ? input.x : DEFAULT_SPAWN_AREA.x, 0, 100 - width),
    y: clampValue(typeof input.y === "number" ? input.y : DEFAULT_SPAWN_AREA.y, 0, 100 - height),
    width,
    height,
  };
};

const BattlemapContext = createContext<BattlemapContextValue | undefined>(undefined);

const debugLog = (...args: unknown[]) => {
  console.log("[BattlemapProvider]", ...args);
};

const getWebSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

const getPersistentUserId = () => {
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

const hasBattlemapPayload = (value: unknown): value is { battlemap?: BattlemapPayload | null } =>
  typeof value === "object" && value !== null && "battlemap" in value;

const extractBattlemapId = (value: unknown): string | null => {
  if (typeof value === "object" && value !== null && "battlemapId" in value) {
    const id = (value as { battlemapId?: unknown }).battlemapId;
    return typeof id === "string" ? id : null;
  }
  return null;
};

const normalizeBattlemapPayload = (payload: BattlemapPayload): BattlemapData => {
  const gridData = sanitizeGridData(payload.gridData);

  const images: BattlemapImageSummary[] = Array.isArray(payload.images)
    ? payload.images
        .filter((img): img is BattlemapImageSummary => Boolean(img && typeof img.id === "string"))
        .map((img) => ({
          id: img.id,
          name: typeof img.name === "string" && img.name.trim() ? img.name.trim() : "Floor",
          mapPath: img.mapPath ?? null,
        }))
    : [];

  const activeImageId =
    typeof payload.activeImageId === "string" && payload.activeImageId.trim() !== ""
      ? payload.activeImageId
      : null;

  return {
    id: payload.id,
    name: payload.name?.trim() || "Untitled Battlemap",
    mapPath: payload.mapPath ?? null,
    images,
    activeImageId,
    gridScale:
      typeof payload.gridScale === "number" && Number.isFinite(payload.gridScale)
        ? payload.gridScale
        : DEFAULT_SETTINGS.gridScale,
    gridOffsetX:
      typeof payload.gridOffsetX === "number" && Number.isFinite(payload.gridOffsetX)
        ? payload.gridOffsetX
        : DEFAULT_SETTINGS.gridOffsetX,
    gridOffsetY:
      typeof payload.gridOffsetY === "number" && Number.isFinite(payload.gridOffsetY)
        ? payload.gridOffsetY
        : DEFAULT_SETTINGS.gridOffsetY,
    gridData,
    spawnArea: sanitizeSpawnArea(payload.spawnArea),
    fogShapes: Array.isArray(payload.fogShapes)
      ? payload.fogShapes
          .map((s): FogShape | null => {
            if (!s || typeof s !== "object" || typeof s.id !== "string") return null;
            const x = typeof s.x === "number" ? s.x : 0;
            const y = typeof s.y === "number" ? s.y : 0;
            const width = typeof s.width === "number" ? s.width : 0;
            const height = typeof s.height === "number" ? s.height : 0;
            if (width <= 0 || height <= 0) return null;
            return { id: s.id, x, y, width, height };
          })
          .filter((s): s is FogShape => s !== null)
      : [],
  };
};

export const BattlemapProvider = ({ children }: { children: React.ReactNode }) => {
  const { isMounted } = useViewMode();
  const surface = useSurface();
  // Both /dashboard and /display run on the DM's machine; only the dashboard
  // actually exposes mutation UI, but we trust either to send mutations.
  const isDisplay = isDmSurface(surface);
  const allowBattlemapMutations = surface === "dashboard";
  const [battlemaps, setBattlemaps] = useState<BattlemapSummary[]>([]);
  const [currentBattlemapId, setCurrentBattlemapId] = useState<string | null>(null);
  const [currentBattlemap, setCurrentBattlemap] = useState<BattlemapData | null>(null);
  const [isListLoading, setIsListLoading] = useState<boolean>(true);
  const [isBattlemapLoading, setIsBattlemapLoading] = useState<boolean>(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistentUserIdRef = useRef<string | null>(null);
  // Tracks URLs already kicked off via `new Image()` so re-renders don't
  // refire the same request. Backed by the browser's HTTP cache; this set
  // only suppresses duplicate work in the JS layer.
  const prefetchedImagesRef = useRef<Set<string>>(new Set());

  const prefetchImage = useCallback((url: string | null | undefined) => {
    if (typeof window === "undefined") return;
    if (!url) return;
    const set = prefetchedImagesRef.current;
    if (set.has(url)) return;
    set.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }, []);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  const emitWithAck = useCallback((event: string, payload: Record<string, unknown>) => {
    return new Promise<unknown>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error("Socket not connected"));
        return;
      }

      let settled = false;
      debugLog("emit", event, payload);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Request timed out"));
        }
      }, 10000);

      socket.emit(event, payload, (response: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        const ack = (response ?? {}) as { ok?: boolean; error?: string };
        debugLog("ack", event, ack);

        if (!ack || ack.ok !== false) {
          resolve(response);
        } else {
          reject(new Error(ack.error || "Request failed"));
        }
      });
    });
  }, []);

  const reorderBattlemaps = useCallback(
    async (orderedIds: string[]) => {
      if (!allowBattlemapMutations || !Array.isArray(orderedIds) || orderedIds.length === 0) {
        return;
      }

      if (
        orderedIds.length !== battlemaps.length ||
        new Set(orderedIds).size !== battlemaps.length ||
        !battlemaps.every((battlemap) => orderedIds.includes(battlemap.id))
      ) {
        console.warn("[BattlemapProvider] Ignoring invalid battlemap reorder request");
        return;
      }

      const previousOrder = battlemaps;
      const mapping = new Map(previousOrder.map((battlemap) => [battlemap.id, battlemap]));

      setBattlemaps(
        orderedIds
          .map((id) => mapping.get(id))
          .filter((battlemap): battlemap is BattlemapSummary => Boolean(battlemap))
      );

      setIsMutating(true);
      setError(null);

      try {
        await emitWithAck("battlemap:reorder", { orderedIds });
      } catch (reorderError) {
        console.error("Failed to reorder battlemaps", reorderError);
        setError("Failed to reorder battlemaps");
        setBattlemaps(previousOrder);
      } finally {
        setIsMutating(false);
      }
    },
    [allowBattlemapMutations, battlemaps, emitWithAck]
  );

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    persistentUserIdRef.current = getPersistentUserId();
    setIsListLoading(true);
    setError(null);

    const socket = io(getWebSocketUrl(), {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const identificationPayload = {
      persistentUserId: persistentUserIdRef.current,
      surface,
      isDisplay,
      suppressPresence: true,
      allowBattlemapMutations,
    };
    socket.on("connect", () => {
      socket.emit("user-identify", identificationPayload);
    });

    const handleList = (list: BattlemapSummary[]) => {
      debugLog("battlemap:list", list.map((item) => ({ id: item.id, name: item.name })));
      setBattlemaps(list);
      setIsListLoading(false);
      // Warm the cache for every map's top image so switching maps is
      // instant. Per-floor preload happens after the full battlemap loads.
      list.forEach((item) => prefetchImage(item.mapPath));
    };

    const handleUpdated = (payload: BattlemapPayload) => {
      debugLog("battlemap:updated", payload.id);
      const normalized = normalizeBattlemapPayload(payload);
      setBattlemaps((prev) =>
        prev.map((item) =>
          item.id === normalized.id ? { ...item, name: normalized.name, mapPath: normalized.mapPath } : item
        )
      );
      setCurrentBattlemap((prev) => (prev?.id === normalized.id ? normalized : prev));
      prefetchImage(normalized.mapPath);
      normalized.images?.forEach((img) => prefetchImage(img.mapPath));
    };

    const handleDeleted = ({ battlemapId }: { battlemapId: string }) => {
      debugLog("battlemap:deleted", battlemapId);
      setBattlemaps((prev) => prev.filter((item) => item.id !== battlemapId));
      setCurrentBattlemap((prev) => (prev?.id === battlemapId ? null : prev));
      setCurrentBattlemapId((prev) => (prev === battlemapId ? null : prev));
    };

    const handleError = (connectionError: Error) => {
      console.error("Battlemap socket error", connectionError);
      setError("Battlemap connection failed");
      setIsListLoading(false);
    };

    const handleActive = ({ battlemapId }: { battlemapId: string | null }) => {
      debugLog("battlemap:active", battlemapId);
      setCurrentBattlemapId((prev) => (prev === battlemapId ? prev : battlemapId));
    };

    socket.on("battlemap:list", handleList);
    socket.on("battlemap:active", handleActive);
    socket.on("battlemap:updated", handleUpdated);
    socket.on("battlemap:deleted", handleDeleted);
    socket.on("connect_error", handleError);

    return () => {
      socket.off("battlemap:list", handleList);
      socket.off("battlemap:active", handleActive);
      socket.off("battlemap:updated", handleUpdated);
      socket.off("battlemap:deleted", handleDeleted);
      socket.off("connect_error", handleError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isMounted, isDisplay, surface, allowBattlemapMutations, prefetchImage]);

  const requestBattlemap = useCallback(
    async (battlemapId: string) => {
      debugLog("requestBattlemap", battlemapId);
      setIsBattlemapLoading(true);
      setError(null);
      try {
        const response = await emitWithAck("battlemap:get", { battlemapId });
        if (hasBattlemapPayload(response) && response.battlemap) {
          const normalized = normalizeBattlemapPayload(response.battlemap as BattlemapPayload);
          debugLog("battlemap:get success", battlemapId, normalized.name);
          setCurrentBattlemap(normalized);
          // Floors aren't included in the list summary; once we have the
          // full battlemap, warm the cache for every floor so floor-switch
          // is also instant.
          prefetchImage(normalized.mapPath);
          normalized.images?.forEach((img) => prefetchImage(img.mapPath));
        } else {
          debugLog("battlemap:get returned empty", battlemapId);
          setCurrentBattlemap(null);
        }
      } catch (loadError) {
        console.error("Failed to load battlemap", loadError);
        setError("Failed to load battlemap");
        setCurrentBattlemap(null);
      } finally {
        setIsBattlemapLoading(false);
      }
    },
    [emitWithAck, prefetchImage]
  );

  useEffect(() => {
    if (!currentBattlemapId) {
      debugLog("currentBattlemapId cleared");
      setCurrentBattlemap(null);
      return;
    }

    debugLog("currentBattlemapId changed", currentBattlemapId);
    requestBattlemap(currentBattlemapId);
  }, [currentBattlemapId, requestBattlemap]);

  const selectBattlemap = useCallback(
    async (battlemapId: string) => {
      if (!battlemapId) {
        debugLog("selectBattlemap called with empty id");
        return;
      }

      debugLog("selectBattlemap local change", battlemapId);
      setCurrentBattlemapId((prev) => (prev === battlemapId ? prev : battlemapId));

      if (allowBattlemapMutations) {
        try {
          await emitWithAck("battlemap:set-active", { battlemapId });
        } catch (activeError) {
          console.error("Failed to set active battlemap", activeError);
          setError("Failed to set active battlemap");
        }
      }
    },
    [allowBattlemapMutations, emitWithAck]
  );

  const refreshBattlemap = useCallback(async () => {
    if (currentBattlemapId) {
      await requestBattlemap(currentBattlemapId);
    }
  }, [currentBattlemapId, requestBattlemap]);

  const renameBattlemap = useCallback(
    async (name: string) => {
      if (!currentBattlemapId) {
        return;
      }

      debugLog("renameBattlemap", currentBattlemapId, name);
      setIsMutating(true);
      setError(null);
      try {
        const trimmedName = name.trim() || "Untitled Battlemap";
        await emitWithAck("battlemap:rename", {
          battlemapId: currentBattlemapId,
          name: trimmedName,
        });
      } catch (renameError) {
        console.error("Failed to rename battlemap", renameError);
        setError("Failed to rename battlemap");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck]
  );

  const updateBattlemapMapPath = useCallback(
    async (mapPath: string, battlemapImageId?: string | null) => {
      if (!currentBattlemapId) {
        return;
      }

      debugLog("updateBattlemapMapPath", currentBattlemapId, mapPath);
      setIsMutating(true);
      setError(null);
      try {
        const sanitizedMapPath = mapPath.trim();
        await emitWithAck("battlemap:update-map-path", {
          battlemapId: currentBattlemapId,
          battlemapImageId: battlemapImageId ?? currentBattlemap?.activeImageId ?? null,
          mapPath: sanitizedMapPath || null,
        });
        await requestBattlemap(currentBattlemapId);
      } catch (updateError) {
        console.error("Failed to update map path", updateError);
        setError("Failed to update map path");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemap?.activeImageId, currentBattlemapId, emitWithAck, requestBattlemap]
  );

  const setActiveBattlemapImage = useCallback(
    async (imageId: string) => {
      if (!currentBattlemapId) {
        return;
      }
      const trimmed = imageId.trim();
      if (!trimmed) {
        return;
      }

      debugLog("setActiveBattlemapImage", currentBattlemapId, trimmed);
      setIsMutating(true);
      setError(null);
      try {
        await emitWithAck("battlemap:set-active-image", {
          battlemapId: currentBattlemapId,
          imageId: trimmed,
        });
      } catch (activeImageError) {
        console.error("Failed to set active floor", activeImageError);
        setError("Failed to change floor");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck]
  );

  const createBattlemapImage = useCallback(
    async (name?: string) => {
      if (!currentBattlemapId) {
        return null;
      }

      debugLog("createBattlemapImage", currentBattlemapId, name);
      setIsMutating(true);
      setError(null);
      try {
        const response = await emitWithAck("battlemap:add-image", {
          battlemapId: currentBattlemapId,
          name: typeof name === "string" ? name : undefined,
        });
        const imageId =
          typeof response === "object" && response !== null && "imageId" in response
            ? (response as { imageId?: unknown }).imageId
            : null;
        const normalizedId = typeof imageId === "string" ? imageId : null;
        await requestBattlemap(currentBattlemapId);
        return normalizedId;
      } catch (createImageError) {
        console.error("Failed to add floor", createImageError);
        setError("Failed to add floor");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck, requestBattlemap]
  );

  const renameBattlemapImage = useCallback(
    async (imageId: string, name: string) => {
      if (!currentBattlemapId) {
        return;
      }
      const trimmedId = imageId.trim();
      const trimmedName = name.trim();
      if (!trimmedId || !trimmedName) {
        return;
      }

      debugLog("renameBattlemapImage", currentBattlemapId, trimmedId, trimmedName);
      setIsMutating(true);
      setError(null);
      try {
        await emitWithAck("battlemap:rename-image", {
          battlemapId: currentBattlemapId,
          imageId: trimmedId,
          name: trimmedName,
        });
      } catch (renameImageError) {
        console.error("Failed to rename floor", renameImageError);
        setError("Failed to rename floor");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck]
  );

  const deleteBattlemapImage = useCallback(
    async (imageId: string) => {
      if (!currentBattlemapId) {
        return;
      }
      const trimmedId = imageId.trim();
      if (!trimmedId) {
        return;
      }

      debugLog("deleteBattlemapImage", currentBattlemapId, trimmedId);
      setIsMutating(true);
      setError(null);
      try {
        await emitWithAck("battlemap:delete-image", {
          battlemapId: currentBattlemapId,
          imageId: trimmedId,
        });
        await requestBattlemap(currentBattlemapId);
      } catch (deleteImageError) {
        console.error("Failed to delete floor", deleteImageError);
        setError("Failed to delete floor");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck, requestBattlemap]
  );

  const updateBattlemapSettings = useCallback(
    (updates: Partial<BattlemapSettings>) => {
      if (!currentBattlemapId) {
        return;
      }

      debugLog("updateBattlemapSettings", currentBattlemapId, updates);
      let nextSettings: BattlemapSettings | null = null;
      setCurrentBattlemap((prev) => {
        if (!prev) {
          return prev;
        }

        const updated: BattlemapData = {
          ...prev,
          gridScale: updates.gridScale ?? prev.gridScale,
          gridOffsetX: updates.gridOffsetX ?? prev.gridOffsetX,
          gridOffsetY: updates.gridOffsetY ?? prev.gridOffsetY,
        };

        nextSettings = {
          gridScale: updated.gridScale,
          gridOffsetX: updated.gridOffsetX,
          gridOffsetY: updated.gridOffsetY,
        };

        return updated;
      });

      if (nextSettings) {
        clearDebounceTimer();
        debounceTimerRef.current = setTimeout(() => {
          setIsSettingsSaving(true);
          emitWithAck("battlemap:update-settings", {
            battlemapId: currentBattlemapId,
            ...nextSettings,
          })
            .catch((settingsError) => {
              console.error("Failed to update battlemap settings", settingsError);
              setError("Failed to update battlemap settings");
            })
            .finally(() => {
              setIsSettingsSaving(false);
            });
        }, 500);
      }
    },
    [currentBattlemapId, clearDebounceTimer, emitWithAck]
  );

  const addFogArea = useCallback(
    async (shape: Omit<FogShape, "id">) => {
      if (!allowBattlemapMutations) return;
      try {
        await emitWithAck("fog:add-area", { shape });
      } catch (fogError) {
        console.error("Failed to add fog area", fogError);
      }
    },
    [allowBattlemapMutations, emitWithAck]
  );

  const removeFogArea = useCallback(
    async (id: string) => {
      if (!allowBattlemapMutations) return;
      try {
        await emitWithAck("fog:remove-area", { id });
      } catch (fogError) {
        console.error("Failed to remove fog area", fogError);
      }
    },
    [allowBattlemapMutations, emitWithAck]
  );

  const updateFogArea = useCallback(
    async (id: string, updates: Partial<Omit<FogShape, "id">>) => {
      if (!allowBattlemapMutations) return;
      // Optimistic update so dragging feels responsive — server will
      // confirm via battlemap:updated.
      setCurrentBattlemap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fogShapes: prev.fogShapes.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        };
      });
      try {
        await emitWithAck("fog:update-area", { id, updates });
      } catch (fogError) {
        console.error("Failed to update fog area", fogError);
      }
    },
    [allowBattlemapMutations, emitWithAck]
  );

  const clearFog = useCallback(async () => {
    if (!allowBattlemapMutations) return;
    try {
      await emitWithAck("fog:clear", {});
    } catch (fogError) {
      console.error("Failed to clear fog", fogError);
    }
  }, [allowBattlemapMutations, emitWithAck]);

  const updateSpawnArea = useCallback(
    async (spawnArea: SpawnArea) => {
      if (!currentBattlemapId || !allowBattlemapMutations) return;
      const sanitized = sanitizeSpawnArea(spawnArea);
      // Optimistic update so the rectangle redraws instantly.
      setCurrentBattlemap((prev) => (prev ? { ...prev, spawnArea: sanitized } : prev));
      try {
        await emitWithAck("battlemap:update-spawn-area", {
          battlemapId: currentBattlemapId,
          spawnArea: sanitized,
        });
      } catch (spawnError) {
        console.error("Failed to update spawn area", spawnError);
        setError("Failed to update spawn area");
      }
    },
    [allowBattlemapMutations, currentBattlemapId, emitWithAck]
  );

  const createBattlemap = useCallback(
    async ({ name, mapPath }: CreateBattlemapInput) => {
      debugLog("createBattlemap", name, mapPath);
      setIsMutating(true);
      setError(null);

      try {
        const normalizedName = name.trim() || "Untitled Battlemap";
        const normalizedMapPath = mapPath.trim() || null;
        const response = await emitWithAck("battlemap:create", {
          name: normalizedName,
          mapPath: normalizedMapPath,
        });

        const newBattlemapId = extractBattlemapId(response);
        if (typeof newBattlemapId === "string") {
          setCurrentBattlemapId(newBattlemapId);
          await requestBattlemap(newBattlemapId);
          const summary: BattlemapSummary = {
            id: newBattlemapId,
            name: normalizedName,
            mapPath: normalizedMapPath,
          };
          return summary;
        }

        return null;
      } catch (createError) {
        console.error("Failed to create battlemap", createError);
        setError("Failed to create battlemap");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [emitWithAck, requestBattlemap]
  );

  const syncBattlemapFromServer = useCallback((battlemapId: string | null) => {
    if (!battlemapId) {
      setCurrentBattlemapId(null);
      setCurrentBattlemap(null);
      return;
    }
    setCurrentBattlemapId((prev) => (prev === battlemapId ? prev : battlemapId));
  }, []);

  const deleteBattlemap = useCallback(
    async (battlemapId: string) => {
      debugLog("deleteBattlemap", battlemapId);
      setIsMutating(true);
      setError(null);
      try {
        await emitWithAck("battlemap:delete", { battlemapId });
        if (currentBattlemapId === battlemapId) {
          setCurrentBattlemapId(null);
          setCurrentBattlemap(null);
        }
      } catch (deleteError) {
        console.error("Failed to delete battlemap", deleteError);
        setError("Failed to delete battlemap");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, emitWithAck]
  );

  const value = useMemo<BattlemapContextValue>(
    () => ({
      battlemaps,
      currentBattlemapId,
      currentBattlemap,
      isListLoading,
      isBattlemapLoading,
      isSettingsSaving,
      isMutating,
      error,
      selectBattlemap,
      refreshBattlemap,
      renameBattlemap,
      updateBattlemapMapPath,
      setActiveBattlemapImage,
      createBattlemapImage,
      renameBattlemapImage,
      deleteBattlemapImage,
      updateBattlemapSettings,
      createBattlemap,
      syncBattlemapFromServer,
      deleteBattlemap,
      reorderBattlemaps,
      updateSpawnArea,
      addFogArea,
      removeFogArea,
      updateFogArea,
      clearFog,
      canManageBattlemaps: allowBattlemapMutations,
    }),
    [
      battlemaps,
      currentBattlemap,
      currentBattlemapId,
      isListLoading,
      isBattlemapLoading,
      isSettingsSaving,
      isMutating,
      error,
      selectBattlemap,
      refreshBattlemap,
      renameBattlemap,
      updateBattlemapMapPath,
      setActiveBattlemapImage,
      createBattlemapImage,
      renameBattlemapImage,
      deleteBattlemapImage,
      updateBattlemapSettings,
      createBattlemap,
      syncBattlemapFromServer,
      deleteBattlemap,
      reorderBattlemaps,
      updateSpawnArea,
      addFogArea,
      removeFogArea,
      updateFogArea,
      clearFog,
      allowBattlemapMutations,
    ]
  );

  return <BattlemapContext.Provider value={value}>{children}</BattlemapContext.Provider>;
};

export const useBattlemap = (): BattlemapContextValue => {
  const context = useContext(BattlemapContext);
  if (!context) {
    throw new Error("useBattlemap must be used within a BattlemapProvider");
  }
  return context;
};
