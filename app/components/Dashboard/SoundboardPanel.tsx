"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Plus,
  Settings,
  Square as Stop,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Equalizer } from "../Theatrical/Equalizer";

interface SoundboardPanelProps {
  socket: Socket | null;
}

interface Clip {
  id: string;
  name: string;
  url: string;
  loop?: boolean;
}

const STORAGE_KEY = "daggor:soundboard:clips:v1";
const MODE_KEY = "daggor:soundboard:mode:v1";

const loadClips = (): Clip[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === "string" && typeof c.url === "string")
      .map((c) => ({
        id: c.id,
        name: typeof c.name === "string" ? c.name : c.url,
        url: c.url,
        loop: Boolean(c.loop),
      }));
  } catch {
    return [];
  }
};

// Glass Atelier soundboard. Default-collapsed: row of icon buttons, one per
// clip, sits in the corner. Click the gear to expand into a management panel
// for naming, looping, and adding new clips. Mode toggles between broadcast
// (every connected client plays via socket) and DM-only (local <audio>).
const loadMode = (): "broadcast" | "dm-only" => {
  if (typeof window === "undefined") return "broadcast";
  try {
    const stored = window.localStorage.getItem(MODE_KEY);
    if (stored === "broadcast" || stored === "dm-only") return stored;
  } catch {
    // ignore
  }
  return "broadcast";
};

export const SoundboardPanel = ({ socket }: SoundboardPanelProps) => {
  const [clips, setClips] = useState<Clip[]>(() => loadClips());
  const [mode, setMode] = useState<"broadcast" | "dm-only">(loadMode);
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLoop, setDraftLoop] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
  }, [clips]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    return () => {
      const a = localAudioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
    };
  }, []);

  const stopAll = () => {
    const a = localAudioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    localAudioRef.current = null;
    setPlayingId(null);
    socket?.emit("soundboard:stop", {});
  };

  const playClip = (clip: Clip) => {
    if (mode === "broadcast") {
      socket?.emit("soundboard:play", {
        url: clip.url,
        name: clip.name,
        loop: Boolean(clip.loop),
      });
    } else {
      const a = localAudioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      const audio = new Audio(clip.url);
      audio.loop = Boolean(clip.loop);
      audio.play().catch((err) => console.warn("[Soundboard] DM-only playback failed", err));
      localAudioRef.current = audio;
    }
    setPlayingId(clip.id);
  };

  const addClip = () => {
    const name = draftName.trim();
    const url = draftUrl.trim();
    if (!url) return;
    setClips((prev) => [
      ...prev,
      {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name || url,
        url,
        loop: draftLoop,
      },
    ]);
    setDraftName("");
    setDraftUrl("");
    setDraftLoop(false);
    setIsAdding(false);
  };

  const removeClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (playingId === id) stopAll();
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {/* Expanded management panel (renders above the icon strip) */}
      {isExpanded && (
        <div
          className="glass-panel"
          style={{ width: 360, maxHeight: "60vh", overflow: "hidden" }}
        >
          <div className="px-4 py-2.5 border-b border-[var(--glass-border)] flex items-center justify-between">
            <div className="glass-heading flex items-center gap-1.5">
              <Volume2 className="h-3 w-3" />
              Soundboard ·{" "}
              <span className="opacity-70 normal-case tracking-normal">
                {mode === "broadcast" ? "Broadcast" : "DM only"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMode(mode === "broadcast" ? "dm-only" : "broadcast")}
              aria-label="Toggle broadcast"
              title="Toggle: broadcast to all clients vs play only on this dashboard"
              className="glass-btn glass-btn-icon"
              style={{ width: 24, height: 24 }}
            >
              {mode === "broadcast" ? (
                <Volume2 className="h-3 w-3" />
              ) : (
                <VolumeX className="h-3 w-3" />
              )}
            </button>
          </div>

          <div className="px-4 py-3 overflow-y-auto" style={{ maxHeight: 300 }}>
            {clips.length === 0 ? (
              <div className="glass-muted text-xs">No clips yet.</div>
            ) : (
              <ul className="flex flex-col">
                {clips.map((c) => {
                  const isPlaying = playingId === c.id;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 py-1.5 border-b last:border-b-0"
                      style={{ borderColor: "var(--glass-border)" }}
                    >
                      <button
                        type="button"
                        onClick={() => (isPlaying ? stopAll() : playClip(c))}
                        aria-label={isPlaying ? "Pause" : "Play"}
                        className="glass-btn glass-btn-icon"
                        style={{
                          width: 26,
                          height: 26,
                          ...(isPlaying
                            ? {
                                background: "var(--glass-accent-soft)",
                                borderColor: "var(--glass-accent)",
                                color: "var(--glass-accent)",
                              }
                            : {}),
                        }}
                      >
                        {isPlaying ? (
                          <Pause className="h-3 w-3 fill-current" />
                        ) : (
                          <Play className="h-3 w-3 fill-current" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="glass-body text-xs truncate" title={c.url}>
                          {c.name}
                          {c.loop && (
                            <span
                              className="glass-numeric ml-1.5"
                              style={{ fontSize: "0.6rem", color: "var(--glass-accent)" }}
                            >
                              · LOOP
                            </span>
                          )}
                        </div>
                      </div>
                      {isPlaying ? (
                        <Equalizer bars={6} height={14} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeClip(c.id)}
                          aria-label="Remove clip"
                          className="glass-btn glass-btn-icon"
                          style={{
                            width: 22,
                            height: 22,
                            border: "none",
                            color: "var(--glass-txt-faint)",
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {isAdding ? (
              <div className="space-y-2 mt-3 pt-3 border-t border-[var(--glass-border)]">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Name (e.g. Tavern ambient)"
                  className="glass-body w-full px-2 py-1.5 text-xs focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 6,
                    color: "var(--glass-txt)",
                  }}
                />
                <input
                  type="url"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="https://… (mp3/ogg URL)"
                  className="glass-body w-full px-2 py-1.5 text-xs focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 6,
                    color: "var(--glass-txt)",
                  }}
                />
                <label className="glass-muted flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draftLoop}
                    onChange={(e) => setDraftLoop(e.target.checked)}
                    style={{ accentColor: "var(--glass-accent)" }}
                  />
                  Loop
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={addClip}
                    disabled={!draftUrl.trim()}
                    className="glass-btn glass-btn-primary flex-1 text-xs"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setDraftName("");
                      setDraftUrl("");
                      setDraftLoop(false);
                    }}
                    className="glass-btn text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="glass-btn w-full mt-3 flex items-center justify-center gap-1.5 text-xs"
              >
                <Plus className="h-3 w-3" />
                Add clip
              </button>
            )}
          </div>
        </div>
      )}

      {/* Always-visible icon strip */}
      <div className="glass-panel flex items-center gap-1 p-1.5">
        {clips.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setIsAdding(true);
            }}
            className="glass-btn flex items-center gap-1.5 text-xs"
            aria-label="Add first clip"
          >
            <Plus className="h-3 w-3" />
            Add clip
          </button>
        ) : (
          clips.map((c) => {
            const isPlaying = playingId === c.id;
            const isHovered = hoverId === c.id;
            return (
              <div
                key={c.id}
                className="relative"
                onMouseEnter={() => setHoverId(c.id)}
                onMouseLeave={() => setHoverId((p) => (p === c.id ? null : p))}
              >
                <button
                  type="button"
                  onClick={() => (isPlaying ? stopAll() : playClip(c))}
                  aria-label={isPlaying ? `Stop ${c.name}` : `Play ${c.name}`}
                  className="glass-btn glass-btn-icon"
                  style={{
                    width: 32,
                    height: 32,
                    ...(isPlaying
                      ? {
                          background: "var(--glass-accent-soft)",
                          borderColor: "var(--glass-accent)",
                          color: "var(--glass-accent)",
                        }
                      : {}),
                  }}
                >
                  {isPlaying ? (
                    <Equalizer bars={3} height={12} />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                </button>
                {isHovered && (
                  <div
                    className="glass-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 whitespace-nowrap pointer-events-none"
                    style={{ zIndex: 50 }}
                  >
                    <div className="glass-body text-xs font-medium">{c.name}</div>
                    {c.loop && (
                      <div
                        className="glass-numeric"
                        style={{ fontSize: "0.6rem", color: "var(--glass-accent)" }}
                      >
                        LOOP
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {clips.length > 0 && (
          <>
            <div
              aria-hidden
              style={{
                width: 1,
                alignSelf: "stretch",
                background: "var(--glass-border)",
                margin: "0 2px",
              }}
            />
            <button
              type="button"
              onClick={stopAll}
              disabled={!playingId}
              aria-label="Stop all"
              className="glass-btn glass-btn-icon"
              style={{ width: 28, height: 28 }}
            >
              <Stop className="h-3 w-3 fill-current" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-label={isExpanded ? "Close manager" : "Open manager"}
          className="glass-btn glass-btn-icon"
          style={{ width: 28, height: 28 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : clips.length > 0 ? (
            <Settings className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
};
