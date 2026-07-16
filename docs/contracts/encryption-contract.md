# Encryption / Key Management Contract

The security-critical boundary. Source: frontend `core/services/` crypto + backend key endpoints in `groups/`. Audit: [encryption-audit.md](../audits/encryption-audit.md)

## Responsibilities

- ✔ Derive the master/UDK from password (PBKDF2 → AES-256-GCM), client-side.
- ✔ Generate, wrap (RSA-OAEP / symmetric), and unwrap group keys client-side.
- ✔ Maintain the version-keyed key cache (memory + IndexedDB vault), cleared on logout.
- ✔ Persist `group_key_versions` (immutable state machine) and `member_wrapped_group_keys` (per-user per-version), server-side.
- ✔ Serve wrapped keys to entitled members; provision on invite/join; rotate on demand.
- ✔ Classify decryption failures, preserve ciphertext, retry.

## Inputs

- Password (client only) · wrapped key blobs uploaded by clients · rotation requests with `keys[]`.

## Outputs

- Wrapped key rows · the requesting member's wrapped key for a version · decrypted content keys (client-side only).

## Public APIs

- `GET /groups/:id/keys/me[?versionId=]`, `POST /groups/:id/keys`, `POST /groups/:id/keys/rotate` (see `groups.controller.ts`).

## Events / side effects

- Should write an audit entry on rotation (currently missing — GRP-002).

## Dependencies

- Users (public wrapping keys) · Groups (membership entitlement).

## Must NEVER

- ❌ Transmit the master/UDK or an unwrapped group key to the backend.
- ❌ Decrypt user content server-side.
- ❌ Fall back to a hardcoded `ENCRYPTION_KEY` — fail closed (see ENC-001).
- ❌ Serve a wrapped key to a non-active / removed member.
- ❌ Overwrite historical wrapped keys or mutate a SUPERSEDED/REVOKED version.
- ❌ Mint a second group key on invite — always wrap the existing ACTIVE key.
