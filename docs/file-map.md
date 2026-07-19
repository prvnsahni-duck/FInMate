# File Ownership Map

What each important file is for, and what must **not** go in it. Prevents responsibility drift.
Paths are relative to repo root.

## Entities (`shared/data-models/src/lib/`)

### `expense.entity.ts`

- **Purpose:** the encrypted expense row (ciphertext title/description, plaintext amount/currency/category/date, ledgerMonth, groupKeyVersion, version, soft-delete).
- **Do NOT place here:** search columns, projection/aggregate fields, history, business logic.

### `expense-split.entity.ts`

- **Purpose:** one participant's allocation of an expense (type, value, isSettled).
- **Do NOT place here:** balance totals, dashboard aggregates.

### `group-key-version.entity.ts` / `member-wrapped-group-key.entity.ts`

- **Purpose:** immutable key-version history; per-user per-version wrapped keys.
- **Do NOT place here:** raw/unwrapped keys, plaintext content, mutable version state beyond the ACTIVE/SUPERSEDED/REVOKED machine.

### `user.entity.ts` / `profile.entity.ts`

- **Purpose:** identity (plaintext lookup fields) + profile (avatar server-encrypted); wrapping keys.
- **Do NOT place here:** ZK content, group-scoped data, an `ai_opt_in` stored anywhere else (add it here when doing AI-001).

### `audit-log.entity.ts`

- **Purpose:** append-only action trail; ipHash (SHA-256), metadataJson.
- **Do NOT place here:** anything read as a source of truth; never mutate/delete rows.

## Backend services (`backend/src/app/`)

### `expenses/expenses.service.ts` (+ `services/expenses-*.service.ts`)

- **Purpose:** expense/split CRUD, access checks, analytics aggregation, carry-forward.
- **Do NOT place here:** decryption of ZK fields, a persisted balance store, search indexing.

### `groups/groups.service.ts` (+ `services/groups-*.service.ts`)

- **Purpose:** groups, membership, roles, invites, contributions, history, key-version tables.
- **Do NOT place here:** expense math; role changes without caller-role checks (GRP-001).

### `encryption/encryption.service.ts`

- **Purpose:** SERVER-side symmetric encryption of server secrets (2FA, avatar) only.
- **Do NOT place here:** user ZK content, group/personal key handling, a hardcoded key fallback (ENC-001).

### `auth/auth.service.ts`

- **Purpose:** tokens, sessions, 2FA, auth audit.
- **Do NOT place here:** UDK/group-key material; client-only gate enforcement.

### `ai/ai.service.ts`

- **Purpose:** stateless LLM proxy + UUID redaction.
- **Do NOT place here:** persistence of prompts/responses; ZK plaintext forwarding; opt-in bypass.

### `email/email.service.ts`

- **Purpose:** transactional email (invites).
- **Do NOT place here:** ZK content in payloads; key material outside the URL fragment.

## Frontend crypto (`frontend/src/app/core/services/`)

### `encryption.service.ts` / `group-key.service.ts` / `zk-key-vault.service.ts`

- **Purpose:** derive/generate/wrap/unwrap keys; version-keyed cache in IndexedDB + memory.
- **Do NOT place here:** sending unwrapped keys to the server; business logic.

### `expense-decryption.service.ts` / `expense-decrypt-coordinator.service.ts`

- **Purpose:** scope-aware decryption pipeline, classified failures, retry.
- **Do NOT place here:** ledger math; network mutation logic.

### `automerge.service.ts` / `conflict-modal.service.ts`

- **Purpose:** optimistic-lock conflict reconciliation only.
- **Do NOT place here:** a general offline queue (that's roadmap; don't fake it here).

## Cross-cutting

- `common/response.util.ts` — the single success/response envelope. Reuse; don't hand-roll responses.
- `filters/http-exception.filter.ts` — the single error mapper + error codes (`CON_VERSION_CONFLICT`, etc.). Add new codes here.
- `throttler/throttle.constants.ts` — throttle profiles. Add a profile here before decorating a route.
- `backend/src/migrations/` — schema changes only; also register in the migration CLI DataSource.
