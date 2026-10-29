import { CacheModuleOptions } from '@nestjs/cache-manager';

/**
 * Cache TTL configurations (in seconds)
 */
export const CACHE_TTL = {
  // Frequently accessed, rarely changing data
  SPECIALISTS: 1800, // 30 minutes
  LEGAL_CONTENT: 3600, // 1 hour

  // Moderate frequency, some changes
  POPULAR_DOCTORS: 900, // 15 minutes
  WELLNESS_TIPS: 900, // 15 minutes

  // Frequently changing data
  DOCTOR_PROFILE: 3600, // 1 hour
  DOCTOR_BY_SPECIALTY: 900, // 15 minutes

  // Default fallback
  DEFAULT: 300, // 5 minutes
} as const;

/**
 * Cache configuration factory
 * Uses in-memory cache for development, can be configured for Redis in production
 */
export const cacheConfig = (): CacheModuleOptions => {
  const cacheStore = process.env.CACHE_STORE || 'memory';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Base configuration
  const baseConfig: CacheModuleOptions & { enabled?: boolean } = {
    ttl:
      parseInt(process.env.REDIS_TTL || String(CACHE_TTL.DEFAULT), 10) * 1000, // Convert to ms
    max: 100, // Maximum number of items in cache
    isGlobal: true, // Make cache available globally
    enabled: !isDevelopment || process.env.ENABLE_CACHE === 'true',
  };

  // If cache is disabled, return a config that effectively disables it
  // or that can be checked by services/interceptors
  if (!baseConfig.enabled) {
    return {
      ...baseConfig,
      ttl: 1, // 1ms TTL
      max: 0, // 0 items
    };
  }

  // For production with Redis (when implemented)
  if (cacheStore === 'redis' && !isDevelopment) {
    // TODO: Implement Redis store configuration when needed
    // const redisStore = require('cache-manager-ioredis');
    // return {
    //   ...baseConfig,
    //   store: redisStore,
    //   host: process.env.REDIS_HOST,
    //   port: parseInt(process.env.REDIS_PORT || '6379'),
    //   password: process.env.REDIS_PASSWORD,
    //   db: 0,
    // };
  }

  // Default: in-memory cache (works for single-instance deployments)
  return baseConfig;
};

/**
 * Generate cache key for consistent cache lookups
 */
export const generateCacheKey = (
  prefix: string,
  params: Record<string, any>,
): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${params[key]}`)
    .join(':');

  return sortedParams ? `${prefix}:${sortedParams}` : prefix;
};
