import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  UploadsModuleOptions,
  IUploadAuditLogger,
  UPLOADS_OPTIONS_TOKEN,
  UPLOAD_LOGGER_TOKEN,
} from './interfaces/uploads-options.interface';

@Injectable()
export class PrivateUploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(UPLOADS_OPTIONS_TOKEN)
    private readonly options: UploadsModuleOptions,
    @Optional()
    @Inject(UPLOAD_LOGGER_TOKEN)
    private readonly auditLogger: IUploadAuditLogger,
  ) {
    this.s3 = new S3Client({
      region: this.options.aws.region,
      credentials: {
        accessKeyId: this.options.aws.accessKeyId,
        secretAccessKey: this.options.aws.secretAccessKey,
      },
    });
    this.bucket = this.options.aws.bucketName;
  }

  /**
   * Upload a single file to private S3 bucket.
   * Returns the file key.
   */
  async handleUpload(
    file: Express.Multer.File,
    folder: 'appointments' | 'verifications' | 'profiles' | 'support',
    userId?: string,
  ): Promise<string> {
    if (!file) throw new BadRequestException('No file received');
    if (!file.buffer) throw new BadRequestException('No file buffer received');

    try {
      const isImage =
        file.mimetype.startsWith('image/') && !file.mimetype.includes('svg');
      let finalBuffer = file.buffer;
      let finalExtension = this.safeExt(file.originalname);
      let contentType = file.mimetype;

      if (isImage) {
        // Resize and compress image
        finalBuffer = await sharp(file.buffer)
          .resize(1280, 720, {
            fit: 'inside', // Maintain aspect ratio, do not exceed dimensions
            withoutEnlargement: true, // Do not upscale smaller images
          })
          .webp({ quality: 80 }) // Convert to WebP for better compression
          .toBuffer();
        finalExtension = '.webp';
        contentType = 'image/webp';
      }

      const key = `${folder}/${this.uniqueName(finalExtension)}`;

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: finalBuffer,
          ContentType: contentType,
        }),
      );

      if (userId && this.auditLogger) {
        this.auditLogger.logUpload(userId, key);
      }

      return key;
    } catch (err: any) {
      console.error('PrivateUploadService Error:', err);
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  /**
   * Stream file from private S3 bucket.
   */
  async streamFile(
    fileKey: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    try {
      // Check if file exists and get metadata
      const headParams = {
        Bucket: this.bucket,
        Key: fileKey,
      };
      const headCommand = new HeadObjectCommand(headParams);
      const headOutput = await this.s3.send(headCommand);

      // Get file stream
      const getParams = {
        Bucket: this.bucket,
        Key: fileKey,
      };
      const getCommand = new GetObjectCommand(getParams);
      const response = await this.s3.send(getCommand);

      if (!response.Body) {
        throw new InternalServerErrorException('File body is empty');
      }

      return {
        stream: response.Body as Readable,
        contentType: headOutput.ContentType || 'application/octet-stream',
      };
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException('File not found');
      }
      console.error('Stream File Error:', error);
      throw new InternalServerErrorException('Failed to stream file');
    }
  }

  // Helpers
  private uniqueName(ext: string) {
    const id = randomUUID();
    return `${id}${ext}`;
  }

  private safeExt(original: string) {
    const raw = (path.extname(original) || '').toLowerCase();
    if (!raw) return '.bin';
    if (!raw.match(/^\.(jpg|jpeg|png|gif|webp|pdf|txt|csv|mp4|mp3|bin)$/)) {
      return '.bin';
    }
    return raw;
  }
}
