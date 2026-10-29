import { MongooseModuleOptions } from '@nestjs/mongoose';

export const databaseConfig = (): MongooseModuleOptions => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    uri: process.env.MONGODB_URI,
    autoIndex: false, // important for production

    // Connection pooling for optimal performance
    minPoolSize: parseInt(process.env.DB_POOL_MIN || '5', 10),
    maxPoolSize: parseInt(process.env.DB_POOL_MAX || '50', 10),

    // Timeout settings to prevent hanging connections
    serverSelectionTimeoutMS: 30000, // 30s - fast failure if DB unavailable
    socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000', 10), // 45s

    // Retry logic for transient failures
    retryAttempts: 5,
    retryDelay: 3000,

    // Connection management
    maxIdleTimeMS: 60000, // Close idle connections after 1 minute
    waitQueueTimeoutMS: 10000, // Wait max 10s for available connection from pool

    // Query logging (development only)
    ...(isDevelopment && {
      autoCreate: true, // Auto-create collections in dev
    }),
  };
};
