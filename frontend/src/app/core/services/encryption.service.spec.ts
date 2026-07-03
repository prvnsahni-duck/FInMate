import { TestBed } from '@angular/core/testing';
import { ClientEncryptionService } from './encryption.service';
import { ZkKeyVaultService } from './zk-key-vault.service';
import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (val: any) => JSON.parse(JSON.stringify(val));
}

// Polyfill Web Cryptography API for Jest/Node.js testing environment
if (typeof globalThis !== 'undefined' && !globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
  });
} else if (
  typeof globalThis !== 'undefined' &&
  globalThis.crypto &&
  !globalThis.crypto.subtle
) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
    writable: true,
  });
}

import { ZK_DB_NAME } from './zk-key-vault.service';

describe('ClientEncryptionService', () => {
  let service: ClientEncryptionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ClientEncryptionService,
        ZkKeyVaultService,
        { provide: ZK_DB_NAME, useValue: 'finmate_zk_vault_enc_spec_' + Math.random() }
      ],
    });
    service = TestBed.inject(ClientEncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should derive a master key from password and email', async () => {
    const password = 'mySecretPassphrase!';
    const email = 'user@example.com';

    const key = await service.deriveMasterKey(password, email);
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
    // Ensure AES-256 GCM key length
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('should throw an error if password or email is empty during derivation', async () => {
    await expect(
      service.deriveMasterKey('', 'user@example.com'),
    ).rejects.toThrow('Password must not be empty');
    await expect(service.deriveMasterKey('pass', '')).rejects.toThrow(
      'Email must not be empty',
    );
  });

  it('should encrypt and decrypt a plaintext string consistently', async () => {
    const password = 'mySecretPassphrase!';
    const email = 'user@example.com';
    const plaintext = 'This is a private note or transaction title.';

    const key = await service.deriveMasterKey(password, email);
    const encrypted = await service.encrypt(plaintext, key);

    expect(encrypted).toBeDefined();
    expect(encrypted).toContain(':');

    const parts = encrypted.split(':');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(10); // base64 IV
    expect(parts[1].length).toBeGreaterThan(10); // base64 ciphertext

    const decrypted = await service.decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw error for invalid ciphertext formats', async () => {
    const password = 'mySecretPassphrase!';
    const email = 'user@example.com';
    const key = await service.deriveMasterKey(password, email);

    await expect(service.decrypt('justciphertextnoiv', key)).rejects.toThrow(
      'Invalid ciphertext format',
    );
    await expect(service.decrypt('iv:ciphertext:tag', key)).rejects.toThrow(
      'Invalid ciphertext format',
    );
  });

  it('should type-safely encrypt and decrypt Expense objects', async () => {
    const password = 'mySecretPassphrase!';
    const email = 'user@example.com';
    const key = await service.deriveMasterKey(password, email);

    const expense = {
      id: 'exp-123',
      title: 'Company Dinner',
      description: 'Dinner with executive team at upscale restaurant',
      amountTotal: 150.0,
      currency: 'USD',
    };

    const encryptedExpense = await service.encryptExpense(expense, key);
    expect(encryptedExpense.id).toBe(expense.id);
    expect(encryptedExpense.amountTotal).toBe(expense.amountTotal);
    expect(encryptedExpense.currency).toBe(expense.currency);

    expect(encryptedExpense.title).not.toBe(expense.title);
    expect(encryptedExpense.title).toContain(':');
    expect(encryptedExpense.description).not.toBe(expense.description);
    expect(encryptedExpense.description).toContain(':');

    const decryptedExpense = await service.decryptExpense(
      encryptedExpense,
      key,
    );
    expect(decryptedExpense.title).toBe(expense.title);
    expect(decryptedExpense.description).toBe(expense.description);
    expect(decryptedExpense.id).toBe(expense.id);
  });

  it('should type-safely encrypt and decrypt Note objects', async () => {
    const password = 'mySecretPassphrase!';
    const email = 'user@example.com';
    const key = await service.deriveMasterKey(password, email);

    const note = {
      id: 'note-1',
      title: 'Personal Secret Note',
      body: 'Keep private passwords and notes here.',
      visibility: 'private' as const,
    };

    const encryptedNote = await service.encryptNote(note, key);
    expect(encryptedNote.id).toBe(note.id);
    expect(encryptedNote.visibility).toBe(note.visibility);

    expect(encryptedNote.title).not.toBe(note.title);
    expect(encryptedNote.body).not.toBe(note.body);

    const decryptedNote = await service.decryptNote(encryptedNote, key);
    expect(decryptedNote.title).toBe(note.title);
    expect(decryptedNote.body).toBe(note.body);
  });

  it('should type-safely encrypt and decrypt Goal objects', async () => {
    const password = 'pass';
    const email = 'user@ex.com';
    const key = await service.deriveMasterKey(password, email);

    const goal = {
      id: 'goal-1',
      title: 'Save for Europe Trip',
      targetAmount: 5000,
    };

    const encryptedGoal = await service.encryptGoal(goal, key);
    expect(encryptedGoal.targetAmount).toBe(goal.targetAmount);
    expect(encryptedGoal.title).not.toBe(goal.title);

    const decryptedGoal = await service.decryptGoal(encryptedGoal, key);
    expect(decryptedGoal.title).toBe(goal.title);
  });

  it('should type-safely encrypt and decrypt Settlement objects', async () => {
    const password = 'pass';
    const email = 'user@ex.com';
    const key = await service.deriveMasterKey(password, email);

    const settlement = {
      id: 'settlement-1',
      note: 'Payment for Goa flight tickets',
      amount: 120.5,
    };

    const encryptedSettlement = await service.encryptSettlement(
      settlement,
      key,
    );
    expect(encryptedSettlement.amount).toBe(settlement.amount);
    expect(encryptedSettlement.note).not.toBe(settlement.note);

    const decryptedSettlement = await service.decryptSettlement(
      encryptedSettlement,
      key,
    );
    expect(decryptedSettlement.note).toBe(settlement.note);
  });

  it('should derive, store, load, and clear master key using the secure vault', async () => {
    const password = 'testPassword!';
    const email = 'user-spec@example.com';

    // 1. Derive and store key (persists to vault)
    const result = await service.deriveAndStoreKey(password, email);
    expect(result.key).toBeDefined();
    expect(result.persisted).toBe(true);
    expect(service.getKey()).toBe(result.key);

    // Verify it is NOT in sessionStorage
    const stored = sessionStorage.getItem('finmate_zk_key');
    expect(stored).toBeNull();

    // 2. Clear key from memory and vault
    await service.clearKey(email);
    expect(service.getKey()).toBeNull();

    // 3. Verify it is removed from vault
    const loadedNull = await service.loadKeyFromSession(email);
    expect(loadedNull).toBeNull();

    // 4. Re-derive, clear only memory cache (by setting service['key'] to null or similar)
    const rederiveResult = await service.deriveAndStoreKey(password, email);
    expect(rederiveResult.persisted).toBe(true);
    // Artificially clear in-memory reference to force loading from vault
    (service as any).key = null;

    const loadedKey = await service.loadKeyFromSession(email);
    expect(loadedKey).toBeDefined();
    expect(loadedKey).not.toBeNull();

    // Cleanup
    await service.clearKey(email);
  });

  it('should fall back to memory-only cache and succeed login if IndexedDB persistence fails', async () => {
    const password = 'fallbackPassword!';
    const email = 'fallback-spec@example.com';
    const zkVault = TestBed.inject(ZkKeyVaultService);

    // Mock storeKey to fail (return false)
    const storeSpy = jest.spyOn(zkVault, 'storeKey').mockResolvedValue(false);

    const result = await service.deriveAndStoreKey(password, email);
    expect(result.key).toBeDefined();
    expect(result.persisted).toBe(false);
    expect(service.getKey()).toBe(result.key); // remains in memory

    // Verify encryption works
    const plaintext = 'Secret message';
    const encrypted = await service.encrypt(plaintext, result.key);
    expect(encrypted).toContain(':');
    const decrypted = await service.decrypt(encrypted, result.key);
    expect(decrypted).toBe(plaintext);

    storeSpy.mockRestore();
    await service.clearKey(email);
  });

  it('should support wrapping and unwrapping a generated data key using another generated data key with round-trip correctness', async () => {
    const wrappingKey = await service.generateDataKey();
    const dataKey = await service.generateDataKey();

    // Wrap the data key
    const wrappedStr = await service.wrapKey(dataKey, wrappingKey);
    expect(wrappedStr).toBeDefined();
    expect(wrappedStr).toContain(':');

    // Unwrap the data key
    const unwrappedKey = await service.unwrapKey(wrappedStr, wrappingKey);
    expect(unwrappedKey).toBeDefined();
    expect(unwrappedKey.type).toBe('secret');
    expect(unwrappedKey.algorithm.name).toBe('AES-GCM');

    // Verify round-trip correctness (encrypt with original key, decrypt with unwrapped key)
    const plaintext = 'Symmetric key wrapping round-trip test!';
    const encrypted = await service.encrypt(plaintext, dataKey);
    const decrypted = await service.decrypt(encrypted, unwrappedKey);
    expect(decrypted).toBe(plaintext);
  });
});
