import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngxs/store';
import { environment } from '../../../environments/environment';
import { ClientEncryptionService } from './encryption.service';
import { ZkKeyVaultService } from './zk-key-vault.service';
import { GroupKeyStatus } from '../models/decryption-state';
import { normalizeRecoveryCode } from './recovery-code.util';

/**
 * Classified outcome of resolving a group data key. `ready` carries the key;
 * every other variant is a distinct, actionable reason it is unavailable.
 */
export type GroupKeyResult =
  | { status: 'ready'; key: CryptoKey; versionId?: string }
  | { status: Exclude<GroupKeyStatus, 'ready'>; error?: unknown };

interface GroupKeyCacheEntry {
  key: CryptoKey;
  /** Wrapped-key ciphertext as received from the backend — kept in memory for
   *  diagnostic retries within the session; never written to any persistent store. */
  wrappedKey?: string;
  /** Concrete group-key version ID this entry belongs to. */
  versionId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GroupKeyService {
  private http = inject(HttpClient);
  private encryptionService = inject(ClientEncryptionService);
  private zkVault = inject(ZkKeyVaultService);
  private store = inject(Store);
  private baseUrl = environment.apiBaseUrl;

  // ─── Session-scoped in-memory cache — never persisted ────────────────────
  // Keyed by `${groupId}:${groupKeyVersionId}` (or `${groupId}:active` alias)
  private groupKeysMemoryCache = new Map<string, GroupKeyCacheEntry>();

  // ─── Concrete ACTIVE version id per group, learned from the backend. Lets
  //     write paths declare which version their ciphertext was produced with. ─
  private activeGroupKeyVersionIds = new Map<string, string>();

  // ─── Cached RSA-OAEP key pair for asymmetric envelope sharing ───────────
  private myAsymmetricKeys: {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  } | null = null;

  // ─── Concurrency deduplication: one in-flight request per versioned key ──
  private activeGroupKeyRequests = new Map<string, Promise<GroupKeyResult>>();

  // ─── Reactive UI signals ─────────────────────────────────────────────────
  rateLimitError = signal<string | null>(null);
  requiresKeyProvisioning = signal<boolean>(false);

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildVersionedKey(
    groupId: string,
    groupKeyVersionId?: string | null,
  ): string {
    return `${groupId}:${groupKeyVersionId ?? 'active'}`;
  }

  private getSubtleCrypto(): SubtleCrypto {
    if (
      typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle
    ) {
      return window.crypto.subtle;
    }
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.crypto &&
      globalThis.crypto.subtle
    ) {
      return globalThis.crypto.subtle;
    }
    throw new Error('Web Cryptography API is not available');
  }

  private unwrapHttpData<T>(
    response: T | { data: T } | null | undefined,
  ): T | undefined {
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data: T }).data;
    }
    return response ?? undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API – components should normally call only ensureGroupKey()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Primary method for application code.
   *
   * Returns the group data key using the cache precedence:
   *   Memory → Backend (unwrap)
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
   * (rate-limit, missing session). Checks in-memory cache → deduplicated
   * in-flight request → server (and unwraps).
   */
  async resolveGroupKey(
    groupId: string,
    groupKeyVersionId?: string,
  ): Promise<GroupKeyResult> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);
    const cached = this.groupKeysMemoryCache.get(requestKey);
    if (cached) {
      return {
        status: 'ready',
        key: cached.key,
        versionId:
          groupKeyVersionId ??
          cached.versionId ??
          this.activeGroupKeyVersionIds.get(groupId),
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
  async getGroupDataKey(
    groupId: string,
    groupKeyVersionId?: string,
  ): Promise<CryptoKey | null> {
    const result = await this.resolveGroupKey(groupId, groupKeyVersionId);
    return result.status === 'ready' ? result.key : null;
  }

  /**
   * Write-path resolver: returns the group key together with the concrete
   * key-version id it belongs to, so callers can declare which version their
   * ciphertext was produced with. A previously learned (key, versionId) pair
   * is served from cache — even if since superseded, the pair is internally
   * consistent so the stamp stays correct. Only when the concrete version is
   * unknown (e.g. the 'active' alias was not yet resolved this session) is the
   * alias evicted and resolution forced through the backend.
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
   * Clears the session-scoped in-memory key cache. Decrypted group keys are
   * never persisted, so this is a complete wipe for the current session.
   * Safe to call at any time (e.g., on route change or logout).
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
   * Clears the in-memory cache and removes any legacy group-key data that may
   * have been written to IndexedDB by older app versions.
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
   * Invalidates the cached keys for a single group.
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

  // ─────────────────────────────────────────────────────────────────────────
  // Key generation & provisioning
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Canonical implementation.
   * Generates a new AES-GCM group data key, wraps it symmetrically with
   * the caller's master key, caches it in memory, and posts the wrapped copy
   * to the backend.
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
        "Your group key hasn't been shared with you yet. Try refreshing, or contact the group owner.",
      );
    }

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('No user session found');
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(
      user.email,
    );
    if (!masterKey) {
      throw new Error('Master key not loaded');
    }

    // Wrap the caller's own copy under their RSA public wrapping key — NOT the
    // password-derived master key. The account-recovery flow can restore the
    // RSA private key (it is re-wrapped under the new master key on reset), but
    // it can never restore the old master key. Wrapping under the master key
    // would silently orphan this group's data on any password reset.
    const { publicKey } = await this.getMyAsymmetricKeys();

    const groupKey = await this.encryptionService.generateDataKey();
    const wrappedKeyForSelf = await this.encryptionService.wrapKey(
      groupKey,
      publicKey,
    );

    // Optimistically cache under the active-version alias; updated below once
    // the backend confirms the concrete version id.
    const cacheKey = this.buildVersionedKey(groupId, 'active');
    this.groupKeysMemoryCache.set(cacheKey, {
      key: groupKey,
      wrappedKey: wrappedKeyForSelf,
    });

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
    //
    // A concurrent createGroupKey() call may have stored a DIFFERENT wrapped
    // key before ours arrived. The backend's idempotent guard silently ignores
    // the duplicate POST, so the key actually in the DB may differ from the
    // one we just generated. We detect this by comparing the wrappedKey the
    // backend echoes back; when they differ we unwrap the backend's key and
    // use that as the canonical key — ensuring the cache and the ciphertext
    // we are about to produce all agree with what is stored.
    let canonicalKey = groupKey;
    let canonicalWrappedKey = wrappedKeyForSelf;
    try {
      const versionResponse = await firstValueFrom(
        this.http.get<
          | {
              groupKeyVersionId: string | null;
              wrappedKey?: string | null;
            }
          | {
              data: {
                groupKeyVersionId: string | null;
                wrappedKey?: string | null;
              };
            }
        >(`${this.baseUrl}/groups/${groupId}/keys/me`),
      );
      const versionData = this.unwrapHttpData(versionResponse);
      const mintedVersionId = versionData?.groupKeyVersionId;
      const storedWrappedKey = versionData?.wrappedKey;

      // If the backend has a different wrapped key (race condition), unwrap
      // it so the canonical key matches what every future session will fetch.
      if (storedWrappedKey && storedWrappedKey !== wrappedKeyForSelf) {
        try {
          // extractable: true — must match generateDataKey() so the key can
          // later be re-wrapped when provisioning keys for new members.
          // A stored key may be RSA-wrapped (new default) or, for older
          // accounts, symmetrically wrapped under the master key (`iv:ct`).
          canonicalKey = storedWrappedKey.includes(':')
            ? await this.encryptionService.unwrapKey(
                storedWrappedKey,
                masterKey,
                true,
              )
            : await this.encryptionService.unwrapKey(
                storedWrappedKey,
                (await this.getMyAsymmetricKeys()).privateKey,
                true,
              );
          canonicalWrappedKey = storedWrappedKey;
        } catch (e) {
          console.warn(
            'Failed to unwrap concurrent key from backend; falling back to generated key',
            e,
          );
          canonicalKey = groupKey;
          canonicalWrappedKey = wrappedKeyForSelf;
        }
      }

      if (mintedVersionId) {
        this.activeGroupKeyVersionIds.set(groupId, mintedVersionId);
        const versionedCacheKey = this.buildVersionedKey(
          groupId,
          mintedVersionId,
        );
        const entry: GroupKeyCacheEntry = {
          key: canonicalKey,
          wrappedKey: canonicalWrappedKey,
          versionId: mintedVersionId,
        };
        this.groupKeysMemoryCache.set(versionedCacheKey, entry);
        // Promote the :active alias to the fully-resolved entry.
        this.groupKeysMemoryCache.set(cacheKey, entry);
      } else {
        // No version id yet — update :active with the canonical key.
        this.groupKeysMemoryCache.set(cacheKey, {
          key: canonicalKey,
          wrappedKey: canonicalWrappedKey,
        });
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

    return canonicalKey;
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
  async provisionKeyForMember(
    groupId: string,
    targetUserId: string,
  ): Promise<void> {
    const groupKey = await this.getGroupDataKey(groupId);
    if (!groupKey) {
      throw new Error('Group key not loaded/available');
    }

    // Get target's public wrapping key
    const targetKeyRes = await firstValueFrom(
      this.http.get<
        | { publicWrappingKey: string | null }
        | { data: { publicWrappingKey: string | null } }
      >(`${this.baseUrl}/users/${targetUserId}/public-key`),
    );

    const targetKeyData = this.unwrapHttpData(targetKeyRes);
    const publicWrappingKeyStr = targetKeyData?.publicWrappingKey;
    if (!publicWrappingKeyStr) {
      console.warn(
        `Target user ${targetUserId} has not generated a public key yet.`,
      );
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
    const wrappedKey = await this.encryptionService.wrapKey(
      groupKey,
      targetPublicKey,
    );
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
    // Loads the RSA wrapping pair (and enforces an unlocked crypto session).
    // The caller's own copy is wrapped under this public key — not the master
    // key — so the rotated key survives a future password reset.
    const { publicKey: selfPublicKey } = await this.getMyAsymmetricKeys();
    const selfId = user.userId ?? user.id;

    const newKey = await this.encryptionService.generateDataKey();

    const membersRes = await firstValueFrom(
      this.http.get<
        | Array<{ user?: { id: string }; joinStatus: string }>
        | { data: Array<{ user?: { id: string }; joinStatus: string }> }
      >(`${this.baseUrl}/groups/${groupId}/members`),
    );
    const members = (this.unwrapHttpData(membersRes) ?? []).filter(
      (m) =>
        m.user?.id && (m.joinStatus === 'active' || m.joinStatus === 'invited'),
    );

    const keys: Array<{ userId: string; wrappedKey: string }> = [];
    const skippedUserIds: string[] = [];
    const subtle = this.getSubtleCrypto();
    let selfWrappedKey: string | undefined;

    for (const member of members) {
      const uid = member.user?.id as string;
      if (uid === selfId) {
        const wk = await this.encryptionService.wrapKey(newKey, selfPublicKey);
        selfWrappedKey = wk;
        keys.push({ userId: uid, wrappedKey: wk });
        continue;
      }
      try {
        const keyRes = await firstValueFrom(
          this.http.get<
            | { publicWrappingKey: string | null }
            | { data: { publicWrappingKey: string | null } }
          >(`${this.baseUrl}/users/${uid}/public-key`),
        );
        const keyData = this.unwrapHttpData(keyRes);
        const publicWrappingKeyStr = keyData?.publicWrappingKey;
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
          wrappedKey: await this.encryptionService.wrapKey(
            newKey,
            targetPublicKey,
          ),
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
      this.http.post<
        { groupKeyVersionId: string } | { data: { groupKeyVersionId: string } }
      >(`${this.baseUrl}/groups/${groupId}/keys/rotate`, { reason, keys }),
    );
    const rotateData = this.unwrapHttpData(rotateRes);
    const newVersionId = rotateData?.groupKeyVersionId ?? null;

    // Move local caches to the new ACTIVE version.
    this.invalidateGroupKey(groupId);
    const aliasKey = this.buildVersionedKey(groupId);
    if (newVersionId) {
      this.activeGroupKeyVersionIds.set(groupId, newVersionId);
      const versionedCacheKey = this.buildVersionedKey(groupId, newVersionId);
      const entry: GroupKeyCacheEntry = {
        key: newKey,
        wrappedKey: selfWrappedKey,
        versionId: newVersionId,
      };
      this.groupKeysMemoryCache.set(versionedCacheKey, entry);
      this.groupKeysMemoryCache.set(aliasKey, entry);
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
        this.http.get<string[] | { data: string[] }>(
          `${this.baseUrl}/groups/${groupId}/keys/missing`,
        ),
      );

      const missingUserIds = this.unwrapHttpData(res) || [];
      if (missingUserIds.length === 0) {
        return;
      }

      console.info(
        `Found ${missingUserIds.length} members lacking group key. Provisioning...`,
      );
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
  async getMyAsymmetricKeys(): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  }> {
    if (this.myAsymmetricKeys) {
      return this.myAsymmetricKeys;
    }

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('User session not found');
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(
      user.email,
    );
    if (!masterKey) {
      throw new Error('Master encryption key not derived');
    }

    // Try loading existing key pair from backend
    const keysResponse = await firstValueFrom(
      this.http.get<
        | {
            publicWrappingKey: string | null;
            encryptedPrivateWrappingKey: string | null;
          }
        | {
            data: {
              publicWrappingKey: string | null;
              encryptedPrivateWrappingKey: string | null;
            };
          }
      >(`${this.baseUrl}/users/me/keys`),
    );

    const data = this.unwrapHttpData(keysResponse);
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

  /**
   * Re-wraps the private wrapping key for a password change (zero-knowledge).
   * Decrypts the stored private key with the OLD master key (loaded from
   * session), derives a NEW master key from the new password, re-encrypts the
   * private key JWK under it, updates the in-session master key, and returns the
   * re-wrapped ciphertext to submit to POST /auth/change-password.
   */
  async reWrapPrivateKeyForNewPassword(newPassword: string): Promise<string> {
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('User session not found');
    }

    const oldMasterKey = await this.encryptionService.loadKeyFromSession(
      user.email,
    );
    if (!oldMasterKey) {
      throw new Error('Master encryption key not derived');
    }

    const keysResponse = await firstValueFrom(
      this.http.get<
        | { encryptedPrivateWrappingKey: string | null }
        | { data: { encryptedPrivateWrappingKey: string | null } }
      >(`${this.baseUrl}/users/me/keys`),
    );
    const data = this.unwrapHttpData(keysResponse) as {
      encryptedPrivateWrappingKey: string | null;
    } | null;
    if (!data || !data.encryptedPrivateWrappingKey) {
      throw new Error('No wrapping key found to re-wrap');
    }

    // Decrypt private key JWK with the current master key
    const privateKeyJwkStr = await this.encryptionService.decrypt(
      data.encryptedPrivateWrappingKey,
      oldMasterKey,
    );

    // Derive the new master key and store it in-session so the app keeps working
    const { key: newMasterKey } =
      await this.encryptionService.deriveAndStoreKey(newPassword, user.email);

    // Re-encrypt the private key JWK under the new master key
    return this.encryptionService.encrypt(privateKeyJwkStr, newMasterKey);
  }

  /**
   * Produces the recovery-wrapped private-key blob for account-recovery setup
   * (zero-knowledge). Decrypts the stored private wrapping key with the current
   * session master key, derives a recovery key from the recovery code (PBKDF2,
   * email as salt — same derivation as a password), and re-encrypts the private
   * key JWK under it. The returned ciphertext is what `POST /users/me/recovery-key`
   * stores; the recovery code itself never leaves the device.
   *
   * @param recoveryCode The plaintext recovery code shown to the user.
   * @returns The recovery-wrapped private-key ciphertext blob.
   */
  async generateRecoveryBlob(recoveryCode: string): Promise<string> {
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      throw new Error('User session not found');
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(
      user.email,
    );
    if (!masterKey) {
      throw new Error('Master encryption key not derived');
    }

    const keysResponse = await firstValueFrom(
      this.http.get<
        | { encryptedPrivateWrappingKey: string | null }
        | { data: { encryptedPrivateWrappingKey: string | null } }
      >(`${this.baseUrl}/users/me/keys`),
    );
    const data = this.unwrapHttpData(keysResponse) as {
      encryptedPrivateWrappingKey: string | null;
    } | null;
    if (!data || !data.encryptedPrivateWrappingKey) {
      throw new Error('No wrapping key found to protect with a recovery code');
    }

    const privateKeyJwkStr = await this.encryptionService.decrypt(
      data.encryptedPrivateWrappingKey,
      masterKey,
    );

    const recoveryKey = await this.encryptionService.deriveMasterKey(
      normalizeRecoveryCode(recoveryCode),
      user.email,
    );

    return this.encryptionService.encrypt(privateKeyJwkStr, recoveryKey);
  }

  /**
   * Migrates a legacy group key that was wrapped symmetrically under the master
   * key to one wrapped under the caller's RSA public wrapping key, and posts the
   * re-wrapped copy so it survives a future password reset (the recovery flow
   * restores the RSA private key, not the master key). Best-effort and
   * idempotent: any failure is swallowed and simply retried on the next fetch,
   * and the server only replaces the caller's OWN wrapped copy.
   *
   * @param groupId  The group whose self-wrapped key is being migrated.
   * @param groupKey The already-unwrapped (extractable) group data key.
   */
  private async migrateSelfKeyToAsymmetric(
    groupId: string,
    groupKey: CryptoKey,
  ): Promise<void> {
    try {
      const user = this.store.selectSnapshot((state: any) => state.auth?.user);
      const selfId = user?.userId ?? user?.id;
      if (!selfId) {
        return;
      }
      const { publicKey } = await this.getMyAsymmetricKeys();
      const rewrapped = await this.encryptionService.wrapKey(
        groupKey,
        publicKey,
      );
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/groups/${groupId}/keys`, {
          keys: [{ userId: selfId, wrappedKey: rewrapped }],
        }),
      );
    } catch (e) {
      console.warn('Failed to migrate symmetric group key to RSA wrapping', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private fetch implementation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Internal fetch: Backend (unwrap) → in-memory cache → classified result.
   *
   * Decrypted group keys are stored only in the session-scoped in-memory
   * cache and are never written to IndexedDB or any other persistent store.
   *
   * Also maintains the `requiresKeyProvisioning` signal: it is set only when
   * the group has an active key wrapped for *other* members but not for the
   * caller (pending provisioning), which prevents both the owner-deadlock on
   * brand-new groups and duplicate group-key generation.
   */
  private async fetchAndCacheGroupKey(
    groupId: string,
    groupKeyVersionId?: string,
  ): Promise<GroupKeyResult> {
    const requestKey = this.buildVersionedKey(groupId, groupKeyVersionId);

    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    if (!user || !user.email) {
      return { status: 'no_session' };
    }

    const masterKey = await this.encryptionService.loadKeyFromSession(
      user.email,
    );
    if (!masterKey) {
      return { status: 'no_session' };
    }

    try {
      const url =
        `${this.baseUrl}/groups/${groupId}/keys/me` +
        (groupKeyVersionId ? `?versionId=${groupKeyVersionId}` : '');
      const response = await firstValueFrom(
        this.http.get<
          | {
              wrappedKey: string | null;
              groupKeyVersionId: string | null;
              hasActiveKeys?: boolean;
            }
          | {
              data: {
                wrappedKey: string | null;
                groupKeyVersionId: string | null;
                hasActiveKeys?: boolean;
              };
            }
        >(url),
      );

      const data = this.unwrapHttpData(response);
      const wrappedKey = data?.wrappedKey;
      const returnedVersionId =
        data?.groupKeyVersionId ?? groupKeyVersionId ?? 'active';
      const hasActiveKeys = data?.hasActiveKeys ?? false;

      if (!wrappedKey) {
        // Server has no wrapped key for this member/version yet. Flag
        // provisioning only when the key exists for others (deadlock fix):
        // a brand-new group with no keys at all must stay unflagged so the
        // owner can generate the first key.
        this.requiresKeyProvisioning.set(
          Boolean(data?.groupKeyVersionId) && hasActiveKeys,
        );
        return { status: 'pending' };
      }

      let unwrappedKey: CryptoKey;
      if (wrappedKey.includes(':')) {
        // Legacy: wrapped symmetrically with the user's master key. Unwrap as
        // extractable so it can be re-wrapped under the RSA public key, then
        // migrate it (best-effort) so this key survives a future password
        // reset — the recovery flow restores the RSA private key, never the
        // password-derived master key.
        unwrappedKey = await this.encryptionService.unwrapKey(
          wrappedKey,
          masterKey,
          true,
        );
        void this.migrateSelfKeyToAsymmetric(groupId, unwrappedKey);
      } else {
        // Wrapped asymmetrically with the user's public wrapping key
        const { privateKey } = await this.getMyAsymmetricKeys();
        unwrappedKey = await this.encryptionService.unwrapKey(
          wrappedKey,
          privateKey,
        );
      }

      const concreteVersionId =
        returnedVersionId !== 'active' ? returnedVersionId : undefined;
      const entry: GroupKeyCacheEntry = {
        key: unwrappedKey,
        wrappedKey,
        versionId: concreteVersionId,
      };

      // Cache under both the concrete returned version and the requested alias
      // so later lookups (which carry the concrete versionId) hit memory.
      this.groupKeysMemoryCache.set(
        this.buildVersionedKey(groupId, returnedVersionId),
        entry,
      );
      this.groupKeysMemoryCache.set(requestKey, entry);

      // An unversioned request resolves the ACTIVE version — remember its
      // concrete id so write paths can declare it on their ciphertext.
      if (!groupKeyVersionId && returnedVersionId !== 'active') {
        this.activeGroupKeyVersionIds.set(groupId, returnedVersionId);
      }

      this.requiresKeyProvisioning.set(false);
      this.rateLimitError.set(null);
      return {
        status: 'ready',
        key: unwrappedKey,
        versionId: concreteVersionId,
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
