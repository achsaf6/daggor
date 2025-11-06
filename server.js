const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('ioredis');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Store connected users (in-memory cache, synced with Redis)
const users = new Map();

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

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  
  // Configure Socket.IO for production
  const ioConfig = {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  };

  // Use Redis adapter if REDIS_URL is provided (for multi-instance scaling)
  if (process.env.REDIS_URL) {
    const pubClient = createClient(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();

    // Wait for both clients to be ready
    await Promise.all([
      new Promise((resolve) => {
        if (pubClient.status === 'ready') {
          resolve();
        } else {
          pubClient.once('ready', resolve);
        }
      }),
      new Promise((resolve) => {
        if (subClient.status === 'ready') {
          resolve();
        } else {
          subClient.once('ready', resolve);
        }
      }),
    ]);

    ioConfig.adapter = createAdapter(pubClient, subClient);
    console.log('Using Redis adapter for Socket.IO');
  }

  const io = new Server(httpServer, ioConfig);

  // Redis client for storing user state (if available)
  let redisClient = null;
  if (process.env.REDIS_URL) {
    redisClient = createClient(process.env.REDIS_URL);
    // Wait for Redis client to be ready
    await new Promise((resolve) => {
      if (redisClient.status === 'ready') {
        resolve();
      } else {
        redisClient.once('ready', resolve);
      }
    });
    console.log('Connected to Redis for user state');

    // Load existing users from Redis on startup
    try {
      const userKeys = await redisClient.keys('user:*');
      for (const key of userKeys) {
        const userData = await redisClient.get(key);
        if (userData) {
          const user = JSON.parse(userData);
          users.set(user.id, user);
        }
      }
      console.log(`Loaded ${users.size} users from Redis`);
    } catch (err) {
      console.error('Error loading users from Redis:', err);
    }
  }

  // Helper function to save user to Redis
  const saveUserToRedis = async (userId, userData) => {
    if (redisClient) {
      try {
        await redisClient.set(`user:${userId}`, JSON.stringify(userData));
      } catch (err) {
        console.error('Error saving user to Redis:', err);
      }
    }
  };

  // Helper function to delete user from Redis
  const deleteUserFromRedis = async (userId) => {
    if (redisClient) {
      try {
        await redisClient.del(`user:${userId}`);
      } catch (err) {
        console.error('Error deleting user from Redis:', err);
      }
    }
  };

  io.on('connection', (socket) => {
    // Generate unique user ID and color
    const userId = socket.id;
    const color = getRandomColor();
    const initialPosition = { x: 50, y: 50 };

    const userData = {
      id: userId,
      color,
      position: initialPosition,
    };

    users.set(userId, userData);
    saveUserToRedis(userId, userData);

    // Send current user their info and all existing users
    socket.emit('user-connected', {
      userId,
      color,
      position: initialPosition,
    });

    socket.emit('all-users', Array.from(users.values()));

    // Broadcast new user to all other clients
    socket.broadcast.emit('user-joined', {
      userId,
      color,
      position: initialPosition,
    });

    // Handle position updates
    socket.on('position-update', (position) => {
      const user = users.get(userId);
      if (user) {
        user.position = position;
        saveUserToRedis(userId, user);
        // Broadcast to all other clients (Redis adapter handles cross-instance broadcasting)
        socket.broadcast.emit('user-moved', {
          userId,
          position,
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      users.delete(userId);
      deleteUserFromRedis(userId);
      // Broadcast to all other clients (Redis adapter handles cross-instance broadcasting)
      socket.broadcast.emit('user-left', { userId });
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

