"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { User } from "../../types";

interface PlayerStatusPanelProps {
  activeUsers: Map<string, User>;
  disconnectedUsers: Map<string, User>;
}

interface Tile {
  key: string;
  label: string;
  color: string;
  status: "active" | "disconnected";
  position: { x: number; y: number };
}

const shorten = (id: string) =>
  id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-3)}`;

const labelFor = (u: { id: string; name?: string | null }) =>
  u.name && u.name.trim().length > 0 ? u.name : shorten(u.id);

// Glass Atelier presence indicator — replaces the old parchment list with a
// compact horizontal row of color-dot avatars. Hover reveals a glass tooltip
// with the player's name and grid position. Disconnected players render with
// a dashed border and reduced opacity. The map shows through the glass behind.
export const PlayerStatusPanel = ({
  activeUsers,
  disconnectedUsers,
}: PlayerStatusPanelProps) => {
  const [hovered, setHovered] = useState<string | null>(null);

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    for (const u of activeUsers.values()) {
      out.push({
        key: u.id,
        label: labelFor(u),
        color: u.color,
        status: "active",
        position: u.position,
      });
    }
    for (const u of disconnectedUsers.values()) {
      out.push({
        key: `dc:${u.id}`,
        label: labelFor(u),
        color: u.color,
        status: "disconnected",
        position: u.position,
      });
    }
    return out;
  }, [activeUsers, disconnectedUsers]);

  const liveCount = tiles.filter((t) => t.status === "active").length;

  return (
    <div className="glass-panel fixed top-4 right-4 z-40 flex items-center gap-2 px-3 py-2.5">
      {tiles.length === 0 ? (
        <div className="glass-muted text-xs px-1">No players connected.</div>
      ) : (
        <>
          {tiles.map((t) => {
            const isHovered = hovered === t.key;
            return (
              <div
                key={t.key}
                className="relative"
                onMouseEnter={() => setHovered(t.key)}
                onMouseLeave={() => setHovered((prev) => (prev === t.key ? null : prev))}
              >
                <span
                  aria-label={t.label}
                  className="block transition-transform"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: t.color,
                    border:
                      t.status === "disconnected"
                        ? "1.5px dashed rgba(255,255,255,0.55)"
                        : "1.5px solid rgba(255,255,255,0.85)",
                    opacity: t.status === "disconnected" ? 0.45 : 1,
                    boxShadow:
                      t.status === "active"
                        ? "0 0 0 1px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)"
                        : "0 0 0 1px rgba(0,0,0,0.4)",
                    transform: isHovered ? "scale(1.1)" : "scale(1)",
                    cursor: "default",
                  }}
                />
                {isHovered && (
                  <div
                    role="tooltip"
                    className="glass-panel absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 whitespace-nowrap pointer-events-none"
                    style={{ zIndex: 50 }}
                  >
                    <div className="glass-body text-xs font-medium">{t.label}</div>
                    <div className="glass-numeric text-[10px] mt-0.5">
                      {t.position.x.toFixed(0)}%, {t.position.y.toFixed(0)}%
                      {t.status === "disconnected" && (
                        <span className="ml-1.5 opacity-70">· offline</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <span className="glass-numeric text-[10px] tracking-wider pl-1.5 ml-1 border-l border-[var(--glass-border)] pr-0.5">
            {liveCount}/{tiles.length}
          </span>
        </>
      )}
      <button
        type="button"
        aria-label="Invite player (coming soon)"
        title="Invite player (coming soon)"
        className="glass-btn glass-btn-icon ml-1"
        style={{ width: 28, height: 28 }}
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
