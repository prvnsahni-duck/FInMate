import { Injectable, InjectionToken, inject } from '@angular/core';

export const ZK_DB_NAME = new InjectionToken<string>('ZK_DB_NAME', {
  providedIn: 'root',
  factory: () => 'finmate_zk_vault',
});

const DB_VERSION = 1;
const STORE_NAME = 'keys';

function logError(...args: any[]) {
  console.error(...args);
}

/**
 * Secure vault for ZK encryption keys using IndexedDB.
 *
 * Stores non-extractable CryptoKey handles that survive page refreshes.
 * The browser enforces that JavaScript cannot read the raw key material,
 * only use it for encrypt/decrypt operations — mitigating XSS key theft.
 */
@Injectable({
  providedIn: 'root',
})
export class ZkKeyVaultService {
  private dbName = inject(ZK_DB_NAME);
  private static fallbackMap: Map<string, CryptoKey> = new Map();
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens (or creates) the IndexedDB database.
   * Reuses the same promise to avoid multiple open calls.
   */
  private openVault(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        const err = new Error('IndexedDB unavailable');
        logError('Failed to open ZK vault IndexedDB', err);
        this.dbPromise = null;
        reject(err);
        return;
      }
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        logError('Failed to open ZK vault IndexedDB', request.error);
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Stores a CryptoKey in the vault, keyed by the user's email (lowercased).
   */
  async storeKey(email: string, key: CryptoKey): Promise<boolean> {
    if (!email) {
      throw new Error('Email is required to store key');
    }
    if (!key) {
      throw new Error('CryptoKey is required to store key');
    }
    const normalizedEmail = email.toLowerCase();
    let db: IDBDatabase;

    try {
      db = await this.openVault();
    } catch (error) {
      console.warn('IndexedDB persistence unavailable. Falling back to memory-only key cache.');
      ZkKeyVaultService.fallbackMap.set(normalizedEmail, key);
      return false;
    }

    return new Promise<boolean>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(key, normalizedEmail);

        request.onsuccess = () => {
          ZkKeyVaultService.fallbackMap.set(normalizedEmail, key);
          resolve(true);
        };
        request.onerror = () => {
          logError('Failed to store key in ZK vault', request.error);
          console.warn('IndexedDB persistence unavailable. Falling back to memory-only key cache.');
          ZkKeyVaultService.fallbackMap.set(normalizedEmail, key);
          resolve(false);
        };
      } catch (error) {
        logError('Synchronous error putting key in ZK vault', error);
        console.warn('IndexedDB persistence unavailable. Falling back to memory-only key cache.');
        ZkKeyVaultService.fallbackMap.set(normalizedEmail, key);
        resolve(false);
      }
    });
  }

  /**
   * Retrieves a CryptoKey from the vault by email.
   * Returns null if no key exists for the given email.
   */
  async loadKey(email: string): Promise<CryptoKey | null> {
    const normalizedEmail = email.toLowerCase();

    if (!this.dbPromise) {
      const fallbackKey = ZkKeyVaultService.fallbackMap.get(normalizedEmail) ?? null;
      if (fallbackKey) {
        return fallbackKey;
      }
    }

    let db: IDBDatabase;

    try {
      db = await this.openVault();
    } catch (error) {
      // If IndexedDB cannot be opened and there is no in‑memory fallback,
      // gracefully return null instead of propagating the error. This makes
      // the service tolerant to environments without IndexedDB (e.g., Jest).
      if (ZkKeyVaultService.fallbackMap.has(normalizedEmail)) {
        return ZkKeyVaultService.fallbackMap.get(normalizedEmail) as CryptoKey;
      }
      return null;
    }

    return new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(normalizedEmail);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(result as CryptoKey);
        } else if (ZkKeyVaultService.fallbackMap.has(normalizedEmail)) {
          // Return from fallback map if IndexedDB returned null
          resolve(ZkKeyVaultService.fallbackMap.get(normalizedEmail) as CryptoKey);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        logError('Failed to load key from ZK vault', request.error);
        // Attempt fallback map on error
        if (ZkKeyVaultService.fallbackMap.has(normalizedEmail)) {
          resolve(ZkKeyVaultService.fallbackMap.get(normalizedEmail) as CryptoKey);
        } else {
          reject(request.error);
        }
      };
    });
  }

  /**
   * Deletes the key for a specific user. Called on logout.
   */
  async deleteKey(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const db = await this.openVault();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(normalizedEmail);

      request.onsuccess = () => {
        // Remove from fallback map as well
        ZkKeyVaultService.fallbackMap.delete(normalizedEmail);
        resolve();
      };
      request.onerror = () => {
        logError('Failed to delete key from ZK vault', request.error);
        // Ensure fallback map is cleared even on error
        ZkKeyVaultService.fallbackMap.delete(normalizedEmail);
        reject(request.error);
      };
    });
  }

  /**
   * Clears all keys from the vault. Used for full reset scenarios.
   */
  async clearAll(): Promise<void> {
    let db: IDBDatabase;

    try {
      db = await this.openVault();
    } catch (error) {
      ZkKeyVaultService.fallbackMap.clear();
      throw error;
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        // Clear fallback map as well
        ZkKeyVaultService.fallbackMap.clear();
        resolve();
      };
      request.onerror = () => {
        logError('Failed to clear ZK vault', request.error);
        ZkKeyVaultService.fallbackMap.clear();
        reject(request.error);
      };
    });
  }

  /** Stores a group's data key in the vault under group:${groupId} */
  async storeGroupKey(groupId: string, key: CryptoKey): Promise<boolean> {
    return this.storeKey(`group:${groupId}`, key);
  }

  /** Loads a group's data key from the vault by groupId */
  async loadGroupKey(groupId: string): Promise<CryptoKey | null> {
    return this.loadKey(`group:${groupId}`);
  }

  /** Deletes a group's data key from the vault by groupId */
  async deleteGroupKey(groupId: string): Promise<void> {
    return this.deleteKey(`group:${groupId}`);
  }

  /** Stores a user's private wrapping key in the vault under private_wrapping_key:${email} */
  async storePrivateWrappingKey(email: string, key: CryptoKey): Promise<boolean> {
    return this.storeKey(`private_wrapping_key:${email}`, key);
  }

  /** Loads a user's private wrapping key from the vault by email */
  async loadPrivateWrappingKey(email: string): Promise<CryptoKey | null> {
    return this.loadKey(`private_wrapping_key:${email}`);
  }

  /** Deletes a user's private wrapping key from the vault by email */
  async deletePrivateWrappingKey(email: string): Promise<void> {
    return this.deleteKey(`private_wrapping_key:${email}`);
  }
}
