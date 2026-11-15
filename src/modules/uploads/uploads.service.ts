import {
  Injectable,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  UploadsModuleOptions,
  IUploadAuditLogger,
  UPLOADS_OPTIONS_TOKEN,
  UPLOAD_LOGGER_TOKEN,
} from './interfaces/uploads-options.interface';

@Injectable()
export class UploadsService {
  private s3: S3Client;
  private bucket: string;
  private signedUrlExpireSeconds: number;

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
    this.signedUrlExpireSeconds = this.options.signedUrlExpireSeconds ?? 300;
  }

  async generateUploadUrl(
    mimeType: string,
    folder: 'appointments' | 'verifications' | 'profiles' | 'support',
  ) {
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      throw new BadRequestException('Unsupported file type');
    }

    const fileKey = `${folder}/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.signedUrlExpireSeconds,
    });

    return { uploadUrl, fileKey };
  }

  async generateViewUrl(fileKey: string, userId?: string) {
    if (userId && this.auditLogger) {
      this.auditLogger.logView(userId, fileKey);
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: this.signedUrlExpireSeconds,
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    mimeType: string,
    folder: string,
    originalName: string,
    userId?: string,
  ): Promise<string> {
    const extension = originalName.split('.').pop() || 'bin';
    const fileKey = `${folder}/${randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3.send(command);

    if (userId && this.auditLogger) {
      this.auditLogger.logUpload(userId, fileKey);
    }
    return fileKey;
  }

  /**
   * Upload a buffer to an exact, caller-chosen key (no random suffix) —
   * used for assets like backups that need a predictable, human-readable name.
   */
  async uploadBufferAtKey(
    buffer: Buffer,
    mimeType: string,
    key: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return key;
  }

  async listObjects(
    prefix: string,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    const result = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );

    return (result.Contents || [])
      .filter((obj) => !!obj.Key)
      .map((obj) => ({
        key: obj.Key as string,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
