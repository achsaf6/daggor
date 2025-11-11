import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Store connected users (in-memory)
const users = new Map();
// Store disconnected users temporarily to restore on reconnect (in-memory)
const disconnectedUsers = new Map();

// Generate random color
function getRandomColor() {
  const colors = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

app.prepare().then(() => {
  // Create HTTP server with Next.js handler
  const httpServer = createServer(handler);
  
  // Create Socket.IO server
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    const userId = socket.id;
    let userData = null;
    let identificationReceived = false;

    // Function to initialize user
    const initializeUser = (data) => {
      if (identificationReceived) return; // Prevent double initialization
      identificationReceived = true;

      const persistentUserId = data?.persistentUserId || null;
      let restoredUserData = null;

      // Check if this user was previously disconnected (in-memory only)
      if (persistentUserId) {
        const disconnectedUser = disconnectedUsers.get(persistentUserId);
        if (disconnectedUser) {
          restoredUserData = disconnectedUser;
          disconnectedUsers.delete(persistentUserId);
        }
      }

      // Use restored data or create new user
      const color = restoredUserData?.color || getRandomColor();
      const position = restoredUserData?.position || { x: 50, y: 50 };

      const isDisplay = data?.isDisplay || false;

      userData = {
        id: userId,
        persistentUserId: persistentUserId || userId, // Use persistent ID if available
        color,
        position,
        isDisplay, // Track if this is a display mode user
      };

      // Only add to users Map if NOT in display mode
      // Display mode users should not be visible to other users
      if (!isDisplay) {
        users.set(userId, userData);
      }

      // Send current user their info and all existing users (including disconnected)
      // Display mode users still receive their own info, but won't be added to the users list
      socket.emit('user-connected', {
        userId,
        persistentUserId: userData.persistentUserId,
        color,
        position,
      });

      // Send all active users (excluding display mode users)
      // Filter out any display mode users that might have been added
      const activeUsersList = Array.from(users.values()).filter(user => !user.isDisplay);
      socket.emit('all-users', activeUsersList);

      // Send disconnected users (for display mode users to track)
      const disconnectedUsersList = Array.from(disconnectedUsers.values());
      if (disconnectedUsersList.length > 0) {
        socket.emit('disconnected-users', disconnectedUsersList);
      }

      // Only broadcast new user to all other clients if NOT in display mode
      // Display mode users should not be visible to other users
      if (!isDisplay) {
        // Broadcast new user to all other clients (only if not a restoration)
        if (!restoredUserData) {
          socket.broadcast.emit('user-joined', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
          });
        } else {
          // User reconnected - broadcast reconnection
          socket.broadcast.emit('user-reconnected', {
            userId,
            persistentUserId: userData.persistentUserId,
            color,
            position,
          });
        }
      }
    };

    // Listen for user identification
    socket.once('user-identify', initializeUser);

    // If client doesn't send identification within 1 second, proceed with new user
    setTimeout(() => {
      if (!identificationReceived) {
        initializeUser({});
      }
    }, 1000);

    // Handle position updates
    socket.on('position-update', (data) => {
      // Support both old format (just position) and new format (tokenId + position)
      let targetUserId = userId;
      let position;
      
      if (data && typeof data === 'object' && data.tokenId && data.position) {
        // New format: { tokenId, position }
        targetUserId = data.tokenId;
        position = data.position;
      } else {
        // Old format: just position (backward compatibility)
        position = data;
      }

      // Find the target user (could be the sender or any other user)
      const targetUser = users.get(targetUserId);
      if (targetUser) {
        targetUser.position = position;
        // Broadcast to all clients (including sender) so everyone sees the update
        io.emit('user-moved', {
          userId: targetUserId,
          position,
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = users.get(userId);
      if (user) {
        // Don't delete - move to disconnected users (in-memory)
        // Only do this for non-display users (display users are never in the users Map)
        const persistentId = user.persistentUserId || userId;
        const disconnectedUserData = {
          id: persistentId, // Use persistent ID for disconnected users
          persistentUserId: persistentId,
          color: user.color,
          position: user.position,
          disconnectedAt: Date.now(),
        };

        disconnectedUsers.set(persistentId, disconnectedUserData);
        users.delete(userId);

        // Broadcast to all other clients with color and position
        socket.broadcast.emit('user-disconnected', {
          userId,
          persistentUserId: persistentId,
          color: user.color,
          position: user.position,
        });
      }
      // Display mode users are silently disconnected (they were never in the users Map)
    });

    // Handle token removal (only from display mode users)
    socket.on('remove-token', (data) => {
      const user = users.get(userId);
      if (user && user.isDisplay && data.persistentUserId) {
        // Remove from disconnected users
        if (disconnectedUsers.has(data.persistentUserId)) {
          disconnectedUsers.delete(data.persistentUserId);
        }
        // Also check active users (in case they're still connected)
        for (const [activeUserId, activeUser] of users.entries()) {
          if (activeUser.persistentUserId === data.persistentUserId) {
            users.delete(activeUserId);
            // Notify the user being removed if they're still connected
            const targetSocket = io.sockets.sockets.get(activeUserId);
            if (targetSocket) {
              targetSocket.emit('token-removed', { persistentUserId: data.persistentUserId });
            }
            break;
          }
        }
        // Broadcast removal to all clients
        io.emit('token-removed', { persistentUserId: data.persistentUserId });
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});


