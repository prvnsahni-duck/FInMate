# Frozen Decisions

Architectural decisions that are **settled**. Do not re-propose alternatives to these without a new ADR.
Derived from [docs/PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) (APPROVED) and confirmed against the 2026-07-16 audits.

If a task requires changing one of these, stop and raise it explicitly — it needs a decision reversal, not an ad-hoc implementation.

## Security & Zero-Knowledge

- **Zero-knowledge is mandatory.** The backend never receives or stores plaintext of ZK-protected fields.
- **Backend never decrypts titles/notes.** Expense/note titles and descriptions are ciphertext at the API boundary (enforced by `@IsCiphertext`).
- **Amounts remain plaintext.** `amount_total`, `currency`, `category`, `expense_date` are plaintext columns — this is intentional and enables server-side aggregation. (History: amounts were encrypted then reverted, migrations `1718300…`/`1718600…`.)
- **User Data Key (UDK)** encrypts personal-scope data; derived from the password via PBKDF2 → AES-256-GCM. (Impl note: currently the master key is used directly as the personal data key.)
- **Group Key** encrypts all shared/collaborative data. Shared data is never encrypted with a personal UDK.
- **One Group Key per group.** Invites wrap the existing key; no duplicate group keys are minted.
- **Group Key Versioning (Option 2).** `group_key_versions` = immutable history (`ACTIVE`/`SUPERSEDED`/`REVOKED`); `member_wrapped_group_keys` = per-user per-version wrapped keys. Rotation creates a new ACTIVE and supersedes the previous. Encrypted resources reference the key version used.
- **TIK never touches the backend.** Temporary Invite Keys live only in the URL hash fragment.
- **Server `ENCRYPTION_KEY`** protects server-held secrets (2FA/TOTP; currently also avatar URL) — never user ZK content.

## Data Model & Ledger

- **No duplicate expense records.** Every expense is a single row; the personal dashboard is computed by joining `expense_splits` × `expenses`, never by duplicating records.
- **Personal Dashboard is aggregated** (personal expenses + user's share of group/split expenses) on the backend.
- **Soft deletes preserve ledger history** (`@DeleteDateColumn`, restore grace period).
- **Optimistic locking** (`@VersionColumn`, `CON_VERSION_CONFLICT` 412) guards concurrent ledger writes.
- **Currency consistency:** a group's base currency is locked once any expense/settlement exists; settlements must match the group base currency.
- **Immutable audit log** is write-only; actor IP is stored as SHA-256 `ipHash`.

## Lifecycle

- **Group deletion = Archive** (read-only), never hard delete.
- **User deletion removes PII only** (account/PII scrubbed; ledger integrity preserved).
- **Group owner cannot leave** until ownership is transferred.
- **Password change re-wraps the UDK** — it does NOT re-encrypt existing data.

## Product

- **AI features are opt-in.** No user data reaches an AI provider unless the user has opted in (must be enforced server-side — see AI-001).
- **Receipt OCR** uses a transient engine; plaintext receipts are never persisted.

## Stack (do not swap without an ADR)

- Nx monorepo · NestJS + Express + TypeORM · PostgreSQL 16 · Redis 7 · Angular + NGXS + Tailwind · Capacitor for native.
- Client crypto: Web Crypto API (AES-256-GCM, PBKDF2, RSA-OAEP). Key vault: IndexedDB (+ in-memory fallback).

## Explicitly NOT in the architecture

These have come up or could be suggested — they are **not** part of FinMate v2. Don't add them without an ADR:

- No CRDT / automerge library for data (the "automerge" service is a field-overlap conflict resolver, not a CRDT).
- No blockchain / distributed ledger.
- No second source of truth for balances — balances are always derived from expenses + splits.
- No client-side plaintext of ZK fields sent to the server for search (blind index is the only sanctioned future path).
