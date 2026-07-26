import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { PasswordUnlockProvider } from './password-unlock-provider.service';
import { ClientEncryptionService } from './encryption.service';
import { CryptoSessionManager } from './crypto-session-manager.service';
import { GroupKeyService } from './group-key.service';

describe('PasswordUnlockProvider', () => {
  let provider: PasswordUnlockProvider;
  let mockEncryption: {
    deriveAndStoreKey: jest.Mock;
    loadKeyFromSession: jest.Mock;
  };
  let mockStore: { selectSnapshot: jest.Mock };

  beforeEach(() => {
    mockEncryption = {
      deriveAndStoreKey: jest.fn().mockResolvedValue({ persisted: true }),
      loadKeyFromSession: jest.fn().mockResolvedValue({}),
    };
    mockStore = {
      selectSnapshot: jest
        .fn()
        .mockReturnValue({ email: 'test@example.com' }),
    };

    TestBed.configureTestingModule({
      providers: [
        PasswordUnlockProvider,
        CryptoSessionManager,
        { provide: ClientEncryptionService, useValue: mockEncryption },
        { provide: Store, useValue: mockStore },
        {
          provide: GroupKeyService,
          useValue: { resolveGroupKey: jest.fn(), clearCache: jest.fn() },
        },
      ],
    });

    provider = TestBed.inject(PasswordUnlockProvider);
  });

  it('declares itself as the password, text-secret provider', () => {
    expect(provider.id).toBe('password');
    expect(provider.inputType).toBe('text-secret');
    expect(provider.label).toBe('Password');
  });

  it('derives and stores the master key from the given password, then re-establishes the crypto session', async () => {
    await provider.unlock('correct horse battery staple');

    expect(mockEncryption.deriveAndStoreKey).toHaveBeenCalledWith(
      'correct horse battery staple',
      'test@example.com',
    );
    const cryptoSession = TestBed.inject(CryptoSessionManager);
    expect(cryptoSession.state()).toBe('Ready');
  });

  it('throws without calling deriveAndStoreKey when no credential is given', async () => {
    await expect(provider.unlock()).rejects.toThrow('Password is required');
    expect(mockEncryption.deriveAndStoreKey).not.toHaveBeenCalled();
  });

  it('throws when no signed-in user is found', async () => {
    mockStore.selectSnapshot.mockReturnValue(null);

    await expect(provider.unlock('anything')).rejects.toThrow(
      'No signed-in user found',
    );
    expect(mockEncryption.deriveAndStoreKey).not.toHaveBeenCalled();
  });
});
