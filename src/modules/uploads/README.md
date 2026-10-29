# Reusable Uploads Module

This module handles file uploads to AWS S3 (Private Bucket) with support for image optimization (Sharp), presigned URLs, and audit logging. It is designed to be drop-in compatible with any NestJS project.

## 1. Installation

Install the required dependencies in your target project:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp
npm install -D @types/multer
```

## 2. Setup

Import the `UploadsModule` in your root `AppModule` using `registerAsync`. You must provide the AWS configuration and optionally an audit logger.

### `app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MyLoggerService } from './my-logger.service'; // Your custom logger

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Register the module
    UploadsModule.registerAsync({
      imports: [ConfigModule, LoggerModule], // Import modules needed for dependencies
      inject: [ConfigService, MyLoggerService],
      useFactory: (config: ConfigService) => ({
        aws: {
          region: config.get('AWS_REGION'),
          accessKeyId: config.get('AWS_ACCESS_KEY_ID'),
          secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY'),
          bucketName: config.get('AWS_S3_BUCKET'),
        },
        signedUrlExpireSeconds: 300, // Optional: defaults to 300s
      }),
      // Optional: Connect your own logger
      logger: {
        useExisting: MyLoggerService,
      },
    }),
  ],
})
export class AppModule {}
```

## 3. Implementing the Logger (Optional)

If you want to track file uploads and views, your logger service must implement the `IUploadAuditLogger` interface.

```typescript
import { Injectable } from '@nestjs/common';
import { IUploadAuditLogger } from './modules/uploads/interfaces/uploads-options.interface';

@Injectable()
export class MyLoggerService implements IUploadAuditLogger {
  logUpload(userId: string, fileKey: string): void {
    console.log(`User ${userId} uploaded ${fileKey}`);
    // Save to database...
  }

  logView(userId: string, fileKey: string): void {
    console.log(`User ${userId} viewed ${fileKey}`);
    // Save to database...
  }
}
```

## 4. Usage

Inject `PrivateUploadService` to handle file uploads and streaming.

```typescript
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Res,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrivateUploadService } from '../modules/uploads/private-upload.service';
import { Response } from 'express';

@Controller('files')
export class FilesController {
  constructor(private readonly uploadService: PrivateUploadService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
    // 1. Upload file (auto-converts images to WebP)
    const fileKey = await this.uploadService.handleUpload(
      file,
      'general', // folder name
      req.user.id, // Optional: Pass userId for logging
    );

    return { fileKey };
  }

  @Get('stream/*key')
  async streamFile(@Param('key') key: string, @Res() res: Response) {
    // 2. Stream file securely
    const { stream, contentType } = await this.uploadService.streamFile(key);
    res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  }
}
```

## Features

- **Private by Default**: Files are stored in a private S3 bucket.
- **Auto-Optimization**: Images are automatically resized (max 1280x720) and converted to WebP.
- **Streaming**: Securely stream files without exposing public S3 URLs.
- **Audit Logging**: Interface to hook into your system's logging.
