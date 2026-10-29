import { registerAs } from '@nestjs/config';

export const awsConfig = registerAs('aws', () => ({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3: {
    bucketName: process.env.AWS_S3_BUCKET,
    signedUrlExpireSeconds: process.env.AWS_SIGNED_URL_EXPIRE || 300,
  },
  public: {
    region: process.env.PUBLIC_AWS_REGION,
    accessKeyId: process.env.PUBLIC_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.PUBLIC_AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.PUBLIC_AWS_S3_BUCKET,
    baseUrl: process.env.PUBLIC_FILE_BASE_URL,
  },
}));
