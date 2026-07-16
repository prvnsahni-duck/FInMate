# Users & Profiles Contract

Source: [users/](../../backend/src/app/users/) · Audit: covered in [auth-audit.md](../audits/auth-audit.md) and [personal-finance-audit.md](../audits/personal-finance-audit.md)

## Responsibilities

- ✔ Manage user + profile records (identity fields plaintext for lookup; avatar server-encrypted).
- ✔ Serve public wrapping keys for direct-invite key wrapping.
- ✔ User/friend lookup + search over plaintext identity fields (email/username/phone).
- ✔ Store the user's wrapping keys (`saveKeys`).

## Inputs

- Profile update DTOs, key material, lookup queries.

## Outputs

- User/profile records (placeholder emails stripped), public keys.

## Public APIs

- `users.controller.ts`: me GET/PATCH, me/keys, lookup, search, :id/public-key. (`DELETE /users/me` — NOT implemented, see PF-001.)

## Dependencies

- Auth, Encryption (public wrapping keys).

## Must NEVER

- ❌ Return placeholder (`@placeholder.finmate`) emails to clients.
- ❌ Replace wrapping keys without re-auth (see AUTH-007).
- ❌ Hard-delete a user in a way that breaks ledger integrity — deletion removes PII only (see PF-001).
- ❌ Encrypt user ZK content with the server key.
