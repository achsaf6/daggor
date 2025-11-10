import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { User, Position } from "../types";

interface UseSocketReturn {
  myUserId: string | null;
  myColor: string;
  myPosition: Position;
  otherUsers: Map<string, User>;
  socket: Socket | null;
  updateMyPosition: (position: Position) => void;
}

export const useSocket = (isDisplay: boolean = false): UseSocketReturn => {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#ef4444");
  const [myPosition, setMyPosition] = useState<Position>({ x: 50, y: 50 });
  const [otherUsers, setOtherUsers] = useState<Map<string, User>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const persistentUserIdRef = useRef<string | null>(null);

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

    const socket = io(getWebSocketUrl(), {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    // Handle connection
    socket.on("connect", () => {
      console.log("Connected to server");
      // Send user identification immediately after connection
      socket.emit("user-identify", {
        persistentUserId: persistentUserIdRef.current,
        isDisplay: isDisplay,
      });
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
      if (reason === "io server disconnect") {
        // Server initiated disconnect, client needs to manually reconnect
        socket.connect();
      }
    });

    // Handle reconnection attempts
    socket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
    });

    // Handle successful reconnection
    socket.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected to server after ${attemptNumber} attempts`);
    });

    // Handle reconnection errors
    socket.on("reconnect_error", (error) => {
      console.error("Reconnection error:", error);
    });

    // Handle failed reconnection (all attempts exhausted)
    socket.on("reconnect_failed", () => {
      console.error("Failed to reconnect to server after all attempts");
    });

    // Receive user info (my own ID and color)
    socket.on(
      "user-connected",
      (data: {
        userId: string;
        color: string;
        position: { x: number; y: number };
      }) => {
        setMyUserId(data.userId);
        setMyColor(data.color);
        setMyPosition(data.position);
      }
    );

    // Receive all existing users
    socket.on("all-users", (users: User[]) => {
      const usersMap = new Map<string, User>();
      const currentMyUserId = socket.id;
      users.forEach((user) => {
        if (user.id !== currentMyUserId) {
          usersMap.set(user.id, user);
        }
      });
      setOtherUsers(usersMap);
    });

    // Handle new user joining
    socket.on(
      "user-joined",
      (data: { userId: string; color: string; position: { x: number; y: number } }) => {
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          updated.set(data.userId, {
            id: data.userId,
            color: data.color,
            position: data.position,
          });
          return updated;
        });
      }
    );

    // Handle user position update
    socket.on(
      "user-moved",
      (data: { userId: string; position: { x: number; y: number } }) => {
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
      }
    );

    // Handle user leaving (deprecated - now using user-disconnected)
    socket.on("user-left", (data: { userId: string }) => {
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        updated.delete(data.userId);
        return updated;
      });
    });

    // Handle user disconnecting (moved to disconnected state)
    socket.on("user-disconnected", (data: { userId: string; persistentUserId: string }) => {
      // Remove from active users, but keep in disconnected state (server handles this)
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        updated.delete(data.userId);
        return updated;
      });
    });

    // Handle user reconnecting
    socket.on(
      "user-reconnected",
      (data: {
        userId: string;
        persistentUserId: string;
        color: string;
        position: { x: number; y: number };
      }) => {
        setOtherUsers((prev) => {
          const updated = new Map(prev);
          updated.set(data.userId, {
            id: data.userId,
            color: data.color,
            position: data.position,
          });
          return updated;
        });
      }
    );

    // Handle disconnected users list (for display mode users to track)
    socket.on("disconnected-users", (disconnectedUsers: User[]) => {
      // Display mode users can track disconnected users if needed
      // For now, we'll just log them
      if (isDisplay) {
        console.log("Disconnected users:", disconnectedUsers);
      }
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const updateMyPosition = (position: Position) => {
    setMyPosition(position);
    if (socketRef.current) {
      socketRef.current.emit("position-update", position);
    }
  };

  return {
    myUserId,
    myColor,
    myPosition,
    otherUsers,
    socket: socketRef.current,
    updateMyPosition,
  };
};

