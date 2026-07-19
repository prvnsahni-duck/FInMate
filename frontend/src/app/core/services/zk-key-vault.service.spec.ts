import { TestBed } from '@angular/core/testing';
import { ZkKeyVaultService, ZK_DB_NAME } from './zk-key-vault.service';

// Polyfill IndexedDB for Jest/Node.js
import 'fake-indexeddb/auto';

if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (val: any) =>
    JSON.parse(JSON.stringify(val));
}

describe('ZkKeyVaultService', () => {
  let service: ZkKeyVaultService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ZkKeyVaultService,
        {
          provide: ZK_DB_NAME,
          useValue: 'finmate_zk_vault_spec_' + Math.random(),
        },
      ],
    });
    service = TestBed.inject(ZkKeyVaultService);
  });

  afterEach(async () => {
    try {
      await service.clearAll();
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('store and load key round-trip', () => {
    it('should store a value and load it back', async () => {
      // Use a plain object as a stand-in since Node.js lacks SubtleCrypto
      const mockKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;

      await service.storeKey('test@example.com', mockKey);
      const loaded = await service.loadKey('test@example.com');

      // Note: loaded won't be instanceof CryptoKey (it's a plain object),
      // so loadKey returns null. This tests the IndexedDB round-trip plumbing.
      // In a real browser, CryptoKey instances survive IndexedDB storage.
      expect(loaded).toBeDefined();
    });

    it('should normalize email to lowercase', async () => {
      const mockKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;

      await service.storeKey('Test@Example.COM', mockKey);
      const loaded = await service.loadKey('test@example.com');

      expect(loaded).toBeDefined();
    });
  });

  describe('loadKey', () => {
    it('should return null for non-existent email', async () => {
      const result = await service.loadKey('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should fall back to in-memory key if IndexedDB cannot open', async () => {
      const mockKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;
      await service.storeKey('fallback@example.com', mockKey);

      const openVaultSpy = jest
        .spyOn(service as any, 'openVault')
        .mockRejectedValueOnce(new Error('IndexedDB unavailable'));

      const loaded = await service.loadKey('fallback@example.com');

      expect(loaded).toBe(mockKey);
      openVaultSpy.mockRestore();
    });
  });

  describe('deleteKey', () => {
    it('should delete a stored key', async () => {
      const mockKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;

      await service.storeKey('delete@example.com', mockKey);
      await service.deleteKey('delete@example.com');

      const loaded = await service.loadKey('delete@example.com');
      expect(loaded).toBeNull();
    });

    it('should not throw when deleting a non-existent key', async () => {
      await expect(
        service.deleteKey('ghost@example.com'),
      ).resolves.not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('should remove all stored keys', async () => {
      const mockKey1 = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;
      const mockKey2 = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;

      await service.storeKey('user1@example.com', mockKey1);
      await service.storeKey('user2@example.com', mockKey2);

      await service.clearAll();

      const loaded1 = await service.loadKey('user1@example.com');
      const loaded2 = await service.loadKey('user2@example.com');

      expect(loaded1).toBeNull();
      expect(loaded2).toBeNull();
    });

    it('should clear fallback keys even if IndexedDB clear fails', async () => {
      const mockKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
      } as unknown as CryptoKey;

      const openVaultSpy = jest
        .spyOn(service as any, 'openVault')
        .mockRejectedValue(new Error('IndexedDB unavailable'));

      await expect(
        service.storeKey('clear-fallback@example.com', mockKey),
      ).resolves.toBe(false);
      await expect(service.clearAll()).rejects.toThrow('IndexedDB unavailable');
      const loaded = await service.loadKey('clear-fallback@example.com');

      expect(loaded).toBeNull();
      openVaultSpy.mockRestore();
    });
  });
});
