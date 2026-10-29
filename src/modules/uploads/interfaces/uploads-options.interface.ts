export interface UploadsModuleOptions {
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
  signedUrlExpireSeconds?: number;
}

export interface IUploadAuditLogger {
  logUpload(userId: string, fileKey: string): void;
  logView(userId: string, fileKey: string): void;
}

export const UPLOADS_OPTIONS_TOKEN = 'UPLOADS_OPTIONS';
export const UPLOAD_LOGGER_TOKEN = 'UPLOAD_LOGGER';
