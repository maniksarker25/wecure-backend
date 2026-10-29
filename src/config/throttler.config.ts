import { ThrottlerModuleOptions } from '@nestjs/throttler';

export const throttlerConfig = (): ThrottlerModuleOptions => ({
  throttlers: [
    {
      name: 'default',
      ttl: 60000, // 1 minute in milliseconds
      limit: 100, // 100 requests per minute
    },
  ],
});
