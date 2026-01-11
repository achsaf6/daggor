"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBattlemap } from "../../providers/BattlemapProvider";

interface BattlemapListItem {
  id: string;
  name: string;
  mapPath: string | null;
}

const DragHandleIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M3 4h10" />
    <path d="M3 8h10" />
    <path d="M3 12h10" />
  </svg>
);

const MapBadgeIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white/80"
    aria-hidden="true"
  >
    <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" />
    <path d="M9 4v13m6-10v13" />
  </svg>
);

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
    setActiveBattlemapImage,
    createBattlemapImage,
    renameBattlemapImage,
    deleteBattlemapImage,
    createBattlemap,
    reorderBattlemaps,
    canManageBattlemaps,
  } = useBattlemap();

  const [nameValue, setNameValue] = useState<string>(currentBattlemap?.name ?? "");
  const [floorNameValue, setFloorNameValue] = useState<string>("");
  const [newBattlemapName, setNewBattlemapName] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameValue(currentBattlemap?.name ?? "");
  }, [currentBattlemap?.id, currentBattlemap?.name]);

  const floors = useMemo(() => currentBattlemap?.images ?? [], [currentBattlemap?.images]);
  const activeFloorId = useMemo(() => {
    if (!currentBattlemap) return null;
    return currentBattlemap.activeImageId ?? floors[0]?.id ?? null;
  }, [currentBattlemap, floors]);

  useEffect(() => {
    if (!currentBattlemap || floors.length === 0 || !activeFloorId) {
      setFloorNameValue("");
      return;
    }
    const active = floors.find((floor) => floor.id === activeFloorId) ?? floors[0];
    setFloorNameValue(active?.name ?? "");
  }, [activeFloorId, currentBattlemap, floors]);

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

    if (!activeFloorId) {
      setStatusMessage("Create a floor before uploading an image.");
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
      await updateBattlemapMapPath(nextPath, activeFloorId);
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

  const handleFloorSelect = async (floorId: string) => {
    if (!floorId || !canManageBattlemaps) {
      return;
    }
    setStatusMessage("Switching floor…");
    await setActiveBattlemapImage(floorId);
  };

  const handleFloorNameSave = async () => {
    if (!currentBattlemap || !activeFloorId) {
      return;
    }

    const trimmed = floorNameValue.trim();
    const existing = floors.find((floor) => floor.id === activeFloorId);
    if (!trimmed || trimmed === (existing?.name ?? "").trim()) {
      return;
    }

    setStatusMessage("Saving floor name…");
    await renameBattlemapImage(activeFloorId, trimmed);
  };

  const handleAddFloor = async () => {
    if (!currentBattlemap || !canManageBattlemaps) {
      return;
    }
    setStatusMessage("Adding floor…");
    await createBattlemapImage(`Floor ${floors.length + 1}`);
  };

  const handleDeleteFloor = async () => {
    if (!currentBattlemap || !activeFloorId || !canManageBattlemaps) {
      return;
    }
    if (floors.length <= 1) {
      return;
    }
    const active = floors.find((floor) => floor.id === activeFloorId);
    const confirmed = window.confirm(`Delete floor "${active?.name ?? "Floor"}" and all of its covers?`);
    if (!confirmed) {
      return;
    }
    setStatusMessage("Deleting floor…");
    await deleteBattlemapImage(activeFloorId);
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


  const availableBattlemaps: BattlemapListItem[] = useMemo(() => {
    if (isListLoading) {
      return [];
    }
    return battlemaps;
  }, [battlemaps, isListLoading]);

  const disabled = isBattlemapLoading || isMutating;
  const dragEnabled =
    canManageBattlemaps && !isListLoading && !disabled && availableBattlemaps.length > 1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!dragEnabled) {
        return;
      }

      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = availableBattlemaps.findIndex((battlemap) => battlemap.id === active.id);
      const newIndex = availableBattlemaps.findIndex((battlemap) => battlemap.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(availableBattlemaps, oldIndex, newIndex);

      setStatusMessage("Updating battlemap order…");
      void reorderBattlemaps(reordered.map((battlemap) => battlemap.id));
    },
    [availableBattlemaps, dragEnabled, reorderBattlemaps, setStatusMessage]
  );

  return (
    <div
      className="text-white text-sm space-y-4 overflow-y-auto max-h-[70vh] pr-2"
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
          Active Battlemaps
        </label>

        {isListLoading ? (
          <div className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/70">
            Loading battlemaps…
          </div>
        ) : availableBattlemaps.length === 0 ? (
          <div className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/60">
            No battlemaps available yet.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={availableBattlemaps.map((battlemap) => battlemap.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
                {availableBattlemaps.map((battlemap) => (
                  <SortableBattlemapRow
                    key={battlemap.id}
                    battlemap={battlemap}
                    isActive={battlemap.id === currentBattlemapId}
                    disabled={disabled}
                    dragEnabled={dragEnabled}
                    onSelect={selectBattlemap}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {!canManageBattlemaps ? (
          <p className="text-xs text-white/40">
            Only the display host can reorder battlemaps.
          </p>
        ) : dragEnabled ? (
          <p className="text-xs text-white/40">Drag the handle beside a map to change its order.</p>
        ) : null}
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
        <div className="flex items-center justify-between">
          <label className="block text-xs uppercase tracking-wide text-white/60">Floors</label>
          <button
            type="button"
            onClick={handleAddFloor}
            disabled={!currentBattlemap || disabled || !canManageBattlemaps}
            className="text-xs rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            + Add Floor
          </button>
        </div>

        {!currentBattlemap ? (
          <div className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/60">
            Select a battlemap to manage floors.
          </div>
        ) : floors.length === 0 ? (
          <div className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/60">
            No floors yet.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {floors.map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  onClick={() => handleFloorSelect(floor.id)}
                  disabled={disabled || !canManageBattlemaps}
                  className={`rounded-md border px-2 py-1 text-xs transition ${
                    floor.id === activeFloorId
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                      : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                  } disabled:opacity-50`}
                  title={floor.name}
                >
                  {floor.name || "Floor"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={floorNameValue}
                onChange={(event) => setFloorNameValue(event.target.value)}
                onBlur={handleFloorNameSave}
                disabled={!activeFloorId || disabled || !canManageBattlemaps}
                className="flex-1 bg-black/40 border border-white/20 rounded-md px-2 py-2 text-white focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-50"
                placeholder="Floor name"
              />
              <button
                type="button"
                onClick={handleDeleteFloor}
                disabled={!activeFloorId || floors.length <= 1 || disabled || !canManageBattlemaps}
                className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                title={floors.length <= 1 ? "Cannot delete the last floor" : "Delete floor"}
              >
                Delete
              </button>
            </div>

            {!canManageBattlemaps ? (
              <p className="text-xs text-white/40">Only the display host can change floors.</p>
            ) : null}
          </>
        )}
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
            disabled={!currentBattlemap || !activeFloorId || disabled || isUploading}
          />
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={!currentBattlemap || !activeFloorId || disabled || isUploading}
            className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-md px-2 py-2 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {isUploading ? "Uploading…" : currentBattlemap?.mapPath ? "Replace Image" : "Upload Image"}
          </button>
        </div>
        <p className="text-xs text-white/40">
          Drop in any image file—it&apos;s uploaded to Supabase storage and referenced automatically.
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

      {statusMessage ? (
        <div className="text-xs text-white/50">{statusMessage}</div>
      ) : null}
    </div>
  );
};


interface SortableBattlemapRowProps {
  battlemap: BattlemapListItem;
  isActive: boolean;
  disabled: boolean;
  dragEnabled: boolean;
  onSelect: (battlemapId: string) => void;
}

const SortableBattlemapRow = ({
  battlemap,
  isActive,
  disabled,
  dragEnabled,
  onSelect,
}: SortableBattlemapRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: battlemap.id,
    disabled: !dragEnabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandleProps =
    dragEnabled && !disabled
      ? {
          ...attributes,
          ...listeners,
        }
      : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch gap-2 rounded-lg border border-white/15 bg-black/30 p-2 transition ${
        isDragging ? "bg-white/10 shadow-lg" : ""
      }`}
    >
      <div
        {...dragHandleProps}
        className={`flex items-center rounded-md px-2 text-white/60 transition ${
          dragEnabled ? "cursor-grab hover:text-white" : "cursor-not-allowed opacity-30"
        }`}
        aria-label={dragEnabled ? "Drag to reorder" : "Reordering disabled"}
      >
        <DragHandleIcon />
      </div>
      <button
        type="button"
        onClick={() => onSelect(battlemap.id)}
        disabled={disabled}
        className={`flex flex-1 items-center gap-3 rounded-md px-2 py-1 text-left transition ${
          isActive ? "bg-white/10" : ""
        } ${disabled ? "opacity-60" : "hover:bg-white/5"}`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500/40 to-cyan-500/30">
          <MapBadgeIcon />
        </span>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="text-sm font-medium text-white">
            {battlemap.name || "Untitled Battlemap"}
          </span>
          <span className="text-xs text-white/40 truncate">
            {battlemap.mapPath ? battlemap.mapPath : "No image uploaded"}
          </span>
        </div>
        {isActive ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
            Active
          </span>
        ) : null}
      </button>
    </li>
  );
};

