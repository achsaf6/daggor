"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { Pause, Play, Plus, Square as Stop, Trash2, Volume2 } from "lucide-react";
import { Equalizer } from "../Theatrical/Equalizer";
import { PanelFrame } from "../Theatrical/PanelFrame";

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

// Soundboard panel for /dashboard.
// - Library of clip {name, url, loop} lives in localStorage (no DB needed).
// - Broadcast mode emits `soundboard:play` so every connected client plays
//   the clip; DM-only mode plays through a local <audio> element so the GM's
//   laptop alone hits the room speakers.
export const SoundboardPanel = ({ socket }: SoundboardPanelProps) => {
  const [clips, setClips] = useState<Clip[]>(() => loadClips());
  const [mode, setMode] = useState<"broadcast" | "dm-only">("broadcast");
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLoop, setDraftLoop] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedMode = window.localStorage.getItem(MODE_KEY);
      if (storedMode === "broadcast" || storedMode === "dm-only") setMode(storedMode);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
  }, [clips]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  // Stop any in-flight DM-only playback when the component unmounts.
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

  // Brass-inked button base — used everywhere in this panel.
  const inkBtn =
    "parchment-numeric text-sm py-2 px-3 border transition-colors hover:bg-[rgba(201,162,74,0.15)] disabled:opacity-30";
  const inkBtnStyle: React.CSSProperties = {
    color: "var(--brass-shadow)",
    borderColor: "var(--brass-deep)",
    background: "rgba(255, 252, 240, 0.4)",
  };

  return (
    <div className="parchment-panel fixed right-4 bottom-4 z-40 w-96 max-h-[60vh] overflow-visible">
      <PanelFrame
        title={
          <>
            <Volume2
              className="inline-block h-3.5 w-3.5 mr-2 -mt-0.5"
              style={{ color: "var(--brass-deep)" }}
            />
            Soundboard <span className="opacity-70">· {mode === "broadcast" ? "Broadcast" : "DM only"}</span>
          </>
        }
        trailing={
          <button
            type="button"
            onClick={() => setMode(mode === "broadcast" ? "dm-only" : "broadcast")}
            className="rounded p-1 text-[var(--brass-deep)] hover:text-[var(--brass-shadow)] transition-colors"
            aria-label="Toggle broadcast"
            title="Toggle: broadcast to all clients vs play only on this dashboard"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        }
      />
      <div className="px-5 pt-10 pb-5 overflow-y-auto max-h-[60vh]">
        <ul className="flex flex-col mb-4">
          {clips.length === 0 && (
            <li className="parchment-flavor text-sm">No clips yet.</li>
          )}
          {clips.map((c) => {
            const isPlaying = playingId === c.id;
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 py-2 border-b last:border-b-0"
                style={{ borderColor: "rgba(110, 83, 32, 0.2)" }}
              >
                <button
                  type="button"
                  onClick={() => (isPlaying ? stopAll() : playClip(c))}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  title={isPlaying ? "Pause" : "Play"}
                  className="h-8 w-8 flex items-center justify-center border transition-colors hover:bg-[rgba(201,162,74,0.2)]"
                  style={{
                    color: "var(--brass-shadow)",
                    borderColor: "var(--brass-deep)",
                    background: isPlaying ? "rgba(201, 162, 74, 0.2)" : "transparent",
                  }}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className="parchment-body text-sm truncate"
                    style={{ color: "var(--parchment-ink)" }}
                    title={c.url}
                  >
                    {c.name}
                    {c.loop && (
                      <span
                        className="parchment-numeric ml-2"
                        style={{ fontSize: "0.65rem", color: "var(--brass-deep)" }}
                      >
                        · LOOP
                      </span>
                    )}
                  </div>
                  <div
                    className="parchment-numeric"
                    style={{
                      fontSize: "0.7rem",
                      color: isPlaying ? "var(--brass-shadow)" : "var(--parchment-ink-muted)",
                    }}
                  >
                    {isPlaying ? "PLAYING" : "PAUSED"}
                  </div>
                </div>
                {isPlaying ? (
                  <Equalizer bars={12} height={20} />
                ) : (
                  <button
                    type="button"
                    onClick={() => removeClip(c.id)}
                    aria-label="Remove clip"
                    title="Remove clip"
                    className="h-6 w-6 flex items-center justify-center hover:text-[var(--brass-shadow)] transition-colors"
                    style={{ color: "var(--parchment-ink-muted)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isAdding ? (
          <div className="space-y-2">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name (e.g. Tavern ambient)"
              className="parchment-body w-full px-2 py-1.5 text-sm bg-[rgba(255,252,240,0.6)] border focus:outline-none focus:border-[var(--brass-shadow)]"
              style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)" }}
            />
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://… (mp3/ogg URL)"
              className="parchment-body w-full px-2 py-1.5 text-sm bg-[rgba(255,252,240,0.6)] border focus:outline-none focus:border-[var(--brass-shadow)]"
              style={{ borderColor: "var(--brass-deep)", color: "var(--parchment-ink)" }}
            />
            <label className="parchment-flavor flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftLoop}
                onChange={(e) => setDraftLoop(e.target.checked)}
                style={{ accentColor: "var(--brass-deep)" }}
              />
              Loop
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={addClip}
                disabled={!draftUrl.trim()}
                className={`flex-1 ${inkBtn}`}
                style={inkBtnStyle}
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setDraftName("");
                  setDraftUrl("");
                  setDraftLoop(false);
                }}
                className="parchment-numeric text-sm py-2 px-4 hover:text-[var(--brass-shadow)] transition-colors"
                style={{ color: "var(--brass-deep)" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 ${inkBtn}`}
              style={inkBtnStyle}
            >
              <Plus className="h-3.5 w-3.5" />
              ADD CLIP
            </button>
            <button
              type="button"
              onClick={stopAll}
              disabled={!playingId}
              aria-label="Stop all"
              title="Stop all"
              className={inkBtn}
              style={{ ...inkBtnStyle, padding: "0.5rem 0.75rem" }}
            >
              <Stop className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
