"use client";

import { useMemo } from "react";
import { UserPlus } from "lucide-react";
import { User } from "../../types";
import { PanelFrame } from "../Theatrical/PanelFrame";

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

// Prefer the player's chosen character name. Fall back to a shortened socket
// id only when no name has flowed through yet — useful in the brief window
// between connect and the mobile client's user-name-update.
const labelFor = (u: { id: string; name?: string | null }) =>
  u.name && u.name.trim().length > 0 ? u.name : shorten(u.id);

// Belle Époque presence panel — illuminated journal page on the dark
// dashboard. Title interrupts the top brass rule (engraved into the
// frame), entries use Cinzel for names + Bebas for live/off status.
export const PlayerStatusPanel = ({
  activeUsers,
  disconnectedUsers,
}: PlayerStatusPanelProps) => {
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
    <div className="parchment-panel fixed right-4 top-4 z-40 w-80 max-h-[60vh] overflow-visible">
      <PanelFrame
        title={<>Players <span className="opacity-70">· {liveCount}/{tiles.length}</span></>}
        trailing={
          <button
            type="button"
            className="rounded p-1 text-[var(--brass-deep)] hover:text-[var(--brass-shadow)] transition-colors"
            aria-label="Invite player"
            title="Invite player (coming soon)"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        }
      />
      <div className="px-5 pt-10 pb-5 overflow-y-auto max-h-[60vh]">
        {tiles.length === 0 && (
          <div className="parchment-flavor text-sm">No players connected.</div>
        )}
        <ul className="flex flex-col gap-2">
          {tiles.map((t) => (
            <li
              key={t.key}
              className={`flex items-center gap-3 transition-opacity ${
                t.status === "active" ? "" : "opacity-55"
              }`}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full"
                style={{
                  backgroundColor: t.color,
                  boxShadow:
                    "0 0 0 1.5px var(--parchment-bright), 0 0 0 2.5px var(--brass-deep)",
                }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="parchment-body text-sm font-medium truncate">
                  {t.label}
                </div>
                <div
                  className="parchment-numeric text-xs"
                  style={{ fontSize: "0.7rem" }}
                >
                  {t.position.x.toFixed(0)}%, {t.position.y.toFixed(0)}%
                </div>
              </div>
              <span
                className="parchment-numeric flex items-center gap-1.5 text-xs"
                style={{
                  color: t.status === "active" ? "#3a6a3a" : "var(--parchment-ink-muted)",
                }}
              >
                {t.status === "active" ? "LIVE" : "OFF"}
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      t.status === "active" ? "#3a6a3a" : "var(--parchment-ink-muted)",
                  }}
                  aria-hidden
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
