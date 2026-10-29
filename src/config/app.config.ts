import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  url: process.env.APP_URL || 'http://localhost:3000',
}));
