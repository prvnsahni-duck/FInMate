import { ValueTransformer } from 'typeorm';

export interface EntityEncryptionService {
  encrypt(text: string): string;
  decrypt(ciphertext: string): string;
}

export class EntityEncryptionHolder {
  private static service?: EntityEncryptionService;

  static setService(service: EntityEncryptionService) {
    this.service = service;
  }

  static encrypt(text: string): string {
    if (!this.service) return text;
    return this.service.encrypt(text);
  }

  static decrypt(ciphertext: string): string {
    if (!this.service) return ciphertext;
    return this.service.decrypt(ciphertext);
  }
}

export const encryptionTransformer: ValueTransformer = {
  to(value: number | string | null | undefined): string | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    return EntityEncryptionHolder.encrypt(String(value));
  },
  from(value: string | null | undefined): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    try {
      const decrypted = EntityEncryptionHolder.decrypt(value);
      return Number(decrypted);
    } catch {
      // Fallback for existing plaintext records
      return Number(value);
    }
  },
};
