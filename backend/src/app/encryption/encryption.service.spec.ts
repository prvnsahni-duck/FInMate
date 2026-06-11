import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';
import { ConfigService } from '@nestjs/config';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'ENCRYPTION_KEY') return 'test_encryption_secret_key_32_bytes_len';
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
    expect(() => service.decrypt('invalid-format')).toThrow('Could not decrypt field data');
  });
});
