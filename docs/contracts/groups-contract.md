# Groups Module Contract

Source: [groups/](../../backend/src/app/groups/) · Audit: [groups-audit.md](../audits/groups-audit.md)

## Responsibilities

- ✔ Manage groups, membership, roles (owner/admin/member/viewer/spectator) and join status.
- ✔ Enforce role-based authorization on group operations.
- ✔ Manage invites (durable `group_invites` with wrapped key + expiry; token join link).
- ✔ Archive groups (never hard-delete).
- ✔ Lock base currency once activity exists.
- ✔ Per-ledger-month member contributions (sum to 100%).
- ✔ Serve group history (audit metadata) for client-side field decryption.
- ✔ Audit config actions with SHA-256 ipHash.

## Inputs

- Group/member/invite/contribution DTOs · authenticated caller + their membership role.

## Outputs

- Group/member/invite/contribution records · history logs (ciphertext metadata).

## Public APIs

- `groups.controller.ts`, `members.controller.ts`, `invite.controller.ts`.

## Dependencies

- Encryption/Key Management (invoked to provision/rotate wrapped keys — Groups owns the key-version tables).
- Users (shadow-user provisioning on invite).
- Audit logging.

## Must NEVER

- ❌ Allow a role change without checking the **caller's** role — never let a member/viewer promote to owner (see GRP-001).
- ❌ Let the owner leave without transferring ownership.
- ❌ Hard-delete a group.
- ❌ Mint a duplicate group key on invite.
- ❌ Change base currency after expenses/settlements exist.
- ❌ Skip audit logging on key rotation / ownership / invite actions (see GRP-002).
