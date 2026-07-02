import { TestBed } from '@angular/core/testing';
import { DecryptPipe } from './decrypt.pipe';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { Store } from '@ngxs/store';

describe('DecryptPipe', () => {
  let pipe: DecryptPipe;
  let mockEncryptionService: any;
  let mockStore: any;

  beforeEach(() => {
    mockEncryptionService = {
      loadKeyFromSession: jest.fn().mockResolvedValue({} as CryptoKey),
      decrypt: jest.fn().mockResolvedValue('decrypted text'),
    };
    mockStore = {
      selectSnapshot: jest.fn().mockReturnValue({ email: 'test@example.com' }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ClientEncryptionService, useValue: mockEncryptionService },
        { provide: Store, useValue: mockStore },
      ],
    });

    pipe = TestBed.runInInjectionContext(() => new DecryptPipe());
  });

  it('should decrypt ciphertext and return the plaintext', async () => {
    const result = await pipe.transform('someCiphertext');
    expect(mockEncryptionService.loadKeyFromSession).toHaveBeenCalledWith('test@example.com');
    expect(mockEncryptionService.decrypt).toHaveBeenCalled();
    expect(result).toBe('decrypted text');
  });

  it('should return placeholder when decryption fails', async () => {
    mockEncryptionService.decrypt.mockRejectedValue(new Error('decryption error'));
    const result = await pipe.transform('badCiphertext');
    expect(result).toBe('••••••••••');
  });

  it('should return empty string for null or undefined input', async () => {
    const resultNull = await pipe.transform(null as any);
    const resultUndefined = await pipe.transform(undefined as any);
    expect(resultNull).toBe('');
    expect(resultUndefined).toBe('');
  });
});
