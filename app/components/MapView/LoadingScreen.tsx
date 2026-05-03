'use client';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCharacter } from "@/app/providers/CharacterProvider";

interface LoadingScreenProps {
  isReady: boolean;
  onEnterClick: () => void;
  // Mobile players go through a "Who are you?" character form before entering.
  // DM surfaces (display/dashboard) skip the form and just wait for isReady.
  showCharacterForm?: boolean;
}

const MIN_VISIBLE_DURATION_MS = 5000;

export const LoadingScreen = ({
  isReady,
  onEnterClick,
  showCharacterForm = true,
}: LoadingScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);
  const visibleSinceRef = useRef<number>(0);
  const {
    pendingName,
    setPendingName,
    selectCharacter,
    selectionError,
    isResolving,
    hasSelectedCharacter,
    character,
  } = useCharacter();

  useEffect(() => {
    if (isReady) {
      if (!visibleSinceRef.current) {
        visibleSinceRef.current = performance.now();
      }

      const elapsed = performance.now() - visibleSinceRef.current;
      const remaining = Math.max(MIN_VISIBLE_DURATION_MS - elapsed, 0);

      const hideTimer = window.setTimeout(() => setIsVisible(false), remaining);
      const unmountTimer = window.setTimeout(
        () => setShouldRender(false),
        remaining + 850
      );

      return () => {
        window.clearTimeout(hideTimer);
        window.clearTimeout(unmountTimer);
      };
    }

    visibleSinceRef.current = performance.now();
    const frame = window.requestAnimationFrame(() => {
      setShouldRender(true);
      setIsVisible(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isReady]);


  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#120303]",
        "transition-opacity duration-700 ease-out",
        isVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        aria-hidden
        className="loading-screen-bg absolute inset-0"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/80" />


      <div
        className={cn(
          "relative z-10 flex flex-col items-center gap-8 px-6 text-center text-neutral-100",
          "transition-opacity duration-300 opacity-100"
        )}
      >
        <div className="relative flex h-40 w-40 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-primary/30 bg-primary/15 blur-3xl" />
          <span className="absolute inset-4 rounded-full border border-primary/40 loading-rune-spin" />
          <span className="absolute inset-1 rounded-full border border-primary/20 loading-rune-spin-reverse" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-transparent to-primary/20" />
          <Image
            src="/favicon.png"
            alt="Daggor crest"
            fill
            priority
            className="object-contain drop-shadow-[0_0_1.6rem_rgba(220,175,90,0.55)]"
          />
        </div>

        <div className="space-y-2">
          <p
            className="text-[0.7rem] uppercase tracking-[0.65em] text-primary/80"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Arcane Loading Ritual
          </p>
          <p
            className="text-3xl font-bold tracking-tight text-foreground drop-shadow-[0_0_1.25rem_rgba(0,0,0,0.9)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Forging the Battlemap…
          </p>
          <p className="mx-auto max-w-sm text-sm font-medium text-muted-foreground">
            Gathering heroes, aligning gridlines, and summoning the realm for play.
          </p>
        </div>

        {showCharacterForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (isResolving) {
              return;
            }
            const trimmedName = pendingName.trim();
            if (!trimmedName) {
              return;
            }
            const normalizedName = trimmedName.toLowerCase();
            // If character is already selected and name matches (case-insensitive), just proceed
            if (hasSelectedCharacter && character && character.name.toLowerCase() === normalizedName) {
              onEnterClick();
              return;
            }
            // Otherwise, select/load the character (using lowercase for processing)
            void selectCharacter(normalizedName).then(() => {
              onEnterClick();
            });
          }}
          className="w-full max-w-sm space-y-3 text-left"
        >
          <label
            htmlFor="loading-screen-character-name"
            className="text-xs font-medium uppercase tracking-wider text-primary/90"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Who are you?
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="loading-screen-character-name"
              type="text"
              value={pendingName}
              onChange={(event) => setPendingName(event.target.value)}
              className="flex-1 rounded-md border border-border bg-card/50 px-3 py-2 text-sm text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isResolving}
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isResolving || !pendingName.trim()}
            >
              Enter
            </button>
          </div>
          {selectionError && (
            <p className="text-xs font-medium text-destructive">{selectionError}</p>
          )}
          {!selectionError && hasSelectedCharacter && character && (
            <p className="text-xs text-chart-2">
              Welcome, <span className="font-semibold">{character.name}</span>. We&apos;ll load your
              character sheet from the characters vault.
            </p>
          )}
          {!selectionError && !hasSelectedCharacter && (
            <p className="text-[0.65rem] text-muted-foreground">
              This name becomes your key inside the Supabase <code className="font-mono">characters</code>{" "}
              table. We&apos;ll create it if it does not exist.
            </p>
          )}
        </form>
        )}
      </div>
    </div>
  );
};

