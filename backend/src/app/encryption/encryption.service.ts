import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawSecret = this.configService.get<string>('ENCRYPTION_KEY') || 'default_encryption_key_for_finmate_development_phase';
    // Ensure key is exactly 32 bytes by hashing the secret using SHA-256
    this.key = createHash('sha256').update(rawSecret).digest();
  }

  encrypt(text: string): string {
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${encrypted}:${authTag}`;
    } catch (err: any) {
      this.logger.error(`Encryption failed: ${err.message}`, err.stack);
      throw new Error('Could not encrypt field data');
    }
  }

  decrypt(ciphertext: string): string {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], 'hex');

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err: any) {
      this.logger.error(`Decryption failed: ${err.message}`, err.stack);
      throw new Error('Could not decrypt field data');
    }
  }
}
