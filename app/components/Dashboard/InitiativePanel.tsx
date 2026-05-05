"use client";

import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical, RotateCcw, Swords } from "lucide-react";
import { useInitiative } from "../../hooks/useInitiative";
import { User } from "../../types";
import { PanelFrame } from "../Theatrical/PanelFrame";

interface InitiativePanelProps {
  socket: Socket | null;
  // Active player + NPC tokens from useSocket — used to resolve colors and
  // (when an entry's stored name is empty) fall back to a token-side label.
  activeUsers: Map<string, User>;
}

interface RowMeta {
  color: string;
  fallbackName: string;
}

// Initiative tracker — auto-populated from connected players and DM-spawned
// NPCs. The DM drags rows to reorder turn order, edits scores inline, and
// steps next/prev. Server is authoritative; we only render `state` and emit
// mutations.
export const InitiativePanel = ({ socket, activeUsers }: InitiativePanelProps) => {
  const { state, advance, reset, reorder, setScore } = useInitiative(socket);

  // Index by persistentUserId so we can resolve the color/name for each
  // initiative entry (entries are keyed by persistentUserId server-side).
  const metaByPersistentId = useMemo(() => {
    const m = new Map<string, RowMeta>();
    for (const u of activeUsers.values()) {
      const pid = (u as User & { persistentUserId?: string }).persistentUserId;
      if (!pid) continue;
      m.set(pid, {
        color: u.color,
        fallbackName: u.name && u.name.trim() ? u.name : pid.slice(0, 6),
      });
    }
    return m;
  }, [activeUsers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = state.entries.map((e) => e.tokenId);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder(arrayMove(ids, from, to));
  };

  return (
    <div className="parchment-panel fixed left-4 bottom-4 z-40 w-96 max-h-[60vh] overflow-visible">
      <PanelFrame
        title={
          <>
            <Swords
              className="inline-block h-3.5 w-3.5 mr-2 -mt-0.5"
              style={{ color: "var(--brass-deep)" }}
            />
            Initiative
            {state.round > 0 && (
              <span className="opacity-70"> — Round {state.round}</span>
            )}
          </>
        }
      />
      <div className="px-5 pt-10 pb-5 overflow-y-auto max-h-[60vh]">
        {state.entries.length === 0 ? (
          <div className="parchment-flavor text-sm mb-3">
            No combatants — connect players or spawn monsters.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={state.entries.map((e) => e.tokenId)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col mb-4">
                {state.entries.map((entry, i) => {
                  const meta = metaByPersistentId.get(entry.tokenId);
                  return (
                    <SortableRow
                      key={entry.tokenId}
                      tokenId={entry.tokenId}
                      index={i}
                      isCurrent={i === state.currentIndex}
                      name={entry.name || meta?.fallbackName || entry.tokenId.slice(0, 6)}
                      color={meta?.color ?? "#6b7280"}
                      score={entry.score}
                      onScoreChange={(next) => setScore(entry.tokenId, next)}
                    />
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => advance("prev")}
            disabled={state.entries.length === 0}
            aria-label="Previous turn"
            className="parchment-numeric px-2 py-1 disabled:opacity-30 hover:text-[var(--brass-shadow)] transition-colors"
            style={{ color: "var(--brass-deep)" }}
          >
            <ChevronLeft className="h-4 w-4 inline" />
          </button>
          <button
            type="button"
            onClick={() => advance("next")}
            disabled={state.entries.length === 0}
            className="parchment-numeric flex-1 text-sm py-2 px-3 border disabled:opacity-30 hover:bg-[rgba(201,162,74,0.15)] transition-colors"
            style={{
              color: "var(--brass-shadow)",
              borderColor: "var(--brass-deep)",
              background: "rgba(255, 252, 240, 0.4)",
            }}
          >
            NEXT TURN
          </button>
          <button
            type="button"
            onClick={() => advance("next")}
            disabled={state.entries.length === 0}
            aria-label="Next turn"
            className="parchment-numeric px-2 py-1 disabled:opacity-30 hover:text-[var(--brass-shadow)] transition-colors"
            style={{ color: "var(--brass-deep)" }}
          >
            <ChevronRight className="h-4 w-4 inline" />
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={state.entries.length === 0}
            aria-label="Reset to round 1"
            className="parchment-numeric px-2 py-1 disabled:opacity-30 hover:text-[var(--brass-shadow)] transition-colors"
            style={{ color: "var(--brass-deep)" }}
          >
            <RotateCcw className="h-4 w-4 inline" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface SortableRowProps {
  tokenId: string;
  index: number;
  isCurrent: boolean;
  name: string;
  color: string;
  score: number;
  onScoreChange: (next: number) => void;
}

const SortableRow = ({
  tokenId,
  index,
  isCurrent,
  name,
  color,
  score,
  onScoreChange,
}: SortableRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tokenId });
  // Local draft of the score so the user can tab through digits without the
  // server clobbering each keystroke; we commit on blur / Enter.
  const [draft, setDraft] = useState<string>(String(score));
  useEffect(() => {
    setDraft(String(score));
  }, [score]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isCurrent
      ? "linear-gradient(to right, rgba(201, 162, 74, 0.15), transparent)"
      : "transparent",
    borderColor: "rgba(110, 83, 32, 0.2)",
  };

  const commitScore = () => {
    const parsed = Number.parseFloat(draft);
    onScoreChange(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 py-1.5 border-b last:border-b-0"
    >
      <button
        type="button"
        className="text-[var(--parchment-ink-muted)] hover:text-[var(--brass-shadow)] cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span
        className="parchment-numeric w-5 text-right shrink-0"
        style={{
          fontSize: "0.95rem",
          color: isCurrent ? "var(--brass-shadow)" : "var(--parchment-ink-muted)",
        }}
      >
        {index + 1}
      </span>
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{
          backgroundColor: color,
          boxShadow: "0 0 0 1px var(--parchment-bright), 0 0 0 1.5px var(--brass-deep)",
        }}
        aria-hidden
      />
      <span
        className="parchment-body text-sm flex-1 truncate"
        style={{
          fontWeight: isCurrent ? 600 : 400,
          color: "var(--parchment-ink)",
        }}
        title={name}
      >
        {name}
      </span>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitScore}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`Initiative score for ${name}`}
        className="parchment-numeric w-12 px-1.5 py-0.5 text-sm text-right bg-[rgba(255,252,240,0.4)] border focus:outline-none focus:border-[var(--brass-shadow)]"
        style={{
          borderColor: "rgba(110, 83, 32, 0.3)",
          color: isCurrent ? "var(--brass-shadow)" : "var(--parchment-ink-muted)",
          fontSize: "1rem",
        }}
      />
      {isCurrent && (
        <span
          className="parchment-numeric shrink-0"
          style={{ fontSize: "0.7rem", color: "var(--brass-shadow)" }}
        >
          ◆ NOW
        </span>
      )}
    </li>
  );
};
