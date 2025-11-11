import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { User, Position } from "../types";

interface UserWithPersistentId extends User {
  persistentUserId?: string;
}

interface UseSocketReturn {
  myUserId: string | null;
  myColor: string;
  myPosition: Position;
  otherUsers: Map<string, User>;
  disconnectedUsers: Map<string, User>;
  socket: Socket | null;
  updateMyPosition: (position: Position) => void;
  updateTokenPosition: (tokenId: string, position: Position) => void;
  removeToken: (persistentUserId: string) => void;
  addToken: (color: string, position?: Position) => void;
}

export const useSocket = (isDisplay: boolean = false): UseSocketReturn => {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#ef4444");
  const [myPosition, setMyPosition] = useState<Position>({ x: 50, y: 50 });
  const [otherUsers, setOtherUsers] = useState<Map<string, User>>(new Map());
  const [disconnectedUsers, setDisconnectedUsers] = useState<Map<string, User>>(new Map());
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const persistentUserIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Get or create persistent user ID from localStorage
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

    // Handle connection
    socketInstance.on("connect", () => {
      console.log("Connected to server");
      // Send user identification immediately after connection
      socketInstance.emit("user-identify", {
        persistentUserId: persistentUserIdRef.current,
        isDisplay: isDisplay,
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
      }) => {
        setMyUserId(data.userId);
        myUserIdRef.current = data.userId;
        setMyColor(data.color);
        setMyPosition(data.position);
      }
    );

    // Receive all existing users
    socketInstance.on("all-users", (users: UserWithPersistentId[]) => {
      const usersMap = new Map<string, User>();
      const currentMyUserId = socketInstance.id;
      users.forEach((user) => {
        if (user.id !== currentMyUserId) {
          // Preserve persistentUserId if it exists
          const userData: UserWithPersistentId = {
            id: user.id,
            color: user.color,
            position: user.position,
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
      (data: { userId: string; persistentUserId?: string; color: string; position: { x: number; y: number } }) => {
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          const userData: UserWithPersistentId = {
            id: data.userId,
            color: data.color,
            position: data.position,
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
    socketInstance.on("user-disconnected", (data: { userId: string; persistentUserId: string; color: string; position: { x: number; y: number } }) => {
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
            persistentUserId: data.persistentUserId,
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
    socketInstance.on("disconnected-users", (disconnectedUsersList: User[]) => {
      // Store disconnected users so their tokens remain visible
      const disconnectedMap = new Map<string, User>();
      disconnectedUsersList.forEach((user) => {
        disconnectedMap.set(user.id, user);
      });
      setDisconnectedUsers(disconnectedMap);
    });

    // Handle new token added
    socketInstance.on(
      "token-added",
      (data: { userId: string; persistentUserId: string; color: string; position: { x: number; y: number } }) => {
        const userData: UserWithPersistentId = {
          id: data.userId,
          color: data.color,
          position: data.position,
          persistentUserId: data.persistentUserId,
        };
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          updated.set(data.userId, userData);
          return updated;
        });
      }
    );

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, [isDisplay]);

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
    }
    
    // Send update to server
    if (socketRef.current) {
      socketRef.current.emit("position-update", {
        tokenId,
        position,
      });
    }
  };

  const removeToken = (persistentUserId: string) => {
    if (socketRef.current && isDisplay) {
      socketRef.current.emit("remove-token", { persistentUserId });
    }
  };

  const addToken = (color: string, position: Position = { x: 50, y: 50 }) => {
    if (socketRef.current) {
      socketRef.current.emit("add-token", { color, position });
    }
  };

  return {
    myUserId,
    myColor,
    myPosition,
    otherUsers,
    disconnectedUsers,
    socket,
    updateMyPosition,
    updateTokenPosition,
    removeToken,
    addToken,
  };
};

