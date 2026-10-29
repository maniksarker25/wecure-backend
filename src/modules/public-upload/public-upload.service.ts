import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';

@Injectable()
export class PublicUploadService {
  private readonly s3: S3Client;
  private readonly s3Bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(private readonly config: ConfigService) {
    this.publicBaseUrl =
      this.config.get<string>('aws.public.baseUrl') ?? undefined;

    this.s3 = new S3Client({
      region: this.config.get<string>('aws.public.region')!,
      credentials: {
        accessKeyId: this.config.get<string>('aws.public.accessKeyId')!,
        secretAccessKey: this.config.get<string>('aws.public.secretAccessKey')!,
      },
    });
    this.s3Bucket = this.config.get<string>('aws.public.bucketName')!;
  }

  /**
   * Upload a single file that arrived via Multer.
   * For S3: uploads buffer to S3 and returns a public URL or key-based URL.
   */
  async handleUpload(
    file: Express.Multer.File,
    folder: string = UPLOAD_FOLDERS.OTHERS,
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

      // S3 mode: upload buffer to S3
      const key = `${folder}/${this.uniqueName(finalExtension)}`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: finalBuffer,
          ContentType: contentType,
        }),
      );
      return this.publicUrlForKey(key);
    } catch (err: any) {
      // Log the actual error for debugging
      console.error('PublicUploadService Error:', err);
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  /**
   * Delete a file by URL or key (S3).
   * Accepts:
   *  - S3: full https URL or a key like "uploads/xyz.jpg"
   */
  async deleteFile(fileIdentifier: string): Promise<void> {
    if (!fileIdentifier) return;

    try {
      const key = this.extractS3Key(fileIdentifier);
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
        }),
      );
    } catch (err: any) {
      // Ignore not-found deletes; otherwise surface a generic error
      if (err?.name === 'NoSuchKey') return;
      throw new InternalServerErrorException('File deletion failed');
    }
  }

  // Helpers
  private uniqueName(ext: string) {
    const id = randomUUID();
    return `${id}${ext}`;
  }

  private safeExt(original: string) {
    // Keep lowercased ext and restrict to a sensible set; fallback to .bin
    const raw = (path.extname(original) || '').toLowerCase();
    if (!raw) return '.bin';
    // Optional stricter filter
    if (!raw.match(/^\.(jpg|jpeg|png|gif|webp|pdf|txt|csv|mp4|mp3|bin)$/)) {
      return '.bin';
    }
    return raw;
  }

  private publicUrlForKey(key: string) {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    }
    const region = this.config.get<string>('aws.public.region');
    return `https://${this.s3Bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private extractS3Key(input: string) {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const url = new URL(input);
      // For path-style URLs: /bucket/key... ; for virtual-hosted: /key...
      // Handle both by stripping leading "/"
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    }
    return input;
  }
}
