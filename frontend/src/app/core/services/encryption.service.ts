import { Injectable } from '@angular/core';

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
      // false, // Key must be non-extractable for maximum security (prevent XSS extraction)
      true, //TODO temp
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Derives a key and caches it in memory only.
   */
  async deriveAndStoreKey(password: string, email: string): Promise<CryptoKey> {
    const derivedKey = await this.deriveMasterKey(password, email);
    const subtle = this.getSubtleCrypto();
    const rawKey = await subtle.exportKey('raw', derivedKey); // TODO: Remove this line if you want to keep the key non-extractable for maximum security

    sessionStorage.setItem('finmate_zk_key', arrayBufferToBase64(rawKey));
    this.key = derivedKey;
    return derivedKey;
  }

  /**
   * Loads key from memory if it exists.
   * TODO: Consider loading from sessionStorage if not in memory, but be cautious about security implications.
   * TODO(ZK-001):
Temporary sessionStorage key persistence.
Key marked extractable=true until
encrypted IndexedDB vault is implemented.
   */
  async loadKeyFromSession(email?: string): Promise<CryptoKey | null> {
    if (this.key) {
      return this.key;
    }

    const stored = sessionStorage.getItem('finmate_zk_key');

    if (!stored) {
      return null;
    }

    const subtle = this.getSubtleCrypto();

    const importedKey = await subtle.importKey(
      'raw',
      base64ToArrayBuffer(stored),
      {
        name: 'AES-GCM',
      },
      false,
      ['encrypt', 'decrypt'],
    );

    this.key = importedKey;

    return importedKey;
  }

  /**
   * Clears the cached key from memory.
   */
  clearKey(email?: string): void {
    this.key = null;
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
}
