# Encryption / Key Management Contract

Security-critical boundary. Canonical lifecycle: [`../group-key-flow.md`](../group-key-flow.md).

## Responsibilities

- Derive the user master key client-side from password/email.
- Generate, wrap, unwrap, cache, and rotate group keys client-side.
- Keep group key caches version-keyed in session memory only.
- Persist key metadata server-side in `group_key_versions` and `member_wrapped_group_keys`.
- Serve only wrapped keys to entitled active members.
- Preserve ciphertext and classify decryption failures for retryable UI states.

## Public APIs

- `GET /groups/:id/keys/me?versionId=...`
- `POST /groups/:id/keys`
- `POST /groups/:id/keys/rotate`
- `GET /groups/:id/keys/versions`
- `GET /groups/:id/keys/missing`
- `GET /users/:userId/public-key`
- `GET /users/me/keys`
- `POST /users/me/keys`

## Client Responsibilities

- Use `GroupKeyService.resolveGroupKey` for reads.
- Use `GroupKeyService.getGroupKeyForEncryption` for writes so ciphertext and `groupKeyVersionId` are consistent.
- Use `ExpenseDecryptionService` for all expense title/description decryption.
- Clear in-memory key caches on logout/full reset and purge legacy IndexedDB key material.

## Backend Responsibilities

- Validate group membership before serving or writing wrapped keys.
- Bind wrapped group keys to the ACTIVE key version, unless a specific historical version is requested for reads.
- Reject revoked key versions and non-member access.
- Treat provisioning as idempotent where duplicate client races occur.
- Keep immutable version history on rotation.

## Must Never

- Transmit or store plaintext master keys, group keys, or private wrapping keys server-side.
- Decrypt user expense content server-side.
- Mint a new group key for a member who is only missing provisioning.
- Accept `groupKeyVersionId` for personal expenses.
- Mutate a historical key version instead of creating a new version on rotation.
