"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/app/utils/supabase";

interface CharacterRow {
  id: string;
  name: string;
  movement_speed: number | null;
  token_image_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CharacterProfile {
  id: string;
  name: string;
  movementSpeed: number | null;
  tokenImageUrl: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CharacterUpdates {
  movementSpeed?: number | null;
  tokenImageUrl?: string | null;
}

interface CharacterContextValue {
  character: CharacterProfile | null;
  hasSelectedCharacter: boolean;
  pendingName: string;
  setPendingName: (value: string) => void;
  isResolving: boolean;
  isUpdating: boolean;
  selectionError: string | null;
  updateError: string | null;
  selectCharacter: (name: string) => Promise<CharacterProfile | null>;
  updateCharacter: (updates: CharacterUpdates) => Promise<CharacterProfile | null>;
  clearCharacter: () => void;
}

const STORAGE_KEY = "characterName";

const CharacterContext = createContext<CharacterContextValue | undefined>(undefined);

const mapRowToProfile = (row: CharacterRow): CharacterProfile => ({
  id: row.id,
  name: row.name,
  movementSpeed: row.movement_speed ?? null,
  tokenImageUrl: row.token_image_url ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
});

export const CharacterProvider = ({ children }: { children: ReactNode }) => {
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  // Always-current character pointer. updateCharacter awaits Supabase, and we
  // need to know "is the user still on the row I'm updating?" when it
  // resolves — otherwise a mid-update character switch would have the
  // success branch overwrite the new selection with the old row's data.
  const characterRef = useRef<CharacterProfile | null>(null);
  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  const selectCharacter = useCallback(async (rawName: string) => {
    const normalized = rawName.trim();
    if (!normalized) {
      setSelectionError("Please enter a name.");
      return null;
    }

    setIsResolving(true);
    setSelectionError(null);

    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("name", normalized)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      let row: CharacterRow | null = (data as CharacterRow | null) ?? null;

      if (!row) {
        const { data: inserted, error: insertError } = await supabase
          .from("characters")
          .insert({ name: normalized })
          .select("*")
          .single();

        if (insertError) {
          throw insertError;
        }

        row = inserted as CharacterRow;
      }

      const profile = mapRowToProfile(row);
      setCharacter(profile);
      setPendingName(profile.name);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, profile.name);
      }
      return profile;
    } catch (err) {
      console.error("Failed to resolve character", err);
      setSelectionError(
        err instanceof Error ? err.message : "Failed to load or create character."
      );
      return null;
    } finally {
      setIsResolving(false);
    }
  }, []);

  const updateCharacter = useCallback(
    async (updates: CharacterUpdates) => {
      // Capture the target at call time. A character switch during the
      // Supabase round-trip MUST NOT cause the success branch to clobber
      // the new selection with the old row's data.
      const target = characterRef.current;
      if (!target) {
        return null;
      }

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if ("movementSpeed" in updates) {
        payload.movement_speed =
          updates.movementSpeed === null || updates.movementSpeed === undefined
            ? null
            : updates.movementSpeed;
      }

      if ("tokenImageUrl" in updates) {
        payload.token_image_url =
          updates.tokenImageUrl === null || updates.tokenImageUrl === undefined
            ? null
            : updates.tokenImageUrl;
      }

      if (Object.keys(payload).length === 1) {
        // Only updated_at was added, nothing else to update.
        return target;
      }

      setIsUpdating(true);
      setUpdateError(null);

      try {
        const { data, error } = await supabase
          .from("characters")
          .update(payload)
          .eq("id", target.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const profile = mapRowToProfile(data as CharacterRow);
        // Only commit to state if the user is still on this character.
        if (characterRef.current?.id === target.id) {
          setCharacter(profile);
        }
        return profile;
      } catch (err) {
        console.error("Failed to update character", err);
        setUpdateError(
          err instanceof Error ? err.message : "Failed to update character data."
        );
        return null;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  const clearCharacter = useCallback(() => {
    setCharacter(null);
    setPendingName("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setPendingName(stored);
      void selectCharacter(stored);
    }
  }, [selectCharacter]);

  const value = useMemo<CharacterContextValue>(
    () => ({
      character,
      hasSelectedCharacter: Boolean(character),
      pendingName,
      setPendingName,
      isResolving,
      isUpdating,
      selectionError,
      updateError,
      selectCharacter,
      updateCharacter,
      clearCharacter,
    }),
    [
      character,
      pendingName,
      isResolving,
      isUpdating,
      selectionError,
      updateError,
      selectCharacter,
      updateCharacter,
      clearCharacter,
    ]
  );

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>;
};

export const useCharacter = (): CharacterContextValue => {
  const context = useContext(CharacterContext);
  if (!context) {
    throw new Error("useCharacter must be used within a CharacterProvider");
  }
  return context;
};


