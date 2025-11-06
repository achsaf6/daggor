"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";

interface User {
  id: string;
  color: string;
  position: { x: number; y: number };
}

interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  containerLeft: number;
  containerTop: number;
  containerWidth: number;
  containerHeight: number;
}

export default function Home() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#ef4444");
  const [myPosition, setMyPosition] = useState({ x: 50, y: 50 });
  const [otherUsers, setOtherUsers] = useState<Map<string, User>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null);

  // Calculate image bounds based on object-contain
  const calculateImageBounds = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    // Find the actual img element rendered by Next.js Image
    const img = container.querySelector("img") as HTMLImageElement;
    if (!img) return;
    
    const containerRect = container.getBoundingClientRect();
    const containerAspect = containerRect.width / containerRect.height;
    
    // Get natural image dimensions
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    
    // If image hasn't loaded yet, wait
    if (naturalWidth === 0 || naturalHeight === 0) return;
    
    const imageAspect = naturalWidth / naturalHeight;

    let renderedWidth: number;
    let renderedHeight: number;
    let left: number;
    let top: number;

    if (containerAspect > imageAspect) {
      // Container is wider - image height fills container
      renderedHeight = containerRect.height;
      renderedWidth = renderedHeight * imageAspect;
      left = (containerRect.width - renderedWidth) / 2;
      top = 0;
    } else {
      // Container is taller - image width fills container
      renderedWidth = containerRect.width;
      renderedHeight = renderedWidth / imageAspect;
      left = 0;
      top = (containerRect.height - renderedHeight) / 2;
    }

    setImageBounds({
      left: containerRect.left + left,
      top: containerRect.top + top,
      width: renderedWidth,
      height: renderedHeight,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
    });
  };

  useEffect(() => {
    // Calculate image bounds on mount and resize
    // Use a small delay to ensure image is rendered
    const timeoutId = setTimeout(calculateImageBounds, 100);
    
    const handleResize = () => {
      calculateImageBounds();
    };

    window.addEventListener("resize", handleResize);
    
    // Also recalculate after image loads
    const img = containerRef.current?.querySelector("img");
    if (img) {
      if (img.complete) {
        calculateImageBounds();
      } else {
        img.addEventListener("load", calculateImageBounds);
      }
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      if (img) {
        img.removeEventListener("load", calculateImageBounds);
      }
    };
  }, []);

  useEffect(() => {
    // Connect to WebSocket server
    // In production, use the same origin if NEXT_PUBLIC_WS_URL is not set
    const getWebSocketUrl = () => {
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
      }
      if (typeof window !== 'undefined') {
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
    socket.on("user-connected", (data: { userId: string; color: string; position: { x: number; y: number } }) => {
      setMyUserId(data.userId);
      setMyColor(data.color);
      setMyPosition(data.position);
    });

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
    socket.on("user-joined", (data: { userId: string; color: string; position: { x: number; y: number } }) => {
      setOtherUsers((prev) => {
        const updated = new Map(prev);
        updated.set(data.userId, {
          id: data.userId,
          color: data.color,
          position: data.position,
        });
        return updated;
      });
    });

    // Handle user position update
    socket.on("user-moved", (data: { userId: string; position: { x: number; y: number } }) => {
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
    });

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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageBounds) return;

    // Convert mouse coordinates to image-relative percentages
    const x = Math.max(0, Math.min(100, ((e.clientX - imageBounds.left) / imageBounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - imageBounds.top) / imageBounds.height) * 100));

    const newPosition = { x, y };
    setMyPosition(newPosition);

    // Send position update to server
    if (socketRef.current) {
      socketRef.current.emit("position-update", newPosition);
    }
  };

  // Convert image-relative percentage to viewport coordinates
  const getViewportPosition = (position: { x: number; y: number }) => {
    if (!imageBounds) {
      return { x: 0, y: 0 };
    }

    const x = imageBounds.left + (position.x / 100) * imageBounds.width;
    const y = imageBounds.top + (position.y / 100) * imageBounds.height;

    return {
      x: ((x - imageBounds.containerLeft) / imageBounds.containerWidth) * 100,
      y: ((y - imageBounds.containerTop) / imageBounds.containerHeight) * 100,
    };
  };

  // Calculate circle size as percentage of image width (for consistent scaling)
  const getCircleSizePercent = () => {
    // Return as percentage of image width (e.g., 2% of image width)
    return 5; // 2% of image width
  };

  // Convert image-relative size to viewport size percentage
  const getViewportSize = (imageSizePercent: number) => {
    if (!imageBounds) {
      return 0;
    }
    // Convert percentage of image width to pixels, then to viewport percentage
    const sizeInPixels = (imageSizePercent / 100) * imageBounds.width;
    return (sizeInPixels / imageBounds.containerWidth) * 100;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 m-0 p-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <Image
        src="/maps/city-assault-30-x-50-phased-v0-87llyi5jgauf1.png"
        alt="City Assault Map"
        fill
        className="object-contain"
        priority
        onLoad={calculateImageBounds}
      />
      {/* My circle */}
      {imageBounds && (
        <div
          className="absolute rounded-full border-2 border-white shadow-lg cursor-move z-10"
          style={{
            left: `${getViewportPosition(myPosition).x}%`,
            top: `${getViewportPosition(myPosition).y}%`,
            width: `${getViewportSize(getCircleSizePercent())}%`,
            aspectRatio: "1 / 1",
            transform: "translate(-50%, -50%)",
            backgroundColor: myColor,
          }}
          onMouseDown={handleMouseDown}
        />
      )}
      {/* Other users' circles */}
      {imageBounds &&
        Array.from(otherUsers.values()).map((user) => {
          const viewportPos = getViewportPosition(user.position);
          const circleSize = getViewportSize(getCircleSizePercent());
          return (
            <div
              key={user.id}
              className="absolute rounded-full border-2 border-white shadow-lg z-10"
              style={{
                left: `${viewportPos.x}%`,
                top: `${viewportPos.y}%`,
                width: `${circleSize}%`,
                aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)",
                backgroundColor: user.color,
              }}
            />
          );
        })}
    </div>
  );
}
