import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validConfig = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://user:pass@host/db',
    JWT_SECRET: 'secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    ENCRYPTION_KEY: 'encryption-key',
    PAYSTACK_SECRET_KEY: 'sk_test',
    PAYSTACK_PUBLIC_KEY: 'pk_test',
    PAYSTACK_WEBHOOK_SECRET: 'whsec',
    AWS_REGION: 'us-east-2',
    AWS_ACCESS_KEY_ID: 'aws-key',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
    AWS_S3_BUCKET: 'bucket',
    PUBLIC_AWS_REGION: 'us-east-1',
    PUBLIC_AWS_ACCESS_KEY_ID: 'pub-aws-key',
    PUBLIC_AWS_SECRET_ACCESS_KEY: 'pub-aws-secret',
    PUBLIC_AWS_S3_BUCKET: 'public-bucket',
    FIREBASE_PROJECT_ID: 'project-id',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
    FIREBASE_PRIVATE_KEY: 'private-key',
    MAIL_HOST: 'smtp.example.com',
    MAIL_USER: 'mail-user',
    MAIL_PASS: 'mail-pass',
    MAIL_FROM: 'support@example.com',
    AGORA_APP_ID: 'agora-id',
    AGORA_APP_CERTIFICATE: 'agora-cert',
    SUPER_ADMIN_EMAIL: 'admin@example.com',
    SUPER_ADMIN_PASSWORD: 'strong-password',
  };

  it('passes through a fully configured environment', () => {
    expect(() => validateEnv({ ...validConfig })).not.toThrow();
  });

  it('throws when a required variable is missing', () => {
    const { JWT_SECRET, ...incomplete } = validConfig;
    expect(() => validateEnv(incomplete)).toThrow(/JWT_SECRET/);
  });

  it('throws when a required variable is blank', () => {
    expect(() =>
      validateEnv({ ...validConfig, MONGODB_URI: '' }),
    ).toThrow(/MONGODB_URI/);
  });

  it('throws when NODE_ENV is set to an unrecognized value', () => {
    expect(() =>
      validateEnv({ ...validConfig, NODE_ENV: 'staging-typo' }),
    ).toThrow(/NODE_ENV/);
  });

  it('allows NODE_ENV to be omitted', () => {
    const { NODE_ENV, ...rest } = validConfig;
    expect(() => validateEnv(rest)).not.toThrow();
  });
});
