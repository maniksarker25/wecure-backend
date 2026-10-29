import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly ivLength = 16;

  constructor(private configService: ConfigService) {
    const secret = this.configService.get<string>('ENCRYPTION_KEY');
    if (!secret) {
      throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }
    // Hash the secret to ensure it's exactly 32 bytes for AES-256
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(text?: string): string | undefined {
    if (!text) return text;
    // Prevent double encryption
    if (this.isEncrypted(text)) return text;

    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  isEncrypted(text?: string): boolean {
    // Basic check: format is iv:encrypted_content
    // IV is 16 bytes = 32 hex chars
    if (!text || typeof text !== 'string') return false;
    const parts = text.split(':');
    return parts.length === 2 && parts[0].length === 32;
  }

  decrypt(encryptedText?: string): string | undefined {
    if (
      !encryptedText ||
      typeof encryptedText !== 'string' ||
      !encryptedText.includes(':')
    ) {
      return encryptedText;
    }
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
