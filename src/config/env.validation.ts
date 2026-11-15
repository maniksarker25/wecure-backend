import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Environment variables the app cannot safely run without. Validated once at
 * boot so a missing/blank value fails `nest start` / `node dist/main`
 * immediately instead of surfacing as a 500 the first time some request
 * happens to need it.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv;

  @IsNotEmpty()
  @IsString()
  MONGODB_URI: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsNotEmpty()
  @IsString()
  ENCRYPTION_KEY: string;

  @IsNotEmpty()
  @IsString()
  PAYSTACK_SECRET_KEY: string;

  @IsNotEmpty()
  @IsString()
  PAYSTACK_PUBLIC_KEY: string;

  @IsNotEmpty()
  @IsString()
  PAYSTACK_WEBHOOK_SECRET: string;

  @IsNotEmpty()
  @IsString()
  AWS_REGION: string;

  @IsNotEmpty()
  @IsString()
  AWS_ACCESS_KEY_ID: string;

  @IsNotEmpty()
  @IsString()
  AWS_SECRET_ACCESS_KEY: string;

  @IsNotEmpty()
  @IsString()
  AWS_S3_BUCKET: string;

  @IsNotEmpty()
  @IsString()
  PUBLIC_AWS_REGION: string;

  @IsNotEmpty()
  @IsString()
  PUBLIC_AWS_ACCESS_KEY_ID: string;

  @IsNotEmpty()
  @IsString()
  PUBLIC_AWS_SECRET_ACCESS_KEY: string;

  @IsNotEmpty()
  @IsString()
  PUBLIC_AWS_S3_BUCKET: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_PROJECT_ID: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_CLIENT_EMAIL: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_PRIVATE_KEY: string;

  @IsNotEmpty()
  @IsString()
  MAIL_HOST: string;

  @IsNotEmpty()
  @IsString()
  MAIL_USER: string;

  @IsNotEmpty()
  @IsString()
  MAIL_PASS: string;

  @IsNotEmpty()
  @IsString()
  MAIL_FROM: string;

  @IsNotEmpty()
  @IsString()
  AGORA_APP_ID: string;

  @IsNotEmpty()
  @IsString()
  AGORA_APP_CERTIFICATE: string;

  @IsNotEmpty()
  @IsString()
  SUPER_ADMIN_EMAIL: string;

  @IsNotEmpty()
  @IsString()
  SUPER_ADMIN_PASSWORD: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints || {}).join(', '))
      .join('; ');
    throw new Error(
      `Invalid or missing environment variables — refusing to start: ${messages}`,
    );
  }

  return validatedConfig;
}
