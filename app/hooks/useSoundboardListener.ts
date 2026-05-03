"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";

// Plays clips broadcast by the dashboard via `soundboard:played` and stops
// them on `soundboard:stopped`. Browsers block autoplay until the page has
// received a user gesture; on the player route the LoadingScreen "Enter"
// button satisfies that, so by the time a clip arrives audio is unlocked.
export const useSoundboardListener = (socket: Socket | null) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!socket) return;

    const stopAndCleanup = () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      audioRef.current = null;
    };

    const handlePlayed = (payload: { url?: string; loop?: boolean }) => {
      if (!payload?.url) return;
      stopAndCleanup();
      const audio = new Audio(payload.url);
      audio.loop = Boolean(payload.loop);
      audio.play().catch((err) => {
        // Autoplay blocked or load failed; surface but don't crash.
        console.warn("[Soundboard] playback rejected", err);
      });
      audioRef.current = audio;
    };

    const handleStopped = () => stopAndCleanup();

    socket.on("soundboard:played", handlePlayed);
    socket.on("soundboard:stopped", handleStopped);
    return () => {
      socket.off("soundboard:played", handlePlayed);
      socket.off("soundboard:stopped", handleStopped);
      stopAndCleanup();
    };
  }, [socket]);
};
