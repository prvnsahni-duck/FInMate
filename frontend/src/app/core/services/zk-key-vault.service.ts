import { Injectable, InjectionToken, inject } from '@angular/core';

export const ZK_DB_NAME = new InjectionToken<string>('ZK_DB_NAME', {
  providedIn: 'root',
  factory: () => 'finmate_zk_vault',
});

const DB_VERSION = 1;
const STORE_NAME = 'keys';

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
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        console.error('Failed to open ZK vault IndexedDB', request.error);
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Stores a CryptoKey in the vault, keyed by the user's email (lowercased).
   */
  async storeKey(email: string, key: CryptoKey): Promise<void> {
    const db = await this.openVault();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(key, email.toLowerCase());

      request.onsuccess = () => {
        // Also store in fallback map for environments where IndexedDB cannot persist CryptoKey
        ZkKeyVaultService.fallbackMap.set(email.toLowerCase(), key);
        resolve();
      };
      request.onerror = () => {
        console.error('Failed to store key in ZK vault', request.error);
        // Fallback to in-memory storage even on error
        ZkKeyVaultService.fallbackMap.set(email.toLowerCase(), key);
        resolve();
        //reject(request.error);
      };
    });
  }

  /**
   * Retrieves a CryptoKey from the vault by email.
   * Returns null if no key exists for the given email.
   */
  async loadKey(email: string): Promise<CryptoKey | null> {
    const db = await this.openVault();
    return new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(email.toLowerCase());

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(result as CryptoKey);
        } else if (ZkKeyVaultService.fallbackMap.has(email.toLowerCase())) {
          // Return from fallback map if IndexedDB returned null
          resolve(ZkKeyVaultService.fallbackMap.get(email.toLowerCase()) as CryptoKey);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('Failed to load key from ZK vault', request.error);
        // Attempt fallback map on error
        if (ZkKeyVaultService.fallbackMap.has(email.toLowerCase())) {
          resolve(ZkKeyVaultService.fallbackMap.get(email.toLowerCase()) as CryptoKey);
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
    const db = await this.openVault();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(email.toLowerCase());

      request.onsuccess = () => {
        // Remove from fallback map as well
        ZkKeyVaultService.fallbackMap.delete(email.toLowerCase());
        resolve();
      };
      request.onerror = () => {
        console.error('Failed to delete key from ZK vault', request.error);
        // Ensure fallback map is cleared even on error
        ZkKeyVaultService.fallbackMap.delete(email.toLowerCase());
        reject(request.error);
      };
    });
  }

  /**
   * Clears all keys from the vault. Used for full reset scenarios.
   */
  async clearAll(): Promise<void> {
    const db = await this.openVault();
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
        console.error('Failed to clear ZK vault', request.error);
        reject(request.error);
      };
    });
  }
}
