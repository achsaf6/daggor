"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useBattlemap } from "../providers/BattlemapProvider";

interface BattlemapManagerProps {
  onClose?: () => void;
}

export const BattlemapManager = ({ onClose }: BattlemapManagerProps) => {
  const {
    battlemaps,
    currentBattlemap,
    currentBattlemapId,
    isListLoading,
    isBattlemapLoading,
    isMutating,
    error,
    selectBattlemap,
    renameBattlemap,
    updateBattlemapMapPath,
    createBattlemap,
    deleteBattlemap,
  } = useBattlemap();

  const [nameValue, setNameValue] = useState<string>(currentBattlemap?.name ?? "");
  const [newBattlemapName, setNewBattlemapName] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameValue(currentBattlemap?.name ?? "");
  }, [currentBattlemap?.id, currentBattlemap?.name]);

  useEffect(() => {
    if (!isMutating && !isBattlemapLoading) {
      setStatusMessage(null);
    }
  }, [isMutating, isBattlemapLoading]);

  const handleNameSave = async () => {
    if (!currentBattlemap) {
      return;
    }

    const trimmed = nameValue.trim();
    if (trimmed === currentBattlemap.name.trim()) {
      return;
    }
    setStatusMessage("Saving name…");
    await renameBattlemap(trimmed);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!currentBattlemap) {
      setStatusMessage("Select a battlemap before uploading.");
      event.target.value = "";
      return;
    }

    try {
      setIsUploading(true);
      setStatusMessage("Uploading map image…");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("battlemapId", currentBattlemap.id);

      const response = await fetch("/api/map-upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to upload image");
      }

      const nextPath: string = payload.publicUrl ?? payload.path;
      await updateBattlemapMapPath(nextPath);
      setStatusMessage("Map image uploaded.");
    } catch (uploadError) {
      console.error(uploadError);
      setStatusMessage(
        uploadError instanceof Error ? uploadError.message : "Failed to upload image"
      );
    } finally {
      event.target.value = "";
      setIsUploading(false);
    }
  };

  const handleCreateBattlemap = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newBattlemapName.trim()) {
      return;
    }
    setStatusMessage("Creating battlemap…");
    const created = await createBattlemap({
      name: newBattlemapName,
      mapPath: "",
    });
    if (created) {
      setNewBattlemapName("");
    }
  };

  const handleDeleteBattlemap = async () => {
    if (!currentBattlemap) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${currentBattlemap.name}" and all of its covers?`
    );
    if (!confirmed) {
      return;
    }

    setStatusMessage("Deleting battlemap…");
    await deleteBattlemap(currentBattlemap.id);
  };

  const availableBattlemaps = useMemo(() => {
    if (isListLoading) {
      return [];
    }
    return battlemaps;
  }, [battlemaps, isListLoading]);

  const disabled = isBattlemapLoading || isMutating;

  return (
    <div
      className="text-white text-sm space-y-4"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">
          Battlemap Manager
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
            aria-label="Close battlemap manager"
          >
            ✕
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-md bg-red-500/20 border border-red-500/40 px-3 py-2 text-xs">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-white/60">
          Active Battlemap
        </label>
        <select
          value={currentBattlemapId ?? ""}
          onChange={(event) => selectBattlemap(event.target.value)}
          disabled={isListLoading || disabled}
          className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-50"
        >
          {isListLoading ? (
            <option value="">Loading…</option>
          ) : availableBattlemaps.length > 0 ? (
            availableBattlemaps.map((battlemap) => (
              <option key={battlemap.id} value={battlemap.id}>
                {battlemap.name || "Untitled Battlemap"}
              </option>
            ))
          ) : (
            <option value="">No battlemaps</option>
          )}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-white/60">
          Battlemap Name
        </label>
        <input
          type="text"
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          onBlur={handleNameSave}
          disabled={!currentBattlemap || disabled}
          className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-50"
          placeholder="Enter a name"
        />
        <p className="text-xs text-white/40">
          Changes are saved automatically when the field loses focus.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-white/60">
          Map Image
        </label>
        <div className="w-full bg-black/30 border border-white/10 rounded-md px-2 py-2 text-xs text-white/80 break-words min-h-[48px]">
          {currentBattlemap?.mapPath ? currentBattlemap.mapPath : "No image uploaded yet."}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelected}
            disabled={!currentBattlemap || disabled || isUploading}
          />
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={!currentBattlemap || disabled || isUploading}
            className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-md px-2 py-2 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {isUploading ? "Uploading…" : currentBattlemap?.mapPath ? "Replace Image" : "Upload Image"}
          </button>
        </div>
        <p className="text-xs text-white/40">
          Drop in any image file—it's uploaded to Supabase storage and referenced automatically.
        </p>
      </div>

      <form onSubmit={handleCreateBattlemap} className="space-y-2 border-t border-white/10 pt-3">
        <h4 className="text-xs uppercase tracking-wide text-white/60">Create New Battlemap</h4>
        <input
          type="text"
          value={newBattlemapName}
          onChange={(event) => setNewBattlemapName(event.target.value)}
          className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/40"
          placeholder="New battlemap name"
          required
        />
        <button
          type="submit"
          className="w-full bg-white/10 hover:bg-white/20 border border-white/20 rounded-md px-2 py-2 text-white text-sm font-medium transition disabled:opacity-50"
          disabled={isMutating}
        >
          Create Battlemap
        </button>
      </form>

      {currentBattlemap ? (
        <button
          type="button"
          onClick={handleDeleteBattlemap}
          disabled={disabled}
          className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-500/40 rounded-md px-2 py-2 text-white text-sm font-medium transition disabled:opacity-50"
        >
          Delete Battlemap
        </button>
      ) : null}

      {statusMessage ? (
        <div className="text-xs text-white/50">{statusMessage}</div>
      ) : null}
    </div>
  );
};


