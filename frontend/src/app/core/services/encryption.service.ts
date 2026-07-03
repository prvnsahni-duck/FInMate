import { Injectable, inject } from '@angular/core';
import { ZkKeyVaultService } from './zk-key-vault.service';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

@Injectable({
  providedIn: 'root',
})
export class ClientEncryptionService {
  private zkVault = inject(ZkKeyVaultService);
  private key: CryptoKey | null = null;

  /** Returns the current in-memory master key, or null if not yet derived. */
  getKey(): CryptoKey | null {
    return this.key;
  }

  private getSubtleCrypto(): SubtleCrypto {
    if (
      typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle
    ) {
      return window.crypto.subtle;
    }
    // Fallback for Node.js / Jest testing environment
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.crypto &&
      globalThis.crypto.subtle
    ) {
      return globalThis.crypto.subtle;
    }
    throw new Error('Web Cryptography API (SubtleCrypto) is not available');
  }

  /**
   * Derives an AES-256-GCM master key locally from user credentials using PBKDF2.
   * @param password User password or master passphrase
   * @param email User email (used as salt for consistency and uniqueness)
   */
  async deriveMasterKey(password: string, email: string): Promise<CryptoKey> {
    if (!password) {
      throw new Error('Password must not be empty');
    }
    if (!email) {
      throw new Error('Email must not be empty');
    }

    const subtle = this.getSubtleCrypto();
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(email.toLowerCase());

    const keyMaterial = await subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // Non-extractable: prevents XSS from reading raw key material
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    );
  }

  /**
   * Derives a key and persists it in the secure IndexedDB vault.
   * The key is non-extractable — the browser allows encrypt/decrypt
   * operations but prevents JavaScript from reading the raw key bytes.
   */
  async deriveAndStoreKey(
    password: string,
    email: string,
  ): Promise<{ key: CryptoKey; persisted: boolean }> {
    const derivedKey = await this.deriveMasterKey(password, email);
    this.key = derivedKey;
    const persisted = await this.zkVault.storeKey(email, derivedKey);
    return { key: derivedKey, persisted };
  }

  /**
   * Loads key from in-memory cache first, then falls back to IndexedDB vault.
   * This allows the key to survive page refreshes without re-authentication.
   */
  async loadKeyFromSession(email?: string): Promise<CryptoKey | null> {
    if (this.key) {
      return this.key;
    }

    if (!email) {
      return null;
    }

    try {
      const vaultKey = await this.zkVault.loadKey(email);
      if (vaultKey) {
        this.key = vaultKey;
        return vaultKey;
      }
    } catch (e) {
      console.error('Failed to load key from vault', e);
    }

    return null;
  }

  /**
   * Clears the key from both in-memory cache and the IndexedDB vault.
   */
  async clearKey(email?: string): Promise<void> {
    this.key = null;
    if (email) {
      try {
        await this.zkVault.deleteKey(email);
      } catch (e) {
        console.error('Failed to delete key from vault', e);
      }
    }
  }

  /**
   * Encrypts a plaintext string using the derived key with AES-256-GCM.
   * Returns a combined string in format `iv_base64:ciphertext_base64`.
   */
  async encrypt(plaintext: string, key: CryptoKey): Promise<string> {
    if (plaintext === undefined || plaintext === null) {
      return '';
    }

    const subtle = this.getSubtleCrypto();
    const encoder = new TextEncoder();
    const encodedPlaintext = encoder.encode(plaintext);

    // Generate a unique 12-byte IV
    let iv: Uint8Array;
    if (typeof window !== 'undefined' && window.crypto) {
      iv = window.crypto.getRandomValues(new Uint8Array(12));
    } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    } else {
      throw new Error('Web Cryptography API (SubtleCrypto) is not available');
    }

    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;
    const ciphertextBuffer = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      key,
      encodedPlaintext,
    );

    const ivBase64 = arrayBufferToBase64(ivBuffer);
    const ciphertextBase64 = arrayBufferToBase64(ciphertextBuffer);

    return `${ivBase64}:${ciphertextBase64}`;
  }

  /**
   * Decrypts an encrypted string in format `iv_base64:ciphertext_base64` using the derived key.
   */
  async decrypt(encryptedStr: string, key: CryptoKey): Promise<string> {
    if (!encryptedStr) {
      return '';
    }

    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error(
        'Invalid ciphertext format. Expected iv_base64:ciphertext_base64',
      );
    }

    const subtle = this.getSubtleCrypto();
    const iv = new Uint8Array(base64ToArrayBuffer(parts[0]));
    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;
    const ciphertextBuffer = base64ToArrayBuffer(parts[1]);

    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      key,
      ciphertextBuffer,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Type-safe encryption wrapper for Expense properties
   */
  async encryptExpense(
    expense: { title: string; description?: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; description?: string; [key: string]: unknown }> {
    const encryptedTitle = await this.encrypt(expense.title, key);
    const encryptedDesc = expense.description
      ? await this.encrypt(expense.description, key)
      : undefined;

    return {
      ...expense,
      title: encryptedTitle,
      description: encryptedDesc,
    };
  }

  /**
   * Type-safe decryption wrapper for Expense properties
   */
  async decryptExpense(
    expense: { title: string; description?: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; description?: string; [key: string]: unknown }> {
    const decryptedTitle = await this.decrypt(expense.title, key);
    const decryptedDesc = expense.description
      ? await this.decrypt(expense.description, key)
      : undefined;

    return {
      ...expense,
      title: decryptedTitle,
      description: decryptedDesc,
    };
  }

  /**
   * Type-safe encryption wrapper for Note properties
   */
  async encryptNote(
    note: { title: string; body: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; body: string; [key: string]: unknown }> {
    const encryptedTitle = await this.encrypt(note.title, key);
    const encryptedBody = await this.encrypt(note.body, key);

    return {
      ...note,
      title: encryptedTitle,
      body: encryptedBody,
    };
  }

  /**
   * Type-safe decryption wrapper for Note properties
   */
  async decryptNote(
    note: { title: string; body: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; body: string; [key: string]: unknown }> {
    const decryptedTitle = await this.decrypt(note.title, key);
    const decryptedBody = await this.decrypt(note.body, key);

    return {
      ...note,
      title: decryptedTitle,
      body: decryptedBody,
    };
  }

  /**
   * Type-safe encryption wrapper for Goal properties
   */
  async encryptGoal(
    goal: { title: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; [key: string]: unknown }> {
    const encryptedTitle = await this.encrypt(goal.title, key);

    return {
      ...goal,
      title: encryptedTitle,
    };
  }

  /**
   * Type-safe decryption wrapper for Goal properties
   */
  async decryptGoal(
    goal: { title: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ title: string; [key: string]: unknown }> {
    const decryptedTitle = await this.decrypt(goal.title, key);

    return {
      ...goal,
      title: decryptedTitle,
    };
  }

  /**
   * Type-safe encryption wrapper for Settlement properties
   */
  async encryptSettlement(
    settlement: { note?: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ note?: string; [key: string]: unknown }> {
    const encryptedNote = settlement.note
      ? await this.encrypt(settlement.note, key)
      : undefined;

    return {
      ...settlement,
      note: encryptedNote,
    };
  }

  /**
   * Type-safe decryption wrapper for Settlement properties
   */
  async decryptSettlement(
    settlement: { note?: string; [key: string]: unknown },
    key: CryptoKey,
  ): Promise<{ note?: string; [key: string]: unknown }> {
    const decryptedNote = settlement.note
      ? await this.decrypt(settlement.note, key)
      : undefined;

    return {
      ...settlement,
      note: decryptedNote,
    };
  }

  /**
   * Generates a random symmetric key (AES-GCM 256-bit) to be used as a content
   * or group key. Must be extractable so it can be wrapped.
   */
  async generateDataKey(): Promise<CryptoKey> {
    const subtle = this.getSubtleCrypto();
    return await subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true, // extractable
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Wraps (encrypts) a data key with a wrapping key (such as the master key or a public key).
   * Returns a combined string in format `iv_base64:ciphertext_base64` for symmetric key, or base64 ciphertext for asymmetric key.
   */
  async wrapKey(dataKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
    const subtle = this.getSubtleCrypto();
    if (wrappingKey.type === 'public') {
      const wrappedBuffer = await subtle.wrapKey(
        'raw',
        dataKey,
        wrappingKey,
        {
          name: 'RSA-OAEP',
        },
      );
      return arrayBufferToBase64(wrappedBuffer);
    }

    let iv: Uint8Array;
    if (typeof window !== 'undefined' && window.crypto) {
      iv = window.crypto.getRandomValues(new Uint8Array(12));
    } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    } else {
      throw new Error('Web Cryptography API (SubtleCrypto) is not available');
    }
    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;

    // Export the data key and encrypt it symmetrically
    const rawKeyBuffer = await subtle.exportKey('raw', dataKey);
    const ciphertextBuffer = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      wrappingKey,
      rawKeyBuffer,
    );

    const ivBase64 = arrayBufferToBase64(ivBuffer);
    const wrappedBase64 = arrayBufferToBase64(ciphertextBuffer);

    return `${ivBase64}:${wrappedBase64}`;
  }

  /**
   * Unwraps (decrypts) a wrapped key using an unwrapping key (such as the master key or a private key).
   * Returns a non-extractable CryptoKey.
   */
  async unwrapKey(wrappedStr: string, unwrappingKey: CryptoKey): Promise<CryptoKey> {
    if (!wrappedStr) {
      throw new Error('Wrapped key string cannot be empty');
    }
    const subtle = this.getSubtleCrypto();
    if (unwrappingKey.type === 'private') {
      const wrappedBuffer = base64ToArrayBuffer(wrappedStr);
      return await subtle.unwrapKey(
        'raw',
        wrappedBuffer,
        unwrappingKey,
        {
          name: 'RSA-OAEP',
        },
        {
          name: 'AES-GCM',
          length: 256,
        },
        false, // non-extractable for security
        ['encrypt', 'decrypt'],
      );
    }

    const parts = wrappedStr.split(':');
    if (parts.length !== 2) {
      throw new Error(
        'Invalid wrapped key format. Expected iv_base64:ciphertext_base64',
      );
    }

    const iv = new Uint8Array(base64ToArrayBuffer(parts[0]));
    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;
    const wrappedBuffer = base64ToArrayBuffer(parts[1]);

    // Decrypt the wrapped key symmetrically and import it
    const rawKeyBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      unwrappingKey,
      wrappedBuffer,
    );

    return await subtle.importKey(
      'raw',
      rawKeyBuffer,
      {
        name: 'AES-GCM',
      },
      false, // non-extractable for security
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Encrypts raw bytes (ArrayBuffer) using a CryptoKey with AES-256-GCM.
   * Returns a combined string in format `iv_base64:ciphertext_base64`.
   */
  async encryptBytes(data: ArrayBuffer, key: CryptoKey): Promise<string> {
    const subtle = this.getSubtleCrypto();
    let iv: Uint8Array;
    if (typeof window !== 'undefined' && window.crypto) {
      iv = window.crypto.getRandomValues(new Uint8Array(12));
    } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    } else {
      throw new Error('Web Cryptography API (SubtleCrypto) is not available');
    }
    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;

    const ciphertextBuffer = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      key,
      data,
    );

    const ivBase64 = arrayBufferToBase64(ivBuffer);
    const ciphertextBase64 = arrayBufferToBase64(ciphertextBuffer);

    return `${ivBase64}:${ciphertextBase64}`;
  }

  /**
   * Decrypts encrypted bytes in format `iv_base64:ciphertext_base64` using a CryptoKey.
   */
  async decryptBytes(encryptedStr: string, key: CryptoKey): Promise<ArrayBuffer> {
    if (!encryptedStr) {
      return new ArrayBuffer(0);
    }
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error(
        'Invalid ciphertext format. Expected iv_base64:ciphertext_base64',
      );
    }

    const subtle = this.getSubtleCrypto();
    const iv = new Uint8Array(base64ToArrayBuffer(parts[0]));
    const ivBuffer = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;
    const ciphertextBuffer = base64ToArrayBuffer(parts[1]);

    return await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      key,
      ciphertextBuffer,
    );
  }

  /**
   * Generates a 2048-bit RSA-OAEP keypair for wrapping.
   */
  async generateWrappingKeyPair(): Promise<CryptoKeyPair> {
    const subtle = this.getSubtleCrypto();
    return await subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable
      ['wrapKey', 'unwrapKey'],
    );
  }

  /**
   * Exports an RSA-OAEP public key to base64 SPKI format.
   */
  async exportPublicKey(key: CryptoKey): Promise<string> {
    const subtle = this.getSubtleCrypto();
    const exported = await subtle.exportKey('spki', key);
    return arrayBufferToBase64(exported);
  }

  /**
   * Imports an RSA-OAEP public key from base64 SPKI format.
   */
  async importPublicKey(spkiBase64: string): Promise<CryptoKey> {
    const subtle = this.getSubtleCrypto();
    const buffer = base64ToArrayBuffer(spkiBase64);
    return await subtle.importKey(
      'spki',
      buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      true,
      ['wrapKey'],
    );
  }

  /**
   * Exports an RSA-OAEP private key to base64 PKCS8 format.
   */
  async exportPrivateKey(key: CryptoKey): Promise<string> {
    const subtle = this.getSubtleCrypto();
    const exported = await subtle.exportKey('pkcs8', key);
    return arrayBufferToBase64(exported);
  }

  /**
   * Imports an RSA-OAEP private key from base64 PKCS8 format.
   */
  async importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
    const subtle = this.getSubtleCrypto();
    const buffer = base64ToArrayBuffer(pkcs8Base64);
    return await subtle.importKey(
      'pkcs8',
      buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      true,
      ['unwrapKey'],
    );
  }
}
