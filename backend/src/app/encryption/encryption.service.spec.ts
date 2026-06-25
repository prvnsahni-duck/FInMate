import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';
import { ConfigService } from '@nestjs/config';
import { encryptionTransformer } from '@finmate/data-models';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'ENCRYPTION_KEY')
          return 'test_encryption_secret_key_32_bytes_len';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should encrypt and decrypt correctly', () => {
    const plainText = 'https://supabase.storage.finmate/avatars/avatar.png';

    const cipherText = service.encrypt(plainText);
    expect(cipherText).not.toBe(plainText);
    expect(cipherText.split(':')).toHaveLength(3); // iv:encrypted:authTag

    const decrypted = service.decrypt(cipherText);
    expect(decrypted).toBe(plainText);
  });

  it('should throw error on invalid ciphertext format', () => {
    expect(() => service.decrypt('invalid-format')).toThrow(
      'Could not decrypt field data',
    );
  });

  describe('encryptionTransformer', () => {
    // Note: EntityEncryptionHolder was initialized in the beforeEach block
    // because the EncryptionService constructor calls setService(this).

    it('should transform number to encrypted string on saving', () => {
      const value = 123.45;
      const dbValue = encryptionTransformer.to(value);
      expect(dbValue).toBeDefined();
      expect(typeof dbValue).toBe('string');
      expect(dbValue).not.toBe('123.45');

      const parts = dbValue!.split(':');
      expect(parts).toHaveLength(3); // iv:encrypted:authTag
    });

    it('should transform encrypted string back to number on reading', () => {
      const value = 123.45;
      const dbValue = encryptionTransformer.to(value);

      const decoded = encryptionTransformer.from(dbValue);
      expect(decoded).toBe(123.45);
    });

    it('should fallback to original number if decryption fails', () => {
      const plaintext = '456.78';
      const decoded = encryptionTransformer.from(plaintext);
      expect(decoded).toBe(456.78);
    });
  });
});
