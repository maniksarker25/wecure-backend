import { CacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { awsConfig } from 'src/config/aws.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { appConfig } from './config/app.config';
import { cacheConfig } from './config/cache.config';
import { databaseConfig } from './config/database.config';
import { throttlerConfig } from './config/throttler.config';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuditLogsService } from './modules/audit-logs/audit-logs.service';
import { DomainModule } from './modules/domain.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadsModule } from './modules/uploads/uploads.module';
// changes

const logger = new Logger('Database');
const cacheLogger = new Logger('Cache');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, awsConfig, appConfig],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        ...databaseConfig(),
        connectionFactory: (connection) => {
          if (connection.readyState === 1) {
            logger.log('Database started successfully🚀');
          }

          connection.on('connected', () => {
            logger.log('Database started successfully🚀');
          });

          connection.on('error', (error) => {
            logger.error(`Database connection error: ${error.message}`);
          });

          return connection;
        },
      }),
    }),
    // Cache Module with graceful degradation
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async () => {
        try {
          const config = cacheConfig();
          cacheLogger.log('Cache module initialized successfully');
          return config;
        } catch (error) {
          cacheLogger.warn(
            `Cache initialization failed: ${error.message}. Application will continue without caching.`,
          );
          // Return minimal config as fallback
          return {
            ttl: 300000, // 5 minutes in ms
            max: 10,
            isGlobal: true,
          };
        }
      },
    }),
    DomainModule,
    AuditLogsModule,
    CommonModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    NotificationsModule,
    ThrottlerModule.forRoot(throttlerConfig()),
    UploadsModule.registerAsync({
      imports: [ConfigModule, AuditLogsModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        aws: {
          region: configService.get<string>('aws.region')!,
          accessKeyId: configService.get<string>('aws.accessKeyId')!,
          secretAccessKey: configService.get<string>('aws.secretAccessKey')!,
          bucketName: configService.get<string>('aws.s3.bucketName')!,
        },
        signedUrlExpireSeconds:
          configService.get<number>('aws.s3.signedUrlExpireSeconds') ?? 300,
      }),
      logger: {
        useExisting: AuditLogsService,
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
