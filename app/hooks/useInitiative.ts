"use client";

import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export interface InitiativeEntry {
  tokenId: string;
  score: number;
  name: string;
}

export interface InitiativeState {
  entries: InitiativeEntry[];
  currentIndex: number;
  round: number;
}

const EMPTY_STATE: InitiativeState = { entries: [], currentIndex: -1, round: 0 };

// Subscribes to `initiative:updated` and exposes ack-based mutators.
// Server-authoritative: every change re-broadcasts the full state, so the
// client never has to merge concurrent edits — last write wins.
export const useInitiative = (socket: Socket | null) => {
  const [state, setState] = useState<InitiativeState>(EMPTY_STATE);

  useEffect(() => {
    if (!socket) return;

    const handleUpdated = (payload: InitiativeState | null | undefined) => {
      if (!payload) return;
      setState({
        entries: Array.isArray(payload.entries) ? payload.entries : [],
        currentIndex: typeof payload.currentIndex === "number" ? payload.currentIndex : -1,
        round: typeof payload.round === "number" ? payload.round : 0,
      });
    };

    socket.on("initiative:updated", handleUpdated);
    socket.emit(
      "initiative:request",
      {},
      (response: { ok?: boolean; state?: InitiativeState } | null | undefined) => {
        if (response?.ok && response.state) {
          handleUpdated(response.state);
        }
      }
    );

    return () => {
      socket.off("initiative:updated", handleUpdated);
    };
  }, [socket]);

  const setEntries = useCallback(
    (entries: InitiativeEntry[]) => {
      socket?.emit("initiative:set-entries", { entries });
    },
    [socket]
  );
  const advance = useCallback(
    (direction: "next" | "prev") => {
      socket?.emit("initiative:advance", { direction });
    },
    [socket]
  );
  const reset = useCallback(() => {
    socket?.emit("initiative:reset", {});
  }, [socket]);
  const reorder = useCallback(
    (orderedTokenIds: string[]) => {
      socket?.emit("initiative:reorder", { order: orderedTokenIds });
    },
    [socket]
  );
  const setScore = useCallback(
    (tokenId: string, score: number) => {
      socket?.emit("initiative:set-score", { tokenId, score });
    },
    [socket]
  );

  return { state, setEntries, advance, reset, reorder, setScore };
};
