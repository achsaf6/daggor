require('dotenv').config();

const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

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

      userData = {
        id: userId,
        persistentUserId: persistentUserId || userId, // Use persistent ID if available
        color,
        position,
        isDisplay: data?.isDisplay || false, // Track if this is a display mode user
      };

      users.set(userId, userData);

      // Send current user their info and all existing users (including disconnected)
      socket.emit('user-connected', {
        userId,
        persistentUserId: userData.persistentUserId,
        color,
        position,
      });

      // Send all active users
      socket.emit('all-users', Array.from(users.values()));

      // Send disconnected users (for display mode users to track)
      const disconnectedUsersList = Array.from(disconnectedUsers.values());
      if (disconnectedUsersList.length > 0) {
        socket.emit('disconnected-users', disconnectedUsersList);
      }

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
    socket.on('position-update', (position) => {
      const user = users.get(userId);
      if (user) {
        user.position = position;
        // Broadcast to all other clients
        socket.broadcast.emit('user-moved', {
          userId,
          position,
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = users.get(userId);
      if (user) {
        // Don't delete - move to disconnected users (in-memory)
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

        // Broadcast to all other clients
        socket.broadcast.emit('user-disconnected', {
          userId,
          persistentUserId: persistentId,
        });
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


