# Group Key Lifecycle

FinMate uses client-side zero-knowledge encryption for sensitive expense fields. The backend stores ciphertext, key metadata, and wrapped key material, but it never receives a plaintext master key, group key, private wrapping key, or decrypted expense title/description.

## Key Types

| Key | Owner | Storage | Purpose |
| --- | --- | --- | --- |
| Master key / UDK | One user session | Derived client-side from password and email; cached by `ClientEncryptionService` | Encrypts personal-scope fields and wraps the user's private RSA key |
| Group key | One group key version | Raw key in browser memory only; wrapped copies in `member_wrapped_group_keys` | Encrypts group-scope expense fields |
| RSA-OAEP wrapping key pair | One user | Public key on backend; private key encrypted under the master key | Wraps group keys for direct member provisioning |
| Temporary Invite Key (TIK) | Invite link only | URL hash fragment, never sent to backend | Legacy/link invite unwrap path for recipients without a public wrapping key |

## Current Lifecycle

1. A group key is generated in the browser by `GroupKeyService.createGroupKey`.
2. The key is wrapped for the current user with their master key and posted to `POST /groups/:id/keys`.
3. The backend binds wrapped keys to the current ACTIVE `group_key_versions` row. Duplicate provisioning is idempotent.
4. Reads resolve keys through `GroupKeyService.resolveGroupKey(groupId, versionId?)`.
5. Resolution checks memory, then `GET /groups/:id/keys/me?versionId=...`.
6. The client unwraps the returned key with either the user's master key or RSA private wrapping key, then writes the raw `CryptoKey` back to memory for the current session.
7. Write paths call `getGroupKeyForEncryption`, which returns both the key and concrete `groupKeyVersionId`; encrypted expenses send that version stamp with the ciphertext.

## Cache Rules

Group keys are cached by `${groupId}:${groupKeyVersionId ?? 'active'}`.

1. Memory cache: fastest active-view lookup.
2. Backend wrapped key fetch: final source when memory misses. Plaintext group keys are not persisted.

`refreshGroupKey` evicts cached entries for a group and fetches from the backend. `clearCache` clears memory only. `clearPersistentCache` clears memory and removes any legacy IndexedDB key material written by older app versions.

## Canonical Key Resolution

`resolveGroupKey(groupId, versionId?)` is the single source of truth for group key availability. It returns classified states:

- `ready`: key was resolved and can decrypt.
- `pending`: key exists but has not been provisioned for the current member/version.
- `no_session`: user or master key is unavailable.
- `no_access`: membership/key access is denied.
- `rate_limited`: backend throttled key fetches.
- `error`: transient or unexpected failure.

This classification feeds the expense decryption pipeline so the UI can distinguish retryable key provisioning from permanent access loss.

## Provisioning

Direct provisioning uses RSA-OAEP:

1. The provisioning member resolves the current group key locally.
2. The target user's public wrapping key is fetched from `/users/:userId/public-key`.
3. The browser wraps the group key with the target public key.
4. The wrapped key is uploaded through `POST /groups/:id/keys`.

Self-healing runs from `checkAndProvisionMissingKeys(groupId)`: it calls `GET /groups/:id/keys/missing`, wraps the group key for each missing user with an available public key, and uploads the missing wrapped keys.

Link invites can still use a TIK. The TIK is carried in the URL hash fragment, unwraps the invite-wrapped group key in the browser, and the recipient re-wraps the group key for themselves with their master key.

## Rotation

Rotation is admin/owner initiated through `GroupKeyService.rotateGroupKey` and `POST /groups/:id/keys/rotate`.

- The browser generates a fresh group key.
- The browser wraps it for active/invited members whose wrapping key is available.
- The backend marks the previous ACTIVE version as SUPERSEDED and inserts a new ACTIVE version.
- Historical expenses remain decryptable because each encrypted row carries `groupKeyVersionId`.
- Members skipped during rotation are reported to the caller and need later provisioning.

The backend may serve SUPERSEDED versions for authorized historical decryption. Revoked versions are not served.

## Expense Decryption

All expense title/description decryption flows through `ExpenseDecryptionService`.

- Group expenses resolve `groupId + groupKeyVersionId`.
- Personal expenses use the user's master key.
- Direct shared expenses unwrap the per-user wrapped content key.
- Ciphertext is preserved as `encryptedTitle` and `encryptedDescription` so failed items can be retried without another backend read.
- `ExpenseDecryptCoordinator` handles provisioning/retry orchestration around the pure decryption pipeline.

## Security Invariants

- Never send plaintext master keys, group keys, or private wrapping keys to the backend.
- Never generate a second group key merely because the current member is missing provisioning.
- Always stamp group ciphertext with the concrete `groupKeyVersionId` used for encryption.
- Do not mutate historical key versions. Rotation creates a new ACTIVE version and keeps history readable through versioned key resolution.
