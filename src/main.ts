import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as compression from 'compression';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SecurityExceptionFilter } from './common/filters/security-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditLogsService } from './modules/audit-logs/audit-logs.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // const app = await NestFactory.create(AppModule);
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Body size limits for JSON and URL-encoded payloads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Security Headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.use(
    compression({
      level: 6, // Compression level (0-9): 6 is good balance of speed and size
      threshold: 1536, // Only compress responses larger than 1.5KB
      filter: (req, res) => {
        // Don't compress if explicitly disabled
        if (req.headers['x-no-compression']) {
          return false;
        }
        // Use compression for all compressible content types
        return compression.filter(req, res);
      },
    }),
  );

  //   Global prefix
  app.setGlobalPrefix('api');

  //   Global Interceptors & Filters
  app.useGlobalInterceptors(new ResponseInterceptor());

  const auditLogsService = app.get(AuditLogsService);
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new SecurityExceptionFilter(auditLogsService),
  );

  //   Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  //  CORS
  const allowlist = [
    'http://localhost:3000',
    'http://localhost:3030',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://app.wecurehealth.com',
    'https://wecurehealth.com',
    'https://www.wecurehealth.com',
    'https://admin.wecurehealth.com',
    ...(process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : []),
  ];

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      // Allow all origins in development mode
      if (process.env.NODE_ENV === 'development') {
        return cb(null, true);
      }

      const isAllowed =
        allowlist.includes(origin) ||
        allowlist.includes('*') ||
        /^https:\/\/([a-zA-Z0-9-]+\.)*wecurehealth\.com$/.test(origin);

      if (isAllowed) {
        return cb(null, true);
      }

      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With',
  });
  app.enableShutdownHooks();

  // Ensure Paystack webhook receives raw body for signature verification
  // The payments webhook route expects a raw application/json body
  // app.use(
  //   '/api/payments/webhook/paystack',
  //   express.raw({ type: 'application/json' }),
  // );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
