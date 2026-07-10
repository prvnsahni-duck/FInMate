import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngxs/store';
import { environment } from '../../../environments/environment';
import { ClientEncryptionService } from './encryption.service';
import { ZkKeyVaultService } from './zk-key-vault.service';
import { GroupKeyStatus } from '../models/decryption-state';

/**
 * Classified outcome of resolving a group data key. `ready` carries the key;
 * every other variant is a distinct, actionable reason it is unavailable.
 */
export type GroupKeyResult =
  | { status: 'ready'; key: CryptoKey }
  | { status: Exclude<GroupKeyStatus, 'ready'>; error?: unknown };

@Injectable({
  providedIn: 'root',
})
export class GroupKeyService {
  private http = inject(HttpClient);
  private encryptionService = inject(ClientEncryptionService);
  private zkVault = inject(ZkKeyVaultService);
  private store = inject(Store);
  private baseUrl = environment.apiBaseUrl;

  // Cache keyed by `${groupId}:${groupKeyVersionId}` to avoid stale-key usage
  private groupKeysMemoryCache = new Map<string, CryptoKey>();
  private myAsymmetricKeys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
  rateLimitError = signal<string | null>(null);

  private buildVersionedKey(groupId: string, groupKeyVersionId?: string | null): string {
    return `${groupId}:${groupKeyVersionId ?? 'active'}`;
  }

  private getSubtleCrypto(): SubtleCrypto {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto.subtle;
    }
    throw new Error('Web Cryptography API is not available');
  }

  /**
   * Helper to load or generate RSA-OAEP key pair for asymmetric envelope key sharing.
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

    // Check backend first
    const keysResponse = await firstValueFrom(
      this.http.get<{ data: { publicWrappingKey: string | null; encryptedPrivateWrappingKey: string | null } }>(
        `${this.baseUrl}/users/me/keys`,
      ),
    );

    const data = keysResponse.data;
    if (data && data.publicWrappingKey && data.encryptedPrivateWrappingKey) {
      const subtle = this.getSubtleCrypto();
      // Import public key
      const publicKey = await subtle.importKey(
        'jwk',
        JSON.parse(data.publicWrappingKey),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['wrapKey'],
      );

      // Decrypt and import private key
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

    // Export public key
    const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
    const publicKeyStr = JSON.stringify(publicKeyJwk);

    // Export private key and encrypt it
    const privateKeyJwk = await subtle.exportKey('jwk', keyPair.privateKey);
    const privateKeyStr = JSON.stringify(privateKeyJwk);
    const encryptedPrivateKeyStr = await this.encryptionService.encrypt(
      privateKeyStr,
      masterKey,
    );

    // Post to server
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/me/keys`, {
        publicWrappingKey: publicKeyStr,
        encryptedPrivateWrappingKey: encryptedPrivateKeyStr,
      }),
    );

    this.myAsymmetricKeys = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
    return this.myAsymmetricKeys;
  }

  private activeGroupKeyRequests = new Map<string, Promise<GroupKeyResult>>();

  clearLocalState(): void {
    this.groupKeysMemoryCache.clear();
    this.activeGroupKeyRequests.clear();
    this.myAsymmetricKeys = null;
    this.rateLimitError.set(null);
  }

  /**
   * Single source of truth for group-key availability.
   *
   * Returns a *classified* result so callers can distinguish a key that is
   * merely not provisioned yet (temporary, auto-recoverable) from one that will
   * never be available (removed from group), from transient conditions
   * (rate-limit, missing session). Checks in-memory cache -> deduplicated
   * in-flight request -> IndexedDB vault -> server (and unwraps).
   */
  async resolveGroupKey(groupId: string, groupKeyVersionId?: string): Promise<GroupKeyResult> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);
    const cached = this.groupKeysMemoryCache.get(requestKey);
    if (cached) {
      return { status: 'ready', key: cached };
    }

    const inFlight = this.activeGroupKeyRequests.get(requestKey);
    if (inFlight) {
      return await inFlight;
    }

    const promise = this.fetchAndCacheGroupKey(groupId, groupKeyVersionId);
    this.activeGroupKeyRequests.set(requestKey, promise);

    try {
      return await promise;
    } finally {
      this.activeGroupKeyRequests.delete(requestKey);
    }
  }

  /**
   * Backwards-compatible accessor used by the encryption (write) paths and
   * attachment download. Returns the key, or `null` for any non-ready result.
   */
  async getGroupDataKey(groupId: string, groupKeyVersionId?: string): Promise<CryptoKey | null> {
    const result = await this.resolveGroupKey(groupId, groupKeyVersionId);
    return result.status === 'ready' ? result.key : null;
  }

  private async fetchAndCacheGroupKey(groupId: string, groupKeyVersionId?: string): Promise<GroupKeyResult> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);
    // Try IndexedDB first
    try {
      const cachedKey = await this.zkVault.loadGroupKey(requestKey);
      if (cachedKey) {
        this.groupKeysMemoryCache.set(requestKey, cachedKey);
        return { status: 'ready', key: cachedKey };
      }
    } catch (e) {
      console.warn('Failed to load group key from IndexedDB', e);
    }

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      return { status: 'no_session' };
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      return { status: 'no_session' };
    }

    // Fetch wrapped key from server. Ask server for the caller's wrapped key for the active version.
    try {
      const url = `${this.baseUrl}/groups/${groupId}/keys/me` + (groupKeyVersionId ? `?versionId=${groupKeyVersionId}` : '');
      const response = await firstValueFrom(
        this.http.get<{ data: { wrappedKey: string | null; groupKeyVersionId?: string } }>(
          url,
        ),
      );

      const wrappedKey = response?.data?.wrappedKey;
      const returnedVersionId = response?.data?.groupKeyVersionId ?? groupKeyVersionId ?? 'active';
      if (!wrappedKey) {
        // Server has no wrapped key for this member/version yet.
        return { status: 'pending' };
      }

      let unwrappedKey: CryptoKey;
      if (wrappedKey.includes(':')) {
        // Wrapped symmetrically with the user's master key
        unwrappedKey = await this.encryptionService.unwrapKey(wrappedKey, masterKey);
      } else {
        // Wrapped asymmetrically with the user's public wrapping key
        const { privateKey } = await this.getMyAsymmetricKeys();
        unwrappedKey = await this.encryptionService.unwrapKey(wrappedKey, privateKey);
      }

      // Cache under both the concrete returned version and the requested alias
      // so later lookups (which carry the concrete versionId) hit memory.
      this.groupKeysMemoryCache.set(this.buildVersionedKey(groupId, returnedVersionId), unwrappedKey);
      this.groupKeysMemoryCache.set(requestKey, unwrappedKey);
      try {
        await this.zkVault.storeGroupKey(this.buildVersionedKey(groupId, returnedVersionId), unwrappedKey);
      } catch (e) {
        console.warn('Failed to store unwrapped group key in IndexedDB', e);
      }
      this.rateLimitError.set(null);
      return { status: 'ready', key: unwrappedKey };
    } catch (e: any) {
      // Backend-status → classified reason. A wrapped key that simply is not
      // provisioned yet is temporary; a revoked membership is permanent.
      if (e?.status === 400 && e?.error?.errorCode === 'GRP_KEY_MISSING') {
        return { status: 'pending' };
      }
      if (e?.status === 404) {
        // Key/version resource not found for this member yet.
        return { status: 'pending' };
      }
      if (e?.status === 403) {
        return { status: 'no_access' };
      }
      if (e?.status === 400) {
        // e.g. "You do not have access to this group" — membership revoked.
        return { status: 'no_access' };
      }
      if (e?.status === 429) {
        this.rateLimitError.set('Too many requests. Please try again later.');
        return { status: 'rate_limited' };
      }
      return { status: 'error', error: e };
    }
  }

  /**
   * Generates a new group key, wraps it for self symmetrically, and posts to server.
   */
  async createAndStoreGroupKey(groupId: string): Promise<CryptoKey> {
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

    // Save locally
    const cacheKey = this.buildVersionedKey(groupId, 'active');
    this.groupKeysMemoryCache.set(cacheKey, groupKey);
    await this.zkVault.storeGroupKey(cacheKey, groupKey);

    // Post to server
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

    // Also trigger asymmetric key provisioning so we're ready to share with others
    try {
      await this.getMyAsymmetricKeys();
    } catch (e) {
      console.warn('Failed to pre-provision personal asymmetric keys', e);
    }

    return groupKey;
  }

  /**
   * Wraps the group data key for another group member.
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

    // Wrap group key for target
    const wrappedKey = await this.encryptionService.wrapKey(groupKey, targetPublicKey);

    // Post wrapped key to server
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/groups/${groupId}/keys`, {
        keys: [
          {
            userId: targetUserId,
            wrappedKey,
          },
        ],
      }),
    );
  }

  /**
   * Identifies any group members who do not have the group key wrapped for them yet,
   * and provisions/wraps the key for them using their public wrapping keys.
   */
  async checkAndProvisionMissingKeys(groupId: string): Promise<void> {
    try {
      const groupKey = await this.getGroupDataKey(groupId);
      if (!groupKey) {
        return; // Group key not available/loaded for caller, cannot provision for others
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
}
