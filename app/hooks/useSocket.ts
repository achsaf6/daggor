import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { User, Position, TokenSize, TokenTemplate } from "../types";
import { Surface, isDmSurface } from "./useSurface";

interface UserWithPersistentId extends User {
  persistentUserId?: string;
}

interface UseSocketReturn {
  myUserId: string | null;
  myPersistentUserId: string | null;
  myColor: string;
  myPosition: Position;
  myImageSrc: string | null;
  mySize: TokenSize;
  otherUsers: Map<string, User>;
  disconnectedUsers: Map<string, User>;
  socket: Socket | null;
  updateMyPosition: (position: Position) => void;
  updateTokenPosition: (tokenId: string, position: Position) => void;
  updateTokenImage: (tokenId: string, imageSrc: string | null) => void;
  updateTokenSize: (tokenId: string, size: TokenSize) => void;
  removeToken: (persistentUserId: string) => void;
  addToken: (tokenTemplate: TokenTemplate, position?: Position) => void;
  updateMyName: (name: string | null) => void;
}

export const useSocket = (surface: Surface = "mobile"): UseSocketReturn => {
  const isDisplay = isDmSurface(surface);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#ef4444");
  const [myPosition, setMyPosition] = useState<Position>({ x: 50, y: 50 });
  const [myImageSrc, setMyImageSrc] = useState<string | null>(null);
  const [mySize, setMySize] = useState<TokenSize>("medium");
  const [otherUsers, setOtherUsers] = useState<Map<string, User>>(new Map());
  const [disconnectedUsers, setDisconnectedUsers] = useState<Map<string, User>>(new Map());
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const persistentUserIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);

  // Get or create persistent user ID from localStorage
  useEffect(() => {
    const getPersistentUserId = (): string => {
      if (typeof window === "undefined") {
        return `temp-${Date.now()}-${Math.random()}`;
      }
      const stored = localStorage.getItem("persistentUserId");
      if (stored) {
        return stored;
      }
      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem("persistentUserId", newId);
      return newId;
    };

    persistentUserIdRef.current = getPersistentUserId();

    // Connect to WebSocket server
    // In production, use the same origin if NEXT_PUBLIC_WS_URL is not set
    const getWebSocketUrl = () => {
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
      }
      if (typeof window !== "undefined") {
        // Use current origin in production (browser)
        return window.location.origin;
      }
      return "http://localhost:3000";
    };

    const socketInstance = io(getWebSocketUrl(), {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socketInstance;
    // Necessary to make socket available in return value - defer state update to avoid synchronous setState
    queueMicrotask(() => {
      setSocket(socketInstance);
    });

    // Dev-only: expose the live socket on window so Playwright tests can
    // observe socket id, listen for events, and assert cross-context sync.
    // Production builds skip this branch entirely.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const w = window as unknown as { __daggor?: Record<string, unknown> };
      w.__daggor = { ...(w.__daggor ?? {}), socket: socketInstance, surface };
    }

    // Handle connection
    socketInstance.on("connect", () => {
      console.log("Connected to server");
      // Pull the character name from localStorage if the player has already
      // chosen one in a prior session — otherwise the server only sees an id
      // and the dashboard players panel can't do better than a hex stub.
      const storedName =
        typeof window !== "undefined"
          ? window.localStorage.getItem("characterName")
          : null;
      // Send user identification immediately after connection
      socketInstance.emit("user-identify", {
        persistentUserId: persistentUserIdRef.current,
        surface,
        // Kept for back-compat with older server logic that still reads isDisplay.
        isDisplay,
        name: storedName,
      });
    });

    // Handle disconnection
    socketInstance.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
      if (reason === "io server disconnect") {
        // Server initiated disconnect, client needs to manually reconnect
        socketInstance.connect();
      }
    });

    // Handle reconnection attempts
    socketInstance.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
    });

    // Handle successful reconnection
    socketInstance.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected to server after ${attemptNumber} attempts`);
    });

    // Handle reconnection errors
    socketInstance.on("reconnect_error", (error) => {
      console.error("Reconnection error:", error);
    });

    // Handle failed reconnection (all attempts exhausted)
    socketInstance.on("reconnect_failed", () => {
      console.error("Failed to reconnect to server after all attempts");
    });

    // Receive user info (my own ID and color)
    socketInstance.on(
      "user-connected",
      (data: {
        userId: string;
        color: string;
        position: { x: number; y: number };
        imageSrc?: string | null;
        size?: TokenSize;
      }) => {
        console.log("DEBUG: user-connected")
        setMyUserId(data.userId);
        myUserIdRef.current = data.userId;
        setMyColor(data.color);
        setMyPosition(data.position);
        setMyImageSrc(data.imageSrc || null);
        setMySize(data.size ?? "medium");
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as { __daggor?: Record<string, unknown> };
          w.__daggor = { ...(w.__daggor ?? {}), myColor: data.color, myUserId: data.userId };
        }
      }
    );

    // Receive all existing users
    socketInstance.on("all-users", (users: UserWithPersistentId[]) => {
      const usersMap = new Map<string, User>();
      const currentMyUserId = myUserIdRef.current || socketInstance.id;
      users.forEach((user) => {
        if (user.id !== currentMyUserId) {
          // Preserve persistentUserId if it exists
          const userData: UserWithPersistentId = {
            id: user.id,
            color: user.color,
            position: user.position,
            imageSrc: user.imageSrc || null,
            size: user.size ?? "medium",
            name: user.name ?? null,
          };
          if (user.persistentUserId) {
            userData.persistentUserId = user.persistentUserId;
          }
          usersMap.set(user.id, userData);
        }
      });
      setOtherUsers(usersMap);
    });

    // Handle new user joining
    socketInstance.on(
      "user-joined",
      (data: {
        userId: string;
        persistentUserId?: string;
        color: string;
        position: { x: number; y: number };
        imageSrc?: string | null;
        size?: TokenSize;
        name?: string | null;
      }) => {
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          const userData: UserWithPersistentId = {
            id: data.userId,
            color: data.color,
            position: data.position,
            imageSrc: data.imageSrc || null,
            size: data.size ?? "medium",
            name: data.name ?? null,
          };
          if (data.persistentUserId) {
            userData.persistentUserId = data.persistentUserId;
          }
          updated.set(data.userId, userData);
          return updated;
        });
      }
    );

    // Handle user position update
    socketInstance.on(
      "user-moved",
      (data: { userId: string; position: { x: number; y: number } }) => {
        const currentMyUserId = myUserIdRef.current || socketInstance.id;
        // Update other users
        if (data.userId !== currentMyUserId) {
          setOtherUsers((prev) => {
            const updated = new Map(prev);
            const user = updated.get(data.userId);
            if (user) {
              updated.set(data.userId, {
                ...user,
                position: data.position,
              });
            }
            return updated;
          });
          // Disconnected (faded) tokens are keyed by persistentUserId; the DM
          // may have dragged one and we need to mirror the move locally.
          setDisconnectedUsers((prev) => {
            const user = prev.get(data.userId);
            if (!user) return prev;
            const updated = new Map(prev);
            updated.set(data.userId, { ...user, position: data.position });
            return updated;
          });
        } else {
          // Update our own position if someone else moved our token
          setMyPosition(data.position);
        }
      }
    );

    // Handle user leaving (deprecated - now using user-disconnected)
    socketInstance.on("user-left", (data: { userId: string }) => {
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        updated.delete(data.userId);
        return updated;
      });
    });

    // Handle user disconnecting (moved to disconnected state)
    socketInstance.on("user-disconnected", (data: { userId: string; persistentUserId: string; color: string; position: { x: number; y: number }; imageSrc?: string | null; size?: TokenSize; name?: string | null }) => {
      // Remove from active users
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        const user = updated.get(data.userId);
        if (user) {
          // Move to disconnected users with persistent ID as key
          setDisconnectedUsers((prevDisconnected) => {
            const updatedDisconnected = new Map(prevDisconnected);
            updatedDisconnected.set(data.persistentUserId, {
              id: data.persistentUserId,
              color: user.color,
              position: user.position,
              imageSrc: user.imageSrc || data.imageSrc || null,
            size: user.size ?? data.size ?? "medium",
            name: user.name ?? data.name ?? null,
            });
            return updatedDisconnected;
          });
        }
        updated.delete(data.userId);
        return updated;
      });
    });

    // Handle user reconnecting
    socketInstance.on(
      "user-reconnected",
      (data: {
        userId: string;
        persistentUserId: string;
        color: string;
        position: { x: number; y: number };
        imageSrc?: string | null;
        size?: TokenSize;
        name?: string | null;
      }) => {
        // Remove from disconnected users
        setDisconnectedUsers((prev) => {
          const updated = new Map(prev);
          updated.delete(data.persistentUserId);
          return updated;
        });
        // Add back to active users
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          const userData: UserWithPersistentId = {
            id: data.userId,
            color: data.color,
            position: data.position,
            imageSrc: data.imageSrc || null,
            persistentUserId: data.persistentUserId,
            size: data.size ?? "medium",
            name: data.name ?? null,
          };
          updated.set(data.userId, userData);
          return updated;
        });
      }
    );

    // Handle token removal
    socketInstance.on("token-removed", (data: { persistentUserId: string }) => {
      setDisconnectedUsers((prev) => {
        const updated = new Map(prev);
        updated.delete(data.persistentUserId);
        return updated;
      });
      
      // Also check active users (in case they're still connected)
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        // Find and remove by persistentUserId if it matches
        for (const [userId, user] of updated.entries()) {
          const userWithPersistentId = user as UserWithPersistentId;
          if (userWithPersistentId.persistentUserId === data.persistentUserId) {
            updated.delete(userId);
            break;
          }
        }
        return updated;
      });
    });

    // Handle disconnected users list (for display mode users to track)
    socketInstance.on("disconnected-users", (disconnectedUsersList: UserWithPersistentId[]) => {
      // Store disconnected users so their tokens remain visible
      // Use persistentUserId as key for consistency with user-disconnected handler
      const disconnectedMap = new Map<string, User>();
      disconnectedUsersList.forEach((user) => {
        const userWithPersistentId = user as UserWithPersistentId;
        const key = userWithPersistentId.persistentUserId || user.id;
        disconnectedMap.set(key, user);
      });
      setDisconnectedUsers(disconnectedMap);
    });

    // Player names. Server broadcasts after a mobile client emits
    // user-name-update; we patch both active and disconnected entries so the
    // dashboard panel reflects the change without reconnecting.
    socketInstance.on(
      "user-name-updated",
      (data: { userId: string; persistentUserId?: string; name: string | null }) => {
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          const user = updated.get(data.userId);
          if (user) {
            updated.set(data.userId, { ...user, name: data.name });
          }
          return updated;
        });
        if (data.persistentUserId) {
          setDisconnectedUsers((prev) => {
            const updated = new Map(prev);
            const dc = updated.get(data.persistentUserId!);
            if (dc) {
              updated.set(data.persistentUserId!, { ...dc, name: data.name });
            }
            return updated;
          });
        }
      }
    );

    // Handle new token added
    socketInstance.on(
      "token-added",
      (data: {
        userId: string;
        persistentUserId: string;
        color: string;
        position: { x: number; y: number };
        imageSrc?: string | null;
        size?: TokenSize;
        name?: string | null;
      }) => {
        const userData: UserWithPersistentId = {
          id: data.userId,
          color: data.color,
          position: data.position,
          imageSrc: data.imageSrc || null,
          persistentUserId: data.persistentUserId,
          size: data.size ?? "medium",
          name: data.name ?? null,
        };
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          updated.set(data.userId, userData);
          return updated;
        });
      }
    );

    // Handle token image update
    socketInstance.on(
      "token-image-updated",
      (data: { userId: string; imageSrc: string | null }) => {
        const currentMyUserId = myUserIdRef.current || socketInstance.id;
        // Update our own image if it's our token
        if (data.userId === currentMyUserId) {
          setMyImageSrc(data.imageSrc);
        } else {
          // Update other users
          setOtherUsers((prev) => {
            const updated = new Map(prev);
            const user = updated.get(data.userId);
            if (user) {
              updated.set(data.userId, {
                ...user,
                imageSrc: data.imageSrc,
              });
            }
            return updated;
          });
        }
        // Also update disconnected users if applicable
        setDisconnectedUsers((prev) => {
          const updated = new Map(prev);
          for (const [key, user] of updated.entries()) {
            const userWithPersistentId = user as UserWithPersistentId;
            // Check both by userId and persistentUserId since keys might be either
            if (user.id === data.userId || userWithPersistentId.persistentUserId === data.userId || key === data.userId) {
              updated.set(key, {
                ...user,
                imageSrc: data.imageSrc,
              });
            }
          }
          return updated;
        });
      }
    );

    // Handle token size update
    socketInstance.on(
      "token-size-updated",
      (data: { userId: string; size: TokenSize }) => {
        const currentMyUserId = myUserIdRef.current || socketInstance.id;

        if (data.userId === currentMyUserId) {
          setMySize(data.size);
        }

        setOtherUsers((prev) => {
          const updated = new Map(prev);
          const user = updated.get(data.userId);
          if (user) {
            updated.set(data.userId, {
              ...user,
              size: data.size,
            });
          }
          return updated;
        });

        setDisconnectedUsers((prev) => {
          const updated = new Map(prev);
          // Search for the user by userId or persistentUserId since keys might be either
          for (const [key, user] of updated.entries()) {
            const withPersistent = user as UserWithPersistentId;
            if (user.id === data.userId || withPersistent.persistentUserId === data.userId || key === data.userId) {
              updated.set(key, {
                ...user,
                size: data.size,
              });
              break;
            }
          }
          return updated;
        });
      }
    );

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, [surface, isDisplay]);

  const updateMyPosition = (position: Position) => {
    setMyPosition(position);
    if (socketRef.current && myUserId) {
      socketRef.current.emit("position-update", {
        tokenId: myUserId,
        position,
      });
    }
  };

  const updateTokenPosition = (tokenId: string, position: Position) => {
    // If it's our own token, update local state
    if (tokenId === myUserId) {
      setMyPosition(position);
    } else {
      // Update other user's position in local state immediately for responsiveness
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        const user = updated.get(tokenId);
        if (user) {
          updated.set(tokenId, {
            ...user,
            position,
          });
        }
        return updated;
      });
      // DM may also be dragging a disconnected (faded) token, keyed by persistentUserId.
      setDisconnectedUsers((prev) => {
        const user = prev.get(tokenId);
        if (!user) return prev;
        const updated = new Map(prev);
        updated.set(tokenId, { ...user, position });
        return updated;
      });
    }
    
    // Send update to server
    if (socketRef.current) {
      socketRef.current.emit("position-update", {
        tokenId,
        position,
      });
    }
  };

  const updateTokenImage = (tokenId: string, imageSrc: string | null) => {
    // Update local state immediately for responsiveness
    if (tokenId === myUserId) {
      // Update our own image state
      setMyImageSrc(imageSrc);
    } else {
      // Update other user's image in local state
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        const user = updated.get(tokenId);
        if (user) {
          updated.set(tokenId, {
            ...user,
            imageSrc,
          });
        }
        return updated;
      });
    }
    
    // Send update to server
    if (socketRef.current) {
      socketRef.current.emit("token-image-update", {
        tokenId,
        imageSrc,
      });
    }
  };

  const updateTokenSize = (tokenId: string, size: TokenSize) => {
    if (tokenId === myUserId) {
      setMySize(size);
    } else {
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        const user = updated.get(tokenId);
        if (user) {
          updated.set(tokenId, {
            ...user,
            size,
          });
        }
        return updated;
      });
    }

    setDisconnectedUsers((prev) => {
      const updated = new Map(prev);
      // Search for the user by userId or persistentUserId since keys might be either
      for (const [key, user] of updated.entries()) {
        const withPersistent = user as UserWithPersistentId;
        if (user.id === tokenId || withPersistent.persistentUserId === tokenId || key === tokenId) {
          updated.set(key, {
            ...user,
            size,
          });
          break;
        }
      }
      return updated;
    });

    if (socketRef.current) {
      socketRef.current.emit("token-size-update", {
        tokenId,
        size,
      });
    }
  };

  const removeToken = (persistentUserId: string) => {
    if (socketRef.current && isDisplay) {
      socketRef.current.emit("remove-token", { persistentUserId });
    }
  };

  const addToken = (
    tokenTemplate: TokenTemplate,
    position: Position = { x: 50, y: 50 }
  ) => {
    if (socketRef.current) {
      socketRef.current.emit("add-token", {
        color: tokenTemplate.color,
        position,
        size: tokenTemplate.size,
        imageSrc: tokenTemplate.imageUrl ?? null,
        name: tokenTemplate.name ?? null,
      });
    }
  };

  // Tells the server my display name (e.g. "Lyra"). Mobile callers wire this
  // up from CharacterProvider so the dashboard shows real names instead of
  // shortened socket ids.
  //
  // Memoized AND deduped: callers (MapViewMobile) put this in a useEffect
  // dep array. Without useCallback, every useSocket re-render minted a new
  // function and refired the effect; without the lastSentNameRef guard,
  // every refire would emit `user-name-update`, which the server broadcast
  // back as `user-name-updated`, which updated otherUsers, which caused the
  // next re-render — a self-sustaining flood (~thousands of events/sec
  // observed in a probe).
  const lastSentNameRef = useRef<string | null | undefined>(undefined);
  const updateMyName = useCallback((name: string | null) => {
    if (lastSentNameRef.current === name) return;
    lastSentNameRef.current = name;
    if (socketRef.current) {
      socketRef.current.emit("user-name-update", { name });
    }
  }, []);

  return {
    myUserId,
    myPersistentUserId: persistentUserIdRef.current,
    myColor,
    myPosition,
    myImageSrc,
    mySize,
    otherUsers,
    disconnectedUsers,
    socket,
    updateMyPosition,
    updateTokenPosition,
    updateTokenImage,
    updateTokenSize,
    removeToken,
    addToken,
    updateMyName,
  };
};

