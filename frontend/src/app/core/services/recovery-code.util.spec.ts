import { TestBed } from '@angular/core/testing';
import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import { ClientEncryptionService } from './encryption.service';
import { ZkKeyVaultService, ZK_DB_NAME } from './zk-key-vault.service';
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-code.util';

if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (val: any) =>
    JSON.parse(JSON.stringify(val));
}

// Polyfill Web Cryptography API for the Jest/Node environment.
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

describe('recovery-code util', () => {
  describe('generateRecoveryCode', () => {
    it('produces four hyphen-separated groups of five Crockford base32 chars', () => {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    });

    it('never emits Crockford-ambiguous characters (I, L, O, U)', () => {
      for (let i = 0; i < 50; i++) {
        expect(generateRecoveryCode()).not.toMatch(/[ILOU]/);
      }
    });

    it('is effectively unique across calls', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(generateRecoveryCode());
      }
      expect(seen.size).toBe(200);
    });
  });

  describe('normalizeRecoveryCode', () => {
    it('uppercases, strips hyphens/whitespace, and folds ambiguous chars', () => {
      expect(normalizeRecoveryCode('ab1c2-3d4e5')).toBe('AB1C23D4E5');
      expect(normalizeRecoveryCode('  a b c  ')).toBe('ABC');
      // I/L → 1, O → 0
      expect(normalizeRecoveryCode('ilo')).toBe('110');
    });

    it('is idempotent on an already-canonical code', () => {
      const code = generateRecoveryCode();
      const once = normalizeRecoveryCode(code);
      expect(normalizeRecoveryCode(once)).toBe(once);
    });

    it('treats hyphenated and unhyphenated input identically', () => {
      const code = generateRecoveryCode();
      expect(normalizeRecoveryCode(code)).toBe(
        normalizeRecoveryCode(code.replace(/-/g, '')),
      );
    });
  });

  describe('recovery round-trip (mirrors setup → reset)', () => {
    let enc: ClientEncryptionService;
    const email = 'user@example.com';
    const privateKeyJwk = JSON.stringify({ kty: 'RSA', d: 'secret-material' });

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          ClientEncryptionService,
          ZkKeyVaultService,
          {
            provide: ZK_DB_NAME,
            useValue: 'finmate_zk_vault_recovery_spec_' + Math.random(),
          },
        ],
      });
      enc = TestBed.inject(ClientEncryptionService);
    });

    it('unwraps the private key with the correct code and re-wraps under a new password', async () => {
      const code = generateRecoveryCode();

      // Setup: wrap the private key under the recovery code.
      const recoveryKey = await enc.deriveMasterKey(
        normalizeRecoveryCode(code),
        email,
      );
      const recoveryWrappedKey = await enc.encrypt(privateKeyJwk, recoveryKey);

      // Reset: unwrap with the same code, then re-wrap under the new password.
      const recoveryKeyAgain = await enc.deriveMasterKey(
        normalizeRecoveryCode(code),
        email,
      );
      const recovered = await enc.decrypt(recoveryWrappedKey, recoveryKeyAgain);
      expect(recovered).toBe(privateKeyJwk);

      const newMasterKey = await enc.deriveMasterKey('brand-new-pass', email);
      const reWrapped = await enc.encrypt(recovered, newMasterKey);
      expect(await enc.decrypt(reWrapped, newMasterKey)).toBe(privateKeyJwk);
    });

    it('rejects a wrong recovery code (AES-GCM auth tag fails)', async () => {
      const recoveryKey = await enc.deriveMasterKey(
        normalizeRecoveryCode(generateRecoveryCode()),
        email,
      );
      const recoveryWrappedKey = await enc.encrypt(privateKeyJwk, recoveryKey);

      const wrongKey = await enc.deriveMasterKey(
        normalizeRecoveryCode(generateRecoveryCode()),
        email,
      );
      await expect(
        enc.decrypt(recoveryWrappedKey, wrongKey),
      ).rejects.toBeDefined();
    });
  });
});
