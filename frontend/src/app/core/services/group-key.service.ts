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
  | { status: 'ready'; key: CryptoKey; versionId?: string }
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

  // ─── In-memory cache keyed by `${groupId}:${groupKeyVersionId}` ──────────
  private groupKeysMemoryCache = new Map<string, CryptoKey>();

  // ─── Concrete ACTIVE version id per group, learned from the backend. Lets
  //     write paths declare which version their ciphertext was produced with. ─
  private activeGroupKeyVersionIds = new Map<string, string>();

  // ─── Cached RSA-OAEP key pair for asymmetric envelope sharing ───────────
  private myAsymmetricKeys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;

  // ─── Concurrency deduplication: one in-flight request per versioned key ──
  private activeGroupKeyRequests = new Map<string, Promise<GroupKeyResult>>();

  // ─── Reactive UI signals ─────────────────────────────────────────────────
  rateLimitError = signal<string | null>(null);
  requiresKeyProvisioning = signal<boolean>(false);

  // ─── Private helpers ──────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // Public API – components should normally call only ensureGroupKey()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Primary method for application code.
   *
   * Returns the group data key using the cache precedence:
   *   Memory → IndexedDB → Backend (unwrap)
   *
   * Deduplicates concurrent calls for the same groupId so only one
   * in-flight request exists at any time.
   */
  async ensureGroupKey(groupId: string): Promise<CryptoKey | null> {
    return this.getGroupDataKey(groupId);
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
      return {
        status: 'ready',
        key: cached,
        versionId: groupKeyVersionId ?? this.activeGroupKeyVersionIds.get(groupId),
      };
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

  /**
   * Write-path resolver: returns the group key together with the concrete
   * key-version id it belongs to, so callers can declare which version their
   * ciphertext was produced with. A previously learned (key, versionId) pair
   * is served from cache — even if since superseded, the pair is internally
   * consistent so the stamp stays correct. Only when the concrete version is
   * unknown (e.g. the 'active' alias was restored from IndexedDB after a
   * reload) is the alias evicted and resolution forced through the backend.
   */
  async getGroupKeyForEncryption(
    groupId: string,
  ): Promise<{ key: CryptoKey; versionId: string } | null> {
    const knownVersionId = this.activeGroupKeyVersionIds.get(groupId);
    if (knownVersionId) {
      const key = await this.getGroupDataKey(groupId, knownVersionId);
      if (key) {
        return { key, versionId: knownVersionId };
      }
    }

    const aliasKey = this.buildVersionedKey(groupId);
    this.groupKeysMemoryCache.delete(aliasKey);
    this.activeGroupKeyRequests.delete(aliasKey);
    try {
      await this.zkVault.deleteGroupKey(aliasKey);
    } catch (e) {
      console.warn('Failed to evict aliased group key from IndexedDB', e);
    }

    const result = await this.resolveGroupKey(groupId);
    if (result.status === 'ready' && result.versionId) {
      return { key: result.key, versionId: result.versionId };
    }
    return null;
  }

  /** Last concrete ACTIVE version id learned from the backend for this group. */
  getKnownActiveVersionId(groupId: string): string | undefined {
    return this.activeGroupKeyVersionIds.get(groupId);
  }

  /**
   * Bypasses all caches and reloads the group key from the backend.
   * Intended for: post-provisioning, self-healing, key rotation.
   * NOT exposed in the UI — call from services only.
   */
  async refreshGroupKey(groupId: string, groupKeyVersionId?: string): Promise<CryptoKey | null> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);

    // Evict every cached entry for this group so we go all the way to the backend
    for (const key of Array.from(this.groupKeysMemoryCache.keys())) {
      if (key.startsWith(`${groupId}:`)) {
        this.groupKeysMemoryCache.delete(key);
      }
    }
    this.activeGroupKeyRequests.delete(requestKey);
    this.activeGroupKeyVersionIds.delete(groupId);

    try {
      await this.zkVault.deleteGroupKey(requestKey);
    } catch (e) {
      console.warn('Failed to clear IndexedDB group key during refresh', e);
    }

    const promise = this.fetchAndCacheGroupKey(groupId, groupKeyVersionId);
    this.activeGroupKeyRequests.set(requestKey, promise);

    try {
      const result = await promise;
      return result.status === 'ready' ? result.key : null;
    } finally {
      this.activeGroupKeyRequests.delete(requestKey);
    }
  }

  /**
   * Clears in-memory caches only. IndexedDB entries survive.
   * Safe to call at any time (e.g., on route change).
   */
  clearCache(): void {
    this.groupKeysMemoryCache.clear();
    this.activeGroupKeyRequests.clear();
    this.activeGroupKeyVersionIds.clear();
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
   * Invalidates the cached keys for a single group (memory only).
   * Does not touch IndexedDB.
   */
  invalidateGroupKey(groupId: string): void {
    for (const key of Array.from(this.groupKeysMemoryCache.keys())) {
      if (key.startsWith(`${groupId}:`)) {
        this.groupKeysMemoryCache.delete(key);
      }
    }
    for (const key of Array.from(this.activeGroupKeyRequests.keys())) {
      if (key.startsWith(`${groupId}:`)) {
        this.activeGroupKeyRequests.delete(key);
      }
    }
    this.activeGroupKeyVersionIds.delete(groupId);
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
   * Guarded: refuses to generate when the backend reports an existing active
   * key that simply has not been shared with this member yet (prevents
   * duplicate group keys).
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

    // Persist locally under the active-version alias
    const cacheKey = this.buildVersionedKey(groupId, 'active');
    this.groupKeysMemoryCache.set(cacheKey, groupKey);
    try {
      await this.zkVault.storeGroupKey(cacheKey, groupKey);
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

    // Learn the concrete version id the backend bound the wrapped key to, so
    // write paths can declare it (ciphertext / version-stamp consistency).
    try {
      const versionResponse = await firstValueFrom(
        this.http.get<{ data: { groupKeyVersionId: string | null } }>(
          `${this.baseUrl}/groups/${groupId}/keys/me`,
        ),
      );
      const mintedVersionId = versionResponse?.data?.groupKeyVersionId;
      if (mintedVersionId) {
        this.activeGroupKeyVersionIds.set(groupId, mintedVersionId);
        const versionedCacheKey = this.buildVersionedKey(groupId, mintedVersionId);
        this.groupKeysMemoryCache.set(versionedCacheKey, groupKey);
        try {
          await this.zkVault.storeGroupKey(versionedCacheKey, groupKey);
        } catch (e) {
          console.warn('Failed to persist versioned group key to IndexedDB', e);
        }
      }
    } catch (e) {
      console.warn('Failed to resolve minted group key version id', e);
    }

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
   * Alias retained for call sites written against the v2 decryption
   * architecture. Delegates to createGroupKey() — single source of truth.
   */
  async createAndStoreGroupKey(groupId: string): Promise<CryptoKey> {
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
   * Owner/admin rotation flow: generates a fresh group data key, wraps it for
   * every active/invited member (master-key wrap for self, RSA-OAEP for
   * others), and posts the set to POST /groups/:id/keys/rotate. Historical
   * versions stay decryptable via their per-expense version stamps; local
   * caches are moved to the new ACTIVE version. Members whose public wrapping
   * key is unavailable are reported back so the caller can surface follow-up
   * provisioning.
   */
  async rotateGroupKey(
    groupId: string,
    reason?: string,
  ): Promise<{ groupKeyVersionId: string | null; skippedUserIds: string[] }> {
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('No user session found');
    }
    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      throw new Error('Master key not loaded');
    }
    const selfId = user.userId ?? user.id;

    const newKey = await this.encryptionService.generateDataKey();

    const membersRes = await firstValueFrom(
      this.http.get<{ data: Array<{ user?: { id: string }; joinStatus: string }> }>(
        `${this.baseUrl}/groups/${groupId}/members`,
      ),
    );
    const members = (membersRes?.data ?? []).filter(
      (m) => m.user?.id && (m.joinStatus === 'active' || m.joinStatus === 'invited'),
    );

    const keys: Array<{ userId: string; wrappedKey: string }> = [];
    const skippedUserIds: string[] = [];
    const subtle = this.getSubtleCrypto();

    for (const member of members) {
      const uid = member.user?.id as string;
      if (uid === selfId) {
        keys.push({
          userId: uid,
          wrappedKey: await this.encryptionService.wrapKey(newKey, masterKey),
        });
        continue;
      }
      try {
        const keyRes = await firstValueFrom(
          this.http.get<{ data: { publicWrappingKey: string | null } }>(
            `${this.baseUrl}/users/${uid}/public-key`,
          ),
        );
        const publicWrappingKeyStr = keyRes?.data?.publicWrappingKey;
        if (!publicWrappingKeyStr) {
          skippedUserIds.push(uid);
          continue;
        }
        const targetPublicKey = await subtle.importKey(
          'jwk',
          JSON.parse(publicWrappingKeyStr),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['wrapKey'],
        );
        keys.push({
          userId: uid,
          wrappedKey: await this.encryptionService.wrapKey(newKey, targetPublicKey),
        });
      } catch (e) {
        console.warn(`Failed to wrap rotated key for member ${uid}`, e);
        skippedUserIds.push(uid);
      }
    }

    if (keys.length === 0) {
      throw new Error('Could not wrap the rotated key for any member');
    }

    const rotateRes = await firstValueFrom(
      this.http.post<{ data: { groupKeyVersionId: string } }>(
        `${this.baseUrl}/groups/${groupId}/keys/rotate`,
        { reason, keys },
      ),
    );
    const newVersionId = rotateRes?.data?.groupKeyVersionId ?? null;

    // Move local caches to the new ACTIVE version.
    this.invalidateGroupKey(groupId);
    const aliasKey = this.buildVersionedKey(groupId);
    try {
      await this.zkVault.deleteGroupKey(aliasKey);
    } catch (e) {
      console.warn('Failed to evict aliased group key during rotation', e);
    }
    if (newVersionId) {
      this.activeGroupKeyVersionIds.set(groupId, newVersionId);
      const versionedCacheKey = this.buildVersionedKey(groupId, newVersionId);
      this.groupKeysMemoryCache.set(versionedCacheKey, newKey);
      this.groupKeysMemoryCache.set(aliasKey, newKey);
      try {
        await this.zkVault.storeGroupKey(versionedCacheKey, newKey);
      } catch (e) {
        console.warn('Failed to persist rotated group key to IndexedDB', e);
      }
    }

    return { groupKeyVersionId: newVersionId, skippedUserIds };
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
   * Internal fetch: IndexedDB → Backend (unwrap) → classified result.
   *
   * On a successful backend fetch, the unwrapped CryptoKey is written to
   * both the in-memory cache and IndexedDB for future page loads, under the
   * concrete returned version id as well as the requested alias.
   *
   * Also maintains the `requiresKeyProvisioning` signal: it is set only when
   * the group has an active key wrapped for *other* members but not for the
   * caller (pending provisioning), which prevents both the owner-deadlock on
   * brand-new groups and duplicate group-key generation.
   */
  private async fetchAndCacheGroupKey(groupId: string, groupKeyVersionId?: string): Promise<GroupKeyResult> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);

    // 1. IndexedDB cache
    try {
      const cachedKey = await this.zkVault.loadGroupKey(requestKey);
      if (cachedKey) {
        this.groupKeysMemoryCache.set(requestKey, cachedKey);
        this.requiresKeyProvisioning.set(false);
        return { status: 'ready', key: cachedKey };
      }
    } catch (e) {
      console.warn('Failed to load group key from IndexedDB', e);
    }

    // 2. Fetch from backend
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      return { status: 'no_session' };
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
    if (!masterKey) {
      return { status: 'no_session' };
    }

    try {
      const url =
        `${this.baseUrl}/groups/${groupId}/keys/me` +
        (groupKeyVersionId ? `?versionId=${groupKeyVersionId}` : '');
      const response = await firstValueFrom(
        this.http.get<{ data: { wrappedKey: string | null; groupKeyVersionId: string | null; hasActiveKeys?: boolean } }>(
          url,
        ),
      );

      const wrappedKey = response?.data?.wrappedKey;
      const returnedVersionId = response?.data?.groupKeyVersionId ?? groupKeyVersionId ?? 'active';
      const hasActiveKeys = response?.data?.hasActiveKeys ?? false;

      if (!wrappedKey) {
        // Server has no wrapped key for this member/version yet. Flag
        // provisioning only when the key exists for others (deadlock fix):
        // a brand-new group with no keys at all must stay unflagged so the
        // owner can generate the first key.
        this.requiresKeyProvisioning.set(
          Boolean(response?.data?.groupKeyVersionId) && hasActiveKeys,
        );
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

      // An unversioned request resolves the ACTIVE version — remember its
      // concrete id so write paths can declare it on their ciphertext.
      if (!groupKeyVersionId && returnedVersionId !== 'active') {
        this.activeGroupKeyVersionIds.set(groupId, returnedVersionId);
      }

      // Only clear requiresKeyProvisioning after successful unwrap and cache write
      this.requiresKeyProvisioning.set(false);
      this.rateLimitError.set(null);
      return {
        status: 'ready',
        key: unwrappedKey,
        versionId: returnedVersionId !== 'active' ? returnedVersionId : undefined,
      };
    } catch (e: any) {
      // Backend-status → classified reason. A wrapped key that simply is not
      // provisioned yet is temporary; a revoked membership is permanent.
      if (e?.status === 400 && e?.error?.errorCode === 'GRP_KEY_MISSING') {
        this.requiresKeyProvisioning.set(true);
        return { status: 'pending' };
      }
      if (e?.status === 404) {
        // Key/version resource not found for this member yet.
        this.requiresKeyProvisioning.set(true);
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
}
