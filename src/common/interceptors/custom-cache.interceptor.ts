import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Custom cache interceptor with fine-grained control and error handling
 * Provides caching with graceful degradation - never breaks requests
 */
@Injectable()
export class CustomCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CustomCacheInterceptor.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Skip caching in development unless explicitly enabled
    const isDevelopment = process.env.NODE_ENV === 'development';
    const cacheEnabled = process.env.ENABLE_CACHE === 'true';

    if (isDevelopment && !cacheEnabled) {
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(request);

    // Try to get from cache
    try {
      const cachedResponse = await this.cacheManager.get(cacheKey);
      if (cachedResponse) {
        this.logger.debug(`Cache HIT: ${cacheKey}`);

        // Add header to identify cache hit
        const response = context.switchToHttp().getResponse();
        response.setHeader('X-Cache', 'HIT');
        // Tell browser it can cache this for 5 minutes too
        response.setHeader('Cache-Control', 'public, max-age=300');

        return of(cachedResponse);
      }
      this.logger.debug(`Cache MISS: ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Cache read failed for ${cacheKey}: ${error.message}`);
    }

    // No cache, execute request
    return next.handle().pipe(
      tap(async (data) => {
        // Add header for cache miss
        const response = context.switchToHttp().getResponse();
        response.setHeader('X-Cache', 'MISS');

        try {
          await this.cacheManager.set(cacheKey, data, 300000);
          this.logger.debug(`Cache SET: ${cacheKey}`);
        } catch (error) {
          this.logger.warn(`Cache write failed: ${error.message}`);
        }
      }),
    );
  }

  /**
   * Generate cache key from request URL and query parameters
   */
  private generateCacheKey(request: any): string {
    const url = request.url;
    const queryParams = new URLSearchParams(request.query).toString();
    return queryParams ? `${url}?${queryParams}` : url;
  }
}
