import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Param,
  Res,
} from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PrivateUploadService } from './private-upload.service';
import { Response } from 'express';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly privateUploadService: PrivateUploadService,
  ) {}

  /**
   * Request presigned upload URL
   */
  @Post('presign')
  async createPresignedUploadUrl(
    @Body()
    body: {
      mimeType: string;
      folder: 'appointments' | 'verifications' | 'profiles' | 'support';
    },
  ) {
    try {
      const result = await this.uploadsService.generateUploadUrl(
        body.mimeType,
        body.folder,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Presigned URL generated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to generate presigned URL',
        data: null,
      };
    }
  }

  /**
   * Request presigned view/download URL
   */
  @Get('view')
  async getPresignedViewUrl(@Query('key') key: string) {
    try {
      const url = await this.uploadsService.generateViewUrl(key);
      return {
        success: true,
        statusCode: 200,
        message: 'File view URL generated successfully',
        data: { url },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to generate file view URL',
        data: null,
      };
    }
  }

  /**
   * Stream file from private bucket
   * Usage: GET /uploads/stream/appointments/xyz-123.pdf
   */
  @Get('stream/*key')
  async streamFile(@Param('key') key: string, @Res() res: Response) {
    try {
      const { stream, contentType } =
        await this.privateUploadService.streamFile(key);
      res.setHeader('Content-Type', contentType);
      stream.pipe(res);
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to stream file',
      });
    }
  }
}
