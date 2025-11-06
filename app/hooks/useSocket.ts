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

export const useSocket = (): UseSocketReturn => {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#ef4444");
  const [myPosition, setMyPosition] = useState<Position>({ x: 50, y: 50 });
  const [otherUsers, setOtherUsers] = useState<Map<string, User>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
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

    // Handle user leaving
    socket.on("user-left", (data: { userId: string }) => {
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        updated.delete(data.userId);
        return updated;
      });
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

