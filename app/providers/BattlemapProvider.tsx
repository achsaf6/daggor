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
import { supabase } from "../utils/supabase";
import {
  DEFAULT_GRID_DATA,
  GridData,
  fetchGridData,
  hasGridData,
  sanitizeGridData,
} from "../utils/gridData";
import { Cover } from "../types";
import {
  DEFAULT_BATTLEMAP_MAP_PATH,
  DEFAULT_BATTLEMAP_NAME,
} from "../../lib/defaultBattlemap";

const COVER_DEFAULT_COLOR = "#808080";
const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const generateCoverId = () =>
  `cover-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

interface BattlemapSummary {
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
  updateBattlemapMapPath: (mapPath: string) => Promise<void>;
  updateBattlemapSettings: (updates: Partial<BattlemapSettings>) => void;
  createBattlemap: (input: CreateBattlemapInput) => Promise<BattlemapSummary | null>;
  syncBattlemapFromServer: (battlemapId: string | null) => void;
  deleteBattlemap: (battlemapId: string) => Promise<void>;
  addCover: (cover: Omit<Cover, "id"> & { id?: string }) => Promise<Cover | null>;
  updateCover: (id: string, updates: Partial<Cover>) => Promise<void>;
  removeCover: (id: string) => Promise<void>;
}

const BattlemapContext = createContext<BattlemapContextValue | undefined>(undefined);

const DEFAULT_SETTINGS: BattlemapSettings = {
  gridScale: 1,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

const parseCover = (input: Partial<Cover> | null | undefined): Cover | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const { id, x, y, width, height, color } = input as Cover;
  if (typeof id !== "string") {
    return null;
  }

  return {
    id,
    x: typeof x === "number" ? x : 0,
    y: typeof y === "number" ? y : 0,
    width: typeof width === "number" ? width : 0,
    height: typeof height === "number" ? height : 0,
    color: typeof color === "string" ? color : "#808080",
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

export const BattlemapProvider = ({ children }: { children: React.ReactNode }) => {
  const [battlemaps, setBattlemaps] = useState<BattlemapSummary[]>([]);
  const [currentBattlemapId, setCurrentBattlemapId] = useState<string | null>(null);
  const [currentBattlemap, setCurrentBattlemap] = useState<BattlemapData | null>(null);
  const [isListLoading, setIsListLoading] = useState<boolean>(true);
  const [isBattlemapLoading, setIsBattlemapLoading] = useState<boolean>(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedingDefaultBattlemapRef = useRef<boolean>(false);

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

  const seedDefaultBattlemap = useCallback(async (): Promise<BattlemapSummary | null> => {
    if (seedingDefaultBattlemapRef.current) {
      return null;
    }

    seedingDefaultBattlemapRef.current = true;
    try {
      const initialGridData = {
        verticalLines: [...DEFAULT_GRID_DATA.verticalLines],
        horizontalLines: [...DEFAULT_GRID_DATA.horizontalLines],
        imageWidth: DEFAULT_GRID_DATA.imageWidth,
        imageHeight: DEFAULT_GRID_DATA.imageHeight,
      };

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

      if (insertError) {
        throw insertError;
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        name: data.name ?? DEFAULT_BATTLEMAP_NAME,
        mapPath: data.map_path ?? null,
      };
    } catch (seedError) {
      console.error("Failed to seed default battlemap", seedError);
      return null;
    } finally {
      seedingDefaultBattlemapRef.current = false;
    }
  }, []);

  const loadBattlemaps = useCallback(async () => {
    setIsListLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("battlemaps")
        .select("id, name, map_path")
        .order("created_at", { ascending: true });

      if (queryError) {
        throw queryError;
      }

      const summaries: BattlemapSummary[] =
        data?.map((row) => ({
          id: row.id,
          name: row.name ?? "Untitled Battlemap",
          mapPath: row.map_path ?? null,
        })) ?? [];

      if (summaries.length === 0) {
        const seeded = await seedDefaultBattlemap();
        if (seeded) {
          setBattlemaps([seeded]);
          setCurrentBattlemapId((prev) => prev ?? seeded.id);
        } else {
          setBattlemaps([]);
        }
        return;
      }

      setBattlemaps(summaries);

      // Default to first battlemap if none selected
      setCurrentBattlemapId((prev) => (prev ? prev : summaries[0]?.id ?? null));
    } catch (loadError) {
      console.error("Failed to load battlemaps", loadError);
      setError("Failed to load battlemaps");
      setBattlemaps([]);
    } finally {
      setIsListLoading(false);
    }
  }, [seedDefaultBattlemap]);

  const loadBattlemap = useCallback(
    async (battlemapId: string) => {
      setIsBattlemapLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from("battlemaps")
          .select(
            `
            id,
            name,
            map_path,
            grid_scale,
            grid_offset_x,
            grid_offset_y,
            grid_data,
            battlemap_covers (
              id,
              x,
              y,
              width,
              height,
              color
            )
          `
          )
          .eq("id", battlemapId)
          .maybeSingle();

        if (queryError) {
          throw queryError;
        }

        if (!data) {
          throw new Error("Battlemap not found");
        }

        const mapPath = data.map_path ?? null;
        const gridScale =
          typeof data.grid_scale === "number" && Number.isFinite(data.grid_scale)
            ? data.grid_scale
            : DEFAULT_SETTINGS.gridScale;
        const gridOffsetX =
          typeof data.grid_offset_x === "number" && Number.isFinite(data.grid_offset_x)
            ? data.grid_offset_x
            : DEFAULT_SETTINGS.gridOffsetX;
        const gridOffsetY =
          typeof data.grid_offset_y === "number" && Number.isFinite(data.grid_offset_y)
            ? data.grid_offset_y
            : DEFAULT_SETTINGS.gridOffsetY;

        let gridData = sanitizeGridData(data.grid_data);

        if (!hasGridData(gridData) && mapPath) {
          try {
            gridData = await fetchGridData({ mapPath });
            if (hasGridData(gridData)) {
              await supabase
                .from("battlemaps")
                .update({
                  grid_data: gridData,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", battlemapId);
            }
          } catch (gridError) {
            console.error("Failed to load grid data", gridError);
            gridData = DEFAULT_GRID_DATA;
          }
        }

        const covers: Cover[] =
          Array.isArray(data.battlemap_covers)
            ? data.battlemap_covers
                .map(parseCover)
                .filter((cover): cover is Cover => cover !== null)
            : [];

        setCurrentBattlemap({
          id: data.id,
          name: data.name ?? "Untitled Battlemap",
          mapPath,
          gridScale,
          gridOffsetX,
          gridOffsetY,
          gridData,
          covers,
        });
      } catch (loadError) {
        console.error("Failed to load battlemap", loadError);
        setError("Failed to load battlemap");
        setCurrentBattlemap(null);
      } finally {
        setIsBattlemapLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadBattlemaps();
  }, [loadBattlemaps]);

  useEffect(() => {
    if (currentBattlemapId) {
      loadBattlemap(currentBattlemapId);
    } else {
      setCurrentBattlemap(null);
    }
  }, [currentBattlemapId, loadBattlemap]);

  const selectBattlemap = useCallback((battlemapId: string) => {
    setCurrentBattlemapId((prev) => (prev === battlemapId ? prev : battlemapId));
  }, []);

  const refreshBattlemap = useCallback(async () => {
    if (currentBattlemapId) {
      await loadBattlemap(currentBattlemapId);
    }
  }, [currentBattlemapId, loadBattlemap]);

  const renameBattlemap = useCallback(
    async (name: string) => {
      if (!currentBattlemapId) {
        return;
      }

      setIsMutating(true);
      setError(null);
      try {
        const trimmedName = name.trim() || "Untitled Battlemap";
        const { error: updateError } = await supabase
          .from("battlemaps")
          .update({
            name: trimmedName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentBattlemapId);

        if (updateError) {
          throw updateError;
        }

        setCurrentBattlemap((prev) =>
          prev ? { ...prev, name: trimmedName } : prev
        );
        setBattlemaps((prev) =>
          prev.map((item) =>
            item.id === currentBattlemapId ? { ...item, name: trimmedName } : item
          )
        );
      } catch (renameError) {
        console.error("Failed to rename battlemap", renameError);
        setError("Failed to rename battlemap");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId]
  );

  const updateBattlemapMapPath = useCallback(
    async (mapPath: string) => {
      if (!currentBattlemapId) {
        return;
      }

      setIsMutating(true);
      setError(null);

      try {
        const sanitizedMapPath = mapPath.trim();
        const { error: updateError } = await supabase
          .from("battlemaps")
          .update({
            map_path: sanitizedMapPath || null,
            grid_data: DEFAULT_GRID_DATA,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentBattlemapId);

        if (updateError) {
          throw updateError;
        }

        setCurrentBattlemap((prev) =>
          prev
            ? {
                ...prev,
                mapPath: sanitizedMapPath || null,
                gridData: DEFAULT_GRID_DATA,
              }
            : prev
        );
        setBattlemaps((prev) =>
          prev.map((item) =>
            item.id === currentBattlemapId ? { ...item, mapPath: sanitizedMapPath || null } : item
          )
        );

        // Re-fetch battlemap to refresh grid data if we have a valid path
        if (sanitizedMapPath) {
          await loadBattlemap(currentBattlemapId);
        }
      } catch (updateError) {
        console.error("Failed to update map path", updateError);
        setError("Failed to update map path");
      } finally {
        setIsMutating(false);
      }
    },
    [currentBattlemapId, loadBattlemap]
  );

  const deleteBattlemap = useCallback(
    async (battlemapId: string) => {
      if (!battlemapId) {
        return;
      }

      setIsMutating(true);
      setError(null);
      try {
        const remaining = battlemaps.filter((map) => map.id !== battlemapId);
        const fallbackId = remaining[0]?.id ?? null;

        const { error: deleteError } = await supabase
          .from("battlemaps")
          .delete()
          .eq("id", battlemapId);

        if (deleteError) {
          throw deleteError;
        }

        setBattlemaps(remaining);
        setCurrentBattlemap((prev) => (prev?.id === battlemapId ? null : prev));
        setCurrentBattlemapId((prev) => (prev === battlemapId ? fallbackId : prev));
      } catch (deleteError) {
        console.error("Failed to delete battlemap", deleteError);
        setError("Failed to delete battlemap");
      } finally {
        setIsMutating(false);
      }
    },
    [battlemaps]
  );

  const addCover = useCallback(
    async (coverInput: Omit<Cover, "id"> & { id?: string }) => {
      if (!currentBattlemapId) {
        return null;
      }

      const coverId =
        typeof coverInput.id === "string" && coverInput.id.trim() !== ""
          ? coverInput.id
          : generateCoverId();
      const sanitized = sanitizeCoverInput({ ...coverInput, id: coverId });

      try {
        const { error: insertError } = await supabase.from("battlemap_covers").insert({
          id: sanitized.id,
          battlemap_id: currentBattlemapId,
          x: sanitized.x,
          y: sanitized.y,
          width: sanitized.width,
          height: sanitized.height,
          color: sanitized.color,
        });

        if (insertError) {
          throw insertError;
        }

        setCurrentBattlemap((prev) =>
          prev
            ? {
                ...prev,
                covers: [...prev.covers.filter((cover) => cover.id !== sanitized.id), sanitized],
              }
            : prev
        );

        return sanitized;
      } catch (insertError) {
        console.error("Failed to add cover", insertError);
        setError("Failed to add cover");
        return null;
      }
    },
    [currentBattlemapId]
  );

  const updateCover = useCallback(
    async (id: string, updates: Partial<Cover>) => {
      if (!currentBattlemapId || !id) {
        return;
      }

      const existingCover = currentBattlemap?.covers.find((cover) => cover.id === id);
      if (!existingCover) {
        return;
      }

      const sanitized = sanitizeCoverInput({ ...existingCover, ...updates, id });

      try {
        const { error: updateError } = await supabase
          .from("battlemap_covers")
          .update({
            x: sanitized.x,
            y: sanitized.y,
            width: sanitized.width,
            height: sanitized.height,
            color: sanitized.color,
          })
          .eq("id", id);

        if (updateError) {
          throw updateError;
        }

        setCurrentBattlemap((prev) =>
          prev
            ? {
                ...prev,
                covers: prev.covers.map((cover) => (cover.id === id ? sanitized : cover)),
              }
            : prev
        );
      } catch (updateError) {
        console.error("Failed to update cover", updateError);
        setError("Failed to update cover");
      }
    },
    [currentBattlemapId, currentBattlemap]
  );

  const removeCover = useCallback(
    async (id: string) => {
      if (!currentBattlemapId || !id) {
        return;
      }

      setError(null);
      try {
        const { error: deleteError } = await supabase
          .from("battlemap_covers")
          .delete()
          .eq("id", id);
        if (deleteError) {
          throw deleteError;
        }

        setCurrentBattlemap((prev) =>
          prev
            ? {
                ...prev,
                covers: prev.covers.filter((cover) => cover.id !== id),
              }
            : prev
        );
      } catch (deleteError) {
        console.error("Failed to remove cover", deleteError);
        setError("Failed to remove cover");
      }
    },
    [currentBattlemapId]
  );

  const persistSettings = useCallback(
    async (settings: BattlemapSettings) => {
      if (!currentBattlemapId) {
        return;
      }

      setIsSettingsSaving(true);
      setError(null);
      try {
        const { error: updateError } = await supabase
          .from("battlemaps")
          .update({
            grid_scale: settings.gridScale,
            grid_offset_x: settings.gridOffsetX,
            grid_offset_y: settings.gridOffsetY,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentBattlemapId);

        if (updateError) {
          throw updateError;
        }
      } catch (updateError) {
        console.error("Failed to update battlemap settings", updateError);
        setError("Failed to update battlemap settings");
      } finally {
        setIsSettingsSaving(false);
      }
    },
    [currentBattlemapId]
  );

  const updateBattlemapSettings = useCallback(
    (updates: Partial<BattlemapSettings>) => {
      if (!currentBattlemapId) {
        return;
      }

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
          persistSettings(nextSettings!);
        }, 500);
      }
    },
    [clearDebounceTimer, persistSettings, currentBattlemapId]
  );

  const createBattlemap = useCallback(
    async ({ name, mapPath }: CreateBattlemapInput) => {
      setIsMutating(true);
      setError(null);

      try {
        const trimmedName = name.trim() || "Untitled Battlemap";
        const sanitizedMapPath = mapPath.trim();
        const initialSettings: BattlemapSettings = {
          gridScale: DEFAULT_SETTINGS.gridScale,
          gridOffsetX: DEFAULT_SETTINGS.gridOffsetX,
          gridOffsetY: DEFAULT_SETTINGS.gridOffsetY,
        };

        const { data, error: insertError } = await supabase
          .from("battlemaps")
          .insert({
            name: trimmedName,
            map_path: sanitizedMapPath || null,
            grid_scale: initialSettings.gridScale,
            grid_offset_x: initialSettings.gridOffsetX,
            grid_offset_y: initialSettings.gridOffsetY,
            grid_data: sanitizedMapPath ? null : DEFAULT_GRID_DATA,
          })
          .select("id, name, map_path")
          .maybeSingle();

        if (insertError) {
          throw insertError;
        }

        if (!data) {
          throw new Error("Failed to create battlemap");
        }

        const summary: BattlemapSummary = {
          id: data.id,
          name: data.name ?? trimmedName,
          mapPath: data.map_path ?? null,
        };

        setBattlemaps((prev) => [...prev, summary]);
        setCurrentBattlemapId(data.id);
        return summary;
      } catch (insertError) {
        console.error("Failed to create battlemap", insertError);
        setError("Failed to create battlemap");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const syncBattlemapFromServer = useCallback((battlemapId: string | null) => {
    if (!battlemapId) {
      setCurrentBattlemapId((prev) => (prev !== null ? null : prev));
      setCurrentBattlemap(null);
      return;
    }
    setCurrentBattlemapId((prev) => (prev === battlemapId ? prev : battlemapId));
  }, []);

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
      updateBattlemapSettings,
      createBattlemap,
      syncBattlemapFromServer,
      deleteBattlemap,
      addCover,
      updateCover,
      removeCover,
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
      updateBattlemapSettings,
      createBattlemap,
      syncBattlemapFromServer,
      deleteBattlemap,
      addCover,
      updateCover,
      removeCover,
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


