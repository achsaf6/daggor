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
      className="parchment-body text-sm space-y-4 overflow-y-auto max-h-[70vh] pr-2"
      style={{ color: "var(--parchment-ink)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="parchment-heading text-sm">Battlemap Manager</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="parchment-numeric transition-colors hover:text-[var(--brass-shadow)]"
            style={{ color: "var(--brass-deep)" }}
            aria-label="Close battlemap manager"
          >
            ✕
          </button>
        )}
      </div>
      <div className="parchment-rule -mt-2 mb-2" />

      {error ? (
        <div
          className="parchment-flavor px-3 py-2 text-xs border"
          style={{ color: "#7a2424", borderColor: "#7a2424", background: "rgba(166, 49, 49, 0.08)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="parchment-numeric block text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
          Active Battlemaps
        </label>

        {isListLoading ? (
          <div
            className="parchment-flavor w-full px-3 py-3 text-sm border"
            style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink-muted)", background: "rgba(255, 252, 240, 0.4)" }}
          >
            Loading battlemaps…
          </div>
        ) : availableBattlemaps.length === 0 ? (
          <div
            className="parchment-flavor w-full px-3 py-3 text-sm border"
            style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink-muted)", background: "rgba(255, 252, 240, 0.4)" }}
          >
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
          <p className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
            Only the display host can reorder battlemaps.
          </p>
        ) : dragEnabled ? (
          <p className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
            Drag the handle beside a map to change its order.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="parchment-numeric block text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
          Battlemap Name
        </label>
        <input
          type="text"
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          onBlur={handleNameSave}
          disabled={!currentBattlemap || disabled}
          className="parchment-body w-full border px-2 py-2 focus:outline-none disabled:opacity-50"
          style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)", background: "rgba(255, 252, 240, 0.6)" }}
          placeholder="Enter a name"
        />
        <p className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
          Changes are saved automatically when the field loses focus.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="parchment-numeric block text-xs" style={{ color: "var(--parchment-ink-muted)" }}>Floors</label>
          <button
            type="button"
            onClick={handleAddFloor}
            disabled={!currentBattlemap || disabled || !canManageBattlemaps}
            className="parchment-numeric text-xs border px-2 py-1 transition-colors hover:bg-[rgba(201,162,74,0.15)] disabled:opacity-50"
            style={{ color: "var(--brass-shadow)", borderColor: "var(--brass-deep)", background: "rgba(255, 252, 240, 0.4)" }}
          >
            + Add Floor
          </button>
        </div>

        {!currentBattlemap ? (
          <div
            className="parchment-flavor w-full px-3 py-3 text-sm border"
            style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink-muted)", background: "rgba(255, 252, 240, 0.4)" }}
          >
            Select a battlemap to manage floors.
          </div>
        ) : floors.length === 0 ? (
          <div
            className="parchment-flavor w-full px-3 py-3 text-sm border"
            style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink-muted)", background: "rgba(255, 252, 240, 0.4)" }}
          >
            No floors yet.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {floors.map((floor) => {
                const isActive = floor.id === activeFloorId;
                return (
                  <button
                    key={floor.id}
                    type="button"
                    onClick={() => handleFloorSelect(floor.id)}
                    disabled={disabled || !canManageBattlemaps}
                    className="parchment-numeric border px-2 py-1 text-xs transition-colors disabled:opacity-50"
                    style={{
                      color: isActive ? "var(--parchment-bright)" : "var(--brass-shadow)",
                      borderColor: "var(--brass-deep)",
                      background: isActive ? "var(--brass-deep)" : "rgba(255, 252, 240, 0.4)",
                    }}
                    title={floor.name}
                  >
                    {floor.name || "Floor"}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={floorNameValue}
                onChange={(event) => setFloorNameValue(event.target.value)}
                onBlur={handleFloorNameSave}
                disabled={!activeFloorId || disabled || !canManageBattlemaps}
                className="parchment-body flex-1 border px-2 py-2 focus:outline-none disabled:opacity-50"
                style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)", background: "rgba(255, 252, 240, 0.6)" }}
                placeholder="Floor name"
              />
              <button
                type="button"
                onClick={handleDeleteFloor}
                disabled={!activeFloorId || floors.length <= 1 || disabled || !canManageBattlemaps}
                className="parchment-numeric border px-2 py-2 text-xs transition-colors hover:bg-[rgba(166,49,49,0.18)] disabled:opacity-50"
                style={{ color: "#7a2424", borderColor: "#7a2424", background: "rgba(166, 49, 49, 0.08)" }}
                title={floors.length <= 1 ? "Cannot delete the last floor" : "Delete floor"}
              >
                Delete
              </button>
            </div>

            {!canManageBattlemaps ? (
              <p className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>Only the display host can change floors.</p>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-2">
        <label className="parchment-numeric block text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
          Map Image
        </label>
        <div
          className="parchment-flavor w-full border px-2 py-2 text-xs break-words min-h-[48px]"
          style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink-muted)", background: "rgba(255, 252, 240, 0.4)" }}
        >
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
            className="parchment-numeric flex-1 border px-3 py-2 text-sm transition-colors hover:bg-[rgba(201,162,74,0.15)] disabled:opacity-50"
            style={{ color: "var(--parchment-bright)", borderColor: "var(--brass-shadow)", background: "var(--brass-deep)" }}
          >
            {isUploading ? "Uploading…" : currentBattlemap?.mapPath ? "Replace Image" : "Upload Image"}
          </button>
        </div>
        <p className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>
          Drop in any image file—it&apos;s uploaded to Supabase storage and referenced automatically.
        </p>
      </div>

      <form onSubmit={handleCreateBattlemap} className="space-y-2 pt-3" style={{ borderTop: "1px solid rgba(110, 83, 32, 0.3)" }}>
        <h4 className="parchment-numeric text-xs" style={{ color: "var(--parchment-ink-muted)" }}>Create New Battlemap</h4>
        <input
          type="text"
          value={newBattlemapName}
          onChange={(event) => setNewBattlemapName(event.target.value)}
          className="parchment-body w-full border px-2 py-2 focus:outline-none"
          style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)", background: "rgba(255, 252, 240, 0.6)" }}
          placeholder="New battlemap name"
          required
        />
        <button
          type="submit"
          className="parchment-numeric w-full border px-3 py-2 text-sm transition-colors hover:bg-[rgba(201,162,74,0.15)] disabled:opacity-50"
          style={{ color: "var(--parchment-bright)", borderColor: "var(--brass-shadow)", background: "var(--brass-deep)" }}
          disabled={isMutating}
        >
          Create Battlemap
        </button>
      </form>

      {statusMessage ? (
        <div className="parchment-flavor text-xs" style={{ color: "var(--parchment-ink-muted)" }}>{statusMessage}</div>
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
      style={{
        ...style,
        borderColor: "var(--brass-deep)",
        background: isDragging ? "rgba(201, 162, 74, 0.18)" : "rgba(255, 252, 240, 0.4)",
        boxShadow: isDragging ? "0 4px 14px rgba(110, 83, 32, 0.25)" : undefined,
      }}
      className="flex items-stretch gap-2 border p-2 transition"
    >
      <div
        {...dragHandleProps}
        className={`flex items-center px-2 transition ${
          dragEnabled ? "cursor-grab hover:text-[var(--brass-shadow)]" : "cursor-not-allowed opacity-30"
        }`}
        style={{ color: "var(--brass-deep)" }}
        aria-label={dragEnabled ? "Drag to reorder" : "Reordering disabled"}
      >
        <DragHandleIcon />
      </div>
      <button
        type="button"
        onClick={() => onSelect(battlemap.id)}
        disabled={disabled}
        className={`flex flex-1 items-center gap-3 border px-2 py-1.5 text-left transition-colors ${
          disabled ? "opacity-60" : "hover:bg-[rgba(201,162,74,0.12)]"
        }`}
        style={{
          borderColor: isActive ? "var(--brass-shadow)" : "transparent",
          background: isActive ? "rgba(201, 162, 74, 0.18)" : "transparent",
        }}
      >
        <span
          className="flex h-10 w-10 items-center justify-center border"
          style={{
            borderColor: "var(--brass-deep)",
            background: "linear-gradient(135deg, rgba(201, 162, 74, 0.25), rgba(110, 83, 32, 0.1))",
            color: "var(--brass-shadow)",
          }}
        >
          <MapBadgeIcon />
        </span>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="parchment-body text-sm font-medium" style={{ color: "var(--parchment-ink)" }}>
            {battlemap.name || "Untitled Battlemap"}
          </span>
          <span className="parchment-flavor text-xs truncate" style={{ color: "var(--parchment-ink-muted)" }}>
            {battlemap.mapPath ? battlemap.mapPath : "No image uploaded"}
          </span>
        </div>
        {isActive ? (
          <span
            className="parchment-numeric border px-2 py-0.5"
            style={{
              fontSize: "0.65rem",
              color: "var(--parchment-bright)",
              borderColor: "var(--brass-shadow)",
              background: "var(--brass-deep)",
            }}
          >
            Active
          </span>
        ) : null}
      </button>
    </li>
  );
};

