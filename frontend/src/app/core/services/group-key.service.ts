import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngxs/store';
import { environment } from '../../../environments/environment';
import { ClientEncryptionService } from './encryption.service';
import { ZkKeyVaultService } from './zk-key-vault.service';

@Injectable({
  providedIn: 'root',
})
export class GroupKeyService {
  private http = inject(HttpClient);
  private encryptionService = inject(ClientEncryptionService);
  private zkVault = inject(ZkKeyVaultService);
  private store = inject(Store);
  private baseUrl = environment.apiBaseUrl;

  // ─── In-memory cache: groupId → CryptoKey ───────────────────────────────
  private groupKeysMemoryCache = new Map<string, CryptoKey>();

  // ─── Cached RSA-OAEP key pair for asymmetric envelope sharing ───────────
  private myAsymmetricKeys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;

  // ─── Concurrency deduplication: one in-flight request per groupId ────────
  private activeGroupKeyRequests = new Map<string, Promise<CryptoKey | null>>();

  // ─── Reactive UI signals ─────────────────────────────────────────────────
  rateLimitError = signal<string | null>(null);
  requiresKeyProvisioning = signal<boolean>(false);

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getSubtleCrypto(): SubtleCrypto {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto.subtle;
    }
    throw new Error('Web Cryptography API is not available');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API – components should normally call only ensureGroupKey()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Primary method for application code.
   *
   * Returns the group data key using the cache precedence:
   *   Memory → IndexedDB → Backend (unwrap) → Generate (owner/admin only)
   *
   * Deduplicates concurrent calls for the same groupId so only one
   * in-flight request exists at any time.
   */
  async ensureGroupKey(groupId: string): Promise<CryptoKey | null> {
    return this.getGroupDataKey(groupId);
  }

  /**
   * Returns the cached group data key or fetches/generates it.
   * Deduplicates concurrent calls for the same groupId.
   *
   * Cache order: Memory → IndexedDB → Backend → Generate
   */
  async getGroupDataKey(groupId: string): Promise<CryptoKey | null> {
    // 1. Memory cache hit
    if (this.groupKeysMemoryCache.has(groupId)) {
      return this.groupKeysMemoryCache.get(groupId)!;
    }

    // 2. Deduplicate concurrent requests
    if (this.activeGroupKeyRequests.has(groupId)) {
      return this.activeGroupKeyRequests.get(groupId)!;
    }

    const promise = this.fetchAndCacheGroupKey(groupId);
    this.activeGroupKeyRequests.set(groupId, promise);

    try {
      return await promise;
    } finally {
      this.activeGroupKeyRequests.delete(groupId);
    }
  }

  /**
   * Bypasses all caches and reloads the group key from the backend.
   * Intended for: post-provisioning, self-healing, key rotation.
   * NOT exposed in the UI — call from services only.
   */
  async refreshGroupKey(groupId: string): Promise<CryptoKey | null> {
    // Evict memory cache so fetchAndCacheGroupKey skips IndexedDB too
    this.groupKeysMemoryCache.delete(groupId);
    this.activeGroupKeyRequests.delete(groupId);

    // Also clear IndexedDB entry so we go all the way to the backend
    try {
      await this.zkVault.deleteGroupKey(groupId);
    } catch (e) {
      console.warn('Failed to clear IndexedDB group key during refresh', e);
    }

    const promise = this.fetchAndCacheGroupKey(groupId);
    this.activeGroupKeyRequests.set(groupId, promise);

    try {
      return await promise;
    } finally {
      this.activeGroupKeyRequests.delete(groupId);
    }
  }

  /**
   * Clears in-memory caches only. IndexedDB entries survive.
   * Safe to call at any time (e.g., on route change).
   */
  clearCache(): void {
    this.groupKeysMemoryCache.clear();
    this.activeGroupKeyRequests.clear();
    this.myAsymmetricKeys = null;
    this.rateLimitError.set(null);
    this.requiresKeyProvisioning.set(false);
  }

  /**
   * Clears both in-memory and IndexedDB persistent caches.
   * Use on logout or full reset.
   */
  async clearPersistentCache(): Promise<void> {
    this.clearCache();
    try {
      await this.zkVault.clearAll();
    } catch (e) {
      console.warn('Failed to clear IndexedDB vault', e);
    }
  }

  /**
   * Invalidates the cached key for a single group (memory only).
   * Does not touch IndexedDB.
   */
  invalidateGroupKey(groupId: string): void {
    this.groupKeysMemoryCache.delete(groupId);
    this.activeGroupKeyRequests.delete(groupId);
  }

  /**
   * @deprecated Use clearCache() for in-memory reset or clearPersistentCache() for full reset.
   */
  clearLocalState(): void {
    this.clearCache();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Key generation & provisioning
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Canonical implementation.
   * Generates a new AES-GCM group data key, wraps it symmetrically with
   * the caller's master key, persists it locally (memory + IndexedDB),
   * and posts the wrapped copy to the backend.
   *
   * Also pre-provisions the caller's RSA wrapping key pair so the caller
   * is immediately ready to share the group key with new members.
   */
  async createGroupKey(groupId: string): Promise<CryptoKey> {
    if (this.requiresKeyProvisioning()) {
      throw new Error(
        "Your group key hasn't been shared with you yet. Try refreshing, or contact the group owner."
      );
    }

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('No user session found');
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      throw new Error('Master key not loaded');
    }

    const groupKey = await this.encryptionService.generateDataKey();
    const wrappedKeyForSelf = await this.encryptionService.wrapKey(groupKey, masterKey);

    // Persist locally
    this.groupKeysMemoryCache.set(groupId, groupKey);
    try {
      await this.zkVault.storeGroupKey(groupId, groupKey);
    } catch (e) {
      console.warn('Failed to persist group key to IndexedDB', e);
    }

    // Post wrapped key to backend
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/groups/${groupId}/keys`, {
        keys: [
          {
            userId: user.userId ?? user.id,
            wrappedKey: wrappedKeyForSelf,
          },
        ],
      }),
    );

    // Pre-provision asymmetric key pair for future member sharing
    try {
      await this.getMyAsymmetricKeys();
    } catch (e) {
      console.warn('Failed to pre-provision personal asymmetric keys', e);
    }

    return groupKey;
  }

  /**
   * Thin wrapper kept for call-site clarity when the intent is
   * "create a key AND ensure members can receive it".
   * Delegates to createGroupKey() — single source of truth.
   */
  async createAndProvisionGroupKey(groupId: string): Promise<CryptoKey> {
    return this.createGroupKey(groupId);
  }

  /**
   * Wraps the group data key for another group member using their
   * public RSA-OAEP wrapping key and posts the result to the backend.
   */
  async provisionKeyForMember(groupId: string, targetUserId: string): Promise<void> {
    const groupKey = await this.getGroupDataKey(groupId);
    if (!groupKey) {
      throw new Error('Group key not loaded/available');
    }

    // Get target's public wrapping key
    const targetKeyRes = await firstValueFrom(
      this.http.get<{ data: { publicWrappingKey: string | null } }>(
        `${this.baseUrl}/users/${targetUserId}/public-key`,
      ),
    );

    const publicWrappingKeyStr = targetKeyRes?.data?.publicWrappingKey;
    if (!publicWrappingKeyStr) {
      console.warn(`Target user ${targetUserId} has not generated a public key yet.`);
      return;
    }

    // Import target's public key
    const subtle = this.getSubtleCrypto();
    const targetPublicKey = await subtle.importKey(
      'jwk',
      JSON.parse(publicWrappingKeyStr),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['wrapKey'],
    );

    // Wrap group key for target and post
    const wrappedKey = await this.encryptionService.wrapKey(groupKey, targetPublicKey);
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/groups/${groupId}/keys`, {
        keys: [{ userId: targetUserId, wrappedKey }],
      }),
    );
  }

  /**
   * Identifies group members who do not yet have the group key and
   * provisions it for each of them.
   * Safe to call speculatively — silently no-ops if all members have keys.
   */
  async checkAndProvisionMissingKeys(groupId: string): Promise<void> {
    try {
      const groupKey = await this.getGroupDataKey(groupId);
      if (!groupKey) {
        return; // Caller doesn't have the key; cannot provision for others
      }

      const res = await firstValueFrom(
        this.http.get<{ data: string[] }>(`${this.baseUrl}/groups/${groupId}/keys/missing`),
      );

      const missingUserIds = res?.data || [];
      if (missingUserIds.length === 0) {
        return;
      }

      console.info(`Found ${missingUserIds.length} members lacking group key. Provisioning...`);
      for (const uid of missingUserIds) {
        try {
          await this.provisionKeyForMember(groupId, uid);
        } catch (e) {
          console.warn(`Failed to provision key for member ${uid}`, e);
        }
      }
    } catch (e) {
      console.warn('Failed to check or provision missing group keys', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Asymmetric key management (RSA-OAEP wrapping key pair)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Loads or generates the user's RSA-OAEP wrapping key pair.
   * The private key is encrypted with the user's master key before
   * being stored on the backend. The public key is stored in plaintext.
   */
  async getMyAsymmetricKeys(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    if (this.myAsymmetricKeys) {
      return this.myAsymmetricKeys;
    }

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('User session not found');
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      throw new Error('Master encryption key not derived');
    }

    // Try loading existing key pair from backend
    const keysResponse = await firstValueFrom(
      this.http.get<{ data: { publicWrappingKey: string | null; encryptedPrivateWrappingKey: string | null } }>(
        `${this.baseUrl}/users/me/keys`,
      ),
    );

    const data = keysResponse.data;
    if (data && data.publicWrappingKey && data.encryptedPrivateWrappingKey) {
      const subtle = this.getSubtleCrypto();

      const publicKey = await subtle.importKey(
        'jwk',
        JSON.parse(data.publicWrappingKey),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['wrapKey'],
      );

      const privateKeyJwkStr = await this.encryptionService.decrypt(
        data.encryptedPrivateWrappingKey,
        masterKey,
      );
      const privateKey = await subtle.importKey(
        'jwk',
        JSON.parse(privateKeyJwkStr),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['unwrapKey'],
      );

      this.myAsymmetricKeys = { publicKey, privateKey };
      return this.myAsymmetricKeys;
    }

    // Generate new RSA-OAEP key pair
    const subtle = this.getSubtleCrypto();
    const keyPair = await subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['wrapKey', 'unwrapKey'],
    );

    const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJwk = await subtle.exportKey('jwk', keyPair.privateKey);
    const encryptedPrivateKeyStr = await this.encryptionService.encrypt(
      JSON.stringify(privateKeyJwk),
      masterKey,
    );

    await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/me/keys`, {
        publicWrappingKey: JSON.stringify(publicKeyJwk),
        encryptedPrivateWrappingKey: encryptedPrivateKeyStr,
      }),
    );

    this.myAsymmetricKeys = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
    return this.myAsymmetricKeys;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private fetch implementation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Internal fetch: IndexedDB → Backend (unwrap) → null
   *
   * On a successful backend fetch, the unwrapped CryptoKey is written to
   * both the in-memory cache and IndexedDB for future page loads.
   */
  private async fetchAndCacheGroupKey(groupId: string): Promise<CryptoKey | null> {
    // 1. IndexedDB cache
    try {
      const cachedKey = await this.zkVault.loadGroupKey(groupId);
      if (cachedKey) {
        this.groupKeysMemoryCache.set(groupId, cachedKey);
        this.requiresKeyProvisioning.set(false);
        return cachedKey;
      }
    } catch (e) {
      console.warn('Failed to load group key from IndexedDB', e);
    }

    // 2. Fetch from backend
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      return null;
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<{ data: { wrappedKey: string | null; groupKeyVersionId: string | null; hasActiveKeys?: boolean } }>(
          `${this.baseUrl}/groups/${groupId}/keys/me`,
        ),
      );

      const wrappedKey = response?.data?.wrappedKey;
      const versionId = response?.data?.groupKeyVersionId;
      const hasActiveKeys = response?.data?.hasActiveKeys ?? false;

      if (versionId && !wrappedKey && hasActiveKeys) {
        this.requiresKeyProvisioning.set(true);
      } else {
        this.requiresKeyProvisioning.set(false);
      }

      if (wrappedKey) {
        let unwrappedKey: CryptoKey;

        if (wrappedKey.includes(':')) {
          unwrappedKey = await this.encryptionService.unwrapKey(wrappedKey, masterKey);
        } else {
          const { privateKey } = await this.getMyAsymmetricKeys();
          unwrappedKey = await this.encryptionService.unwrapKey(wrappedKey, privateKey);
        }

        // Write to both caches so subsequent calls are instant
        this.groupKeysMemoryCache.set(groupId, unwrappedKey);
        try {
          await this.zkVault.storeGroupKey(groupId, unwrappedKey);
        } catch (e) {
          console.warn('Failed to store unwrapped group key in IndexedDB', e);
        }

        // Only clear requiresKeyProvisioning after successful unwrap and cache write
        this.requiresKeyProvisioning.set(false);
        this.rateLimitError.set(null);
        return unwrappedKey;
      }
    } catch (e: any) {
      console.error('Failed to unwrap group data key', e);
      this.requiresKeyProvisioning.set(true);
      if (e?.status === 429) {
        this.rateLimitError.set('Too many requests. Please try again later.');
      }
      throw e;
    }

    return null;
  }
}
