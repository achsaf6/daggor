"use client";

import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChevronLeft, ChevronRight, RotateCcw, Swords } from "lucide-react";
import { InitiativeEntry, useInitiative } from "../../hooks/useInitiative";
import { User } from "../../types";
import { PanelFrame } from "../Theatrical/PanelFrame";

interface InitiativePanelProps {
  socket: Socket | null;
  // Active player tokens — used as the suggestion list when adding combatants.
  activeUsers: Map<string, User>;
}

interface DraftRow {
  tokenId: string;
  score: string; // user types into a text field; coerced on submit
  name: string;
  color: string;
}

const fromUser = (u: User): DraftRow => ({
  tokenId: u.id,
  score: "",
  name: "",
  color: u.color,
});

// Initiative tracker panel for /dashboard. The DM seeds the list, then steps
// next/prev. Server is the source of truth — we only render `state` and emit
// mutations.
export const InitiativePanel = ({ socket, activeUsers }: InitiativePanelProps) => {
  const { state, setEntries, advance, reset } = useInitiative(socket);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // When edit mode opens with no existing entries, prefill from active tokens.
  useEffect(() => {
    if (!isEditing) return;
    setDrafts((prev) => {
      if (prev.length > 0) return prev;
      if (state.entries.length > 0) {
        const byId = new Map<string, User>();
        for (const u of activeUsers.values()) byId.set(u.id, u);
        return state.entries.map((e) => ({
          tokenId: e.tokenId,
          score: String(e.score),
          name: e.name,
          color: byId.get(e.tokenId)?.color ?? "#6b7280",
        }));
      }
      return Array.from(activeUsers.values()).map(fromUser);
    });
  }, [isEditing, state.entries, activeUsers]);

  const colorByTokenId = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of activeUsers.values()) m.set(u.id, u.color);
    return m;
  }, [activeUsers]);

  const handleSave = () => {
    const cleaned: InitiativeEntry[] = drafts
      .map((d) => ({
        tokenId: d.tokenId,
        score: Number.parseFloat(d.score),
        name: d.name.trim(),
      }))
      .filter((e) => e.tokenId && Number.isFinite(e.score));
    setEntries(cleaned);
    setIsEditing(false);
    setDrafts([]);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDrafts([]);
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
        {!isEditing && (
          <>
            {state.entries.length === 0 ? (
              <div className="parchment-flavor text-sm mb-3">No combatants yet.</div>
            ) : (
              <ol className="flex flex-col mb-4">
                {state.entries.map((entry, i) => {
                  const isCurrent = i === state.currentIndex;
                  const color = colorByTokenId.get(entry.tokenId) ?? "#6b7280";
                  return (
                    <li
                      key={`${entry.tokenId}-${i}`}
                      className="flex items-center gap-2.5 py-1.5 border-b last:border-b-0"
                      style={{
                        borderColor: "rgba(110, 83, 32, 0.2)",
                        background: isCurrent
                          ? "linear-gradient(to right, rgba(201, 162, 74, 0.15), transparent)"
                          : "transparent",
                      }}
                    >
                      <span
                        className="parchment-numeric w-5 text-right shrink-0"
                        style={{
                          fontSize: "0.95rem",
                          color: isCurrent
                            ? "var(--brass-shadow)"
                            : "var(--parchment-ink-muted)",
                        }}
                      >
                        {i + 1}
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
                      >
                        {entry.name || entry.tokenId.slice(0, 6)}
                      </span>
                      <span
                        className="parchment-numeric shrink-0"
                        style={{
                          fontSize: "1rem",
                          color: isCurrent ? "var(--brass-shadow)" : "var(--parchment-ink-muted)",
                        }}
                      >
                        {entry.score}
                      </span>
                      {isCurrent && (
                        <span
                          className="parchment-numeric shrink-0"
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--brass-shadow)",
                          }}
                        >
                          ◆ NOW
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
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
                onClick={() => setIsEditing(true)}
                className="parchment-numeric text-xs px-3 py-2 hover:text-[var(--brass-shadow)] transition-colors"
                style={{ color: "var(--brass-deep)" }}
              >
                {state.entries.length === 0 ? "SET UP" : "EDIT"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={state.entries.length === 0}
                aria-label="Reset"
                className="parchment-numeric px-2 py-1 disabled:opacity-30 hover:text-[var(--brass-shadow)] transition-colors"
                style={{ color: "var(--brass-deep)" }}
              >
                <RotateCcw className="h-4 w-4 inline" />
              </button>
            </div>
          </>
        )}

        {isEditing && (
          <div className="space-y-2">
            {drafts.length === 0 && (
              <div className="parchment-flavor text-sm">
                No active tokens — connect players or spawn NPCs first.
              </div>
            )}
            {drafts.map((d, idx) => (
              <div key={`${d.tokenId}-${idx}`} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: d.color,
                    boxShadow: "0 0 0 1px var(--parchment-bright), 0 0 0 1.5px var(--brass-deep)",
                  }}
                  aria-hidden
                />
                <input
                  type="text"
                  value={d.name}
                  placeholder="Name"
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row))
                    )
                  }
                  className="parchment-body flex-1 min-w-0 px-2 py-1 text-sm bg-[rgba(255,252,240,0.6)] border focus:outline-none focus:border-[var(--brass-shadow)]"
                  style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)" }}
                />
                <input
                  type="number"
                  value={d.score}
                  placeholder="0"
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, score: e.target.value } : row))
                    )
                  }
                  className="parchment-numeric w-14 px-2 py-1 text-sm bg-[rgba(255,252,240,0.6)] border focus:outline-none focus:border-[var(--brass-shadow)]"
                  style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)" }}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSave}
                className="parchment-numeric flex-1 text-sm py-2 px-3 border hover:bg-[rgba(201,162,74,0.15)] transition-colors"
                style={{
                  color: "var(--brass-shadow)",
                  borderColor: "var(--brass-deep)",
                  background: "rgba(255, 252, 240, 0.4)",
                }}
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="parchment-numeric text-sm py-2 px-4 hover:text-[var(--brass-shadow)] transition-colors"
                style={{ color: "var(--brass-deep)" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

