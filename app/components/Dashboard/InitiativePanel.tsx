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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  RotateCcw,
  Swords,
} from "lucide-react";
import { useInitiative } from "../../hooks/useInitiative";
import { User } from "../../types";

interface InitiativePanelProps {
  socket: Socket | null;
  activeUsers: Map<string, User>;
}

interface RowMeta {
  color: string;
  fallbackName: string;
}

// Glass Atelier initiative tracker — collapsed default shows just `Now` and
// `Next` with the round counter and turn controls. The DM can expand the full
// sortable list above the strip when needed (drag-reorder, score edits).
//
// Server is authoritative; we only render `state` and emit mutations.
export const InitiativePanel = ({ socket, activeUsers }: InitiativePanelProps) => {
  const { state, advance, reset, reorder, setScore } = useInitiative(socket);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const current =
    state.currentIndex >= 0 && state.currentIndex < state.entries.length
      ? state.entries[state.currentIndex]
      : null;
  const next =
    state.entries.length > 0
      ? state.entries[(state.currentIndex + 1) % state.entries.length]
      : null;

  const labelFor = (entry: { tokenId: string; name: string }) => {
    const meta = metaByPersistentId.get(entry.tokenId);
    return entry.name || meta?.fallbackName || entry.tokenId.slice(0, 6);
  };
  const colorFor = (tokenId: string) =>
    metaByPersistentId.get(tokenId)?.color ?? "#6b7280";

  const empty = state.entries.length === 0;

  return (
    <div
      className="glass-panel fixed bottom-4 left-1/2 -translate-x-1/2 z-40"
      style={{
        minWidth: empty ? 360 : isExpanded ? 460 : 'auto',
        maxWidth: 'min(90vw, 560px)',
      }}
    >
      {/* expanded list (rendered above the strip when open) */}
      {isExpanded && !empty && (
        <div className="px-4 pt-3 pb-2 border-b border-[var(--glass-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="glass-heading flex items-center gap-1.5">
              <Swords className="h-3 w-3" />
              Order
              {state.round > 0 && (
                <span className="opacity-70 normal-case tracking-normal">
                  · Round {state.round}
                </span>
              )}
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={state.entries.map((e) => e.tokenId)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="flex flex-col">
                {state.entries.map((entry, i) => (
                  <SortableRow
                    key={entry.tokenId}
                    tokenId={entry.tokenId}
                    index={i}
                    isCurrent={i === state.currentIndex}
                    name={labelFor(entry)}
                    color={colorFor(entry.tokenId)}
                    score={entry.score}
                    onScoreChange={(n) => setScore(entry.tokenId, n)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* the always-visible strip */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        {empty ? (
          <span className="glass-muted text-xs">
            No combatants — connect players or spawn monsters.
          </span>
        ) : (
          <>
            <span className="glass-numeric text-[10px] tracking-wider uppercase">
              Rnd {state.round}
            </span>

            <div className="flex items-center gap-2">
              <span className="glass-heading text-[10px]">Now</span>
              {current && (
                <>
                  <span
                    className="block rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: colorFor(current.tokenId),
                      boxShadow:
                        "0 0 0 1px rgba(0,0,0,0.4), 0 0 0 2px var(--glass-accent)",
                    }}
                    aria-hidden
                  />
                  <span className="glass-body text-sm font-medium truncate max-w-[120px]">
                    {labelFor(current)}
                  </span>
                  <span className="glass-numeric text-xs">+{current.score}</span>
                </>
              )}
            </div>

            <ChevronRight
              className="h-3.5 w-3.5"
              style={{ color: "var(--glass-txt-faint)" }}
              aria-hidden
            />

            <div className="flex items-center gap-1.5">
              <span className="glass-heading text-[10px]">Next</span>
              {next && (
                <>
                  <span
                    className="block rounded-full"
                    style={{
                      width: 10,
                      height: 10,
                      background: colorFor(next.tokenId),
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                    }}
                    aria-hidden
                  />
                  <span
                    className="glass-body text-sm truncate max-w-[100px]"
                    style={{ color: "var(--glass-txt-muted)" }}
                  >
                    {labelFor(next)}
                  </span>
                </>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => advance("prev")}
            disabled={empty}
            aria-label="Previous turn"
            className="glass-btn glass-btn-icon"
            style={{ width: 28, height: 28 }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => advance("next")}
            disabled={empty}
            className="glass-btn glass-btn-primary"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            Next turn
          </button>
          <button
            type="button"
            onClick={() => advance("next")}
            disabled={empty}
            aria-label="Skip"
            className="glass-btn glass-btn-icon"
            style={{ width: 28, height: 28 }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={empty}
            aria-label="Reset to round 1"
            className="glass-btn glass-btn-icon"
            style={{ width: 28, height: 28 }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            disabled={empty}
            aria-label={isExpanded ? "Collapse list" : "Expand list"}
            className="glass-btn glass-btn-icon"
            style={{ width: 28, height: 28 }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tokenId });
  const [draft, setDraft] = useState<string>(String(score));
  useEffect(() => {
    setDraft(String(score));
  }, [score]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isCurrent ? "var(--glass-accent-soft)" : "transparent",
    borderRadius: 6,
  };

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    onScoreChange(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1.5 px-1"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing"
        style={{ color: "var(--glass-txt-faint)" }}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span
        className="glass-numeric w-5 text-right shrink-0 text-xs"
        style={{ color: isCurrent ? "var(--glass-accent)" : "var(--glass-txt-faint)" }}
      >
        {index + 1}
      </span>
      <span
        className="block rounded-full shrink-0"
        style={{
          width: 10,
          height: 10,
          background: color,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
        }}
        aria-hidden
      />
      <span
        className="glass-body text-sm flex-1 truncate"
        style={{ fontWeight: isCurrent ? 600 : 400 }}
        title={name}
      >
        {name}
      </span>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`Initiative score for ${name}`}
        className="glass-numeric text-right text-sm focus:outline-none"
        style={{
          width: 44,
          padding: "2px 6px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--glass-border)",
          borderRadius: 4,
          color: isCurrent ? "var(--glass-accent)" : "var(--glass-txt)",
        }}
      />
    </li>
  );
};
