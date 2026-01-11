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
import { GridData, sanitizeGridData } from "../utils/gridData";
import { Cover } from "../types";

const COVER_DEFAULT_COLOR = "#808080";
const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const generateCoverId = () => `cover-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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

interface BattlemapData extends BattlemapSettings {
  id: string;
  name: string;
  mapPath: string | null;
  images: BattlemapImageSummary[];
  activeImageId: string | null;
  gridData: GridData;
  covers: Cover[];
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
  addCover: (cover: Omit<Cover, "id"> & { id?: string }) => Promise<Cover | null>;
  updateCover: (id: string, updates: Partial<Cover>) => Promise<void>;
  removeCover: (id: string) => Promise<void>;
  reorderBattlemaps: (orderedIds: string[]) => Promise<void>;
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
  covers?: Partial<Cover>[] | null;
}

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

const parseCover = (input: Partial<Cover> | null | undefined): Cover | null => {
  if (!input || typeof input !== "object" || typeof input.id !== "string") {
    return null;
  }

  const { id, x, y, width, height, color } = input as Cover;

  return {
    id,
    x: typeof x === "number" ? x : 0,
    y: typeof y === "number" ? y : 0,
    width: typeof width === "number" ? width : 0,
    height: typeof height === "number" ? height : 0,
    color: typeof color === "string" ? color : COVER_DEFAULT_COLOR,
  };
};

const sanitizeCoverInput = (input: Partial<Cover> & { id: string }): Cover => {
  const width = clampValue(typeof input.width === "number" ? input.width : 0, 0, 100);
  const height = clampValue(typeof input.height === "number" ? input.height : 0, 0, 100);
  const maxX = 100 - width;
  const maxY = 100 - height;

  return {
    id: input.id,
    width,
    height,
    x: clampValue(typeof input.x === "number" ? input.x : 0, 0, maxX),
    y: clampValue(typeof input.y === "number" ? input.y : 0, 0, maxY),
    color:
      typeof input.color === "string" && input.color.trim() !== ""
        ? input.color
        : COVER_DEFAULT_COLOR,
  };
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
  const covers: Cover[] = Array.isArray(payload.covers)
    ? payload.covers.map(parseCover).filter((cover): cover is Cover => cover !== null)
    : [];

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
    covers,
  };
};

export const BattlemapProvider = ({ children }: { children: React.ReactNode }) => {
  const { isDisplay, isMounted } = useViewMode();
  const allowBattlemapMutations = isDisplay;
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
      isDisplay,
      suppressPresence: true,
      allowBattlemapMutations: isDisplay,
    };
    socket.on("connect", () => {
      socket.emit("user-identify", identificationPayload);
    });

    const handleList = (list: BattlemapSummary[]) => {
      debugLog("battlemap:list", list.map((item) => ({ id: item.id, name: item.name })));
      setBattlemaps(list);
      setIsListLoading(false);
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
  }, [isMounted, isDisplay]);

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
    [emitWithAck]
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

  const addCover = useCallback(
    async (coverInput: Omit<Cover, "id"> & { id?: string }) => {
      if (!currentBattlemapId || !currentBattlemap) {
        return null;
      }

      debugLog("addCover", currentBattlemapId, coverInput);
      const coverId =
        typeof coverInput.id === "string" && coverInput.id.trim() !== ""
          ? coverInput.id
          : generateCoverId();
      const sanitized = sanitizeCoverInput({ ...coverInput, id: coverId });

      setCurrentBattlemap((prev) =>
        prev
          ? {
              ...prev,
              covers: [...prev.covers.filter((cover) => cover.id !== sanitized.id), sanitized],
            }
          : prev
      );

      try {
        await emitWithAck("battlemap:add-cover", {
          battlemapId: currentBattlemapId,
          battlemapImageId: currentBattlemap.activeImageId ?? null,
          cover: sanitized,
        });
        return sanitized;
      } catch (insertError) {
        console.error("Failed to add cover", insertError);
        setError("Failed to add cover");
        await refreshBattlemap();
        return null;
      }
    },
    [currentBattlemap, currentBattlemapId, emitWithAck, refreshBattlemap]
  );

  const updateCover = useCallback(
    async (id: string, updates: Partial<Cover>) => {
      if (!currentBattlemapId) {
        return;
      }

      debugLog("updateCover", id, updates);
      setCurrentBattlemap((prev) => {
        if (!prev) {
          return prev;
        }
        const existing = prev.covers.find((cover) => cover.id === id);
        if (!existing) {
          return prev;
        }
        const sanitized = sanitizeCoverInput({ ...existing, ...updates, id });
        return {
          ...prev,
          covers: prev.covers.map((cover) => (cover.id === id ? sanitized : cover)),
        };
      });

      try {
        await emitWithAck("battlemap:update-cover", {
          battlemapId: currentBattlemapId,
          battlemapImageId: currentBattlemap?.activeImageId ?? null,
          coverId: id,
          updates,
        });
      } catch (updateError) {
        console.error("Failed to update cover", updateError);
        setError("Failed to update cover");
        await refreshBattlemap();
      }
    },
    [currentBattlemap?.activeImageId, currentBattlemapId, emitWithAck, refreshBattlemap]
  );

  const removeCover = useCallback(
    async (id: string) => {
      if (!currentBattlemapId) {
        return;
      }

      debugLog("removeCover", id);
      setCurrentBattlemap((prev) =>
        prev
          ? {
              ...prev,
              covers: prev.covers.filter((cover) => cover.id !== id),
            }
          : prev
      );

      try {
        await emitWithAck("battlemap:remove-cover", {
          battlemapId: currentBattlemapId,
          battlemapImageId: currentBattlemap?.activeImageId ?? null,
          coverId: id,
        });
      } catch (deleteError) {
        console.error("Failed to remove cover", deleteError);
        setError("Failed to remove cover");
        await refreshBattlemap();
      }
    },
    [currentBattlemap?.activeImageId, currentBattlemapId, emitWithAck, refreshBattlemap]
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
      addCover,
      updateCover,
      removeCover,
      reorderBattlemaps,
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
      addCover,
      updateCover,
      removeCover,
      reorderBattlemaps,
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
