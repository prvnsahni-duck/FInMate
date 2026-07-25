# Architecture Inventory

One-page map of the system. Use in prompts as: _"Audit `<Module>` using `docs/architecture/architecture-inventory.md`."_

> **Documentation authority:** see [`canonical-sources.md`](canonical-sources.md) for the current
> per-topic canonical-document map and authority rules. The **ADRs** field below lists the on-disk
> source-of-truth sections for each module's decisions (ADR placeholder files were removed in the
> 2026-07-25 documentation audit; see `canonical-sources.md` Authority Rules).

---

## Expense (incl. splits, recurring, ledger)

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §2 (ZK model), §4 (Ledger Design); PROJECT_DECISIONS.md (plaintext amounts, encrypted titles, no duplicate records)
- **Source files:** `backend/src/app/expenses/` (controller, `expenses.service.ts`, `services/expenses-{crud,analytics,carry-forward}.service.ts`, `services/recurring-expenses.service.ts`, `split-calculator.util.ts`), `backend/src/app/common/ledger-debt-simplifier.ts` (shared with Settlements), `backend/src/app/common/member-display.util.ts` (shared with Settlements), `shared/data-models/src/lib/expense.entity.ts`, `expense-split.entity.ts`, `recurring-expense.entity.ts`, `recurring-expense-split.entity.ts`, `encrypted-expense-key.entity.ts`, `shared/data-models/src/lib/dto/expense.dto.ts`
- **Related services:** Settlements, Encryption/Key Management, Groups (membership authz), frontend `expense-decryption.service.ts` + `expense-decrypt-coordinator.service.ts`
- **Contract:** `docs/contracts/expense-contract.md`

## Settlements & Friends Balances

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §4 (transactions), §5 (multi-currency, friends balances)
- **Source files:** `backend/src/app/settlements/` (`settlements.service.ts`, `settlements.controller.ts`, `friends.controller.ts`), `backend/src/app/common/ledger-debt-simplifier.ts` (canonical debt-simplification, shared with Expenses' Carry Forward), `backend/src/app/common/member-display.util.ts` (canonical member display resolution, shared with Expenses' Carry Forward), `shared/data-models/src/lib/settlement.entity.ts`, `dto/settlement.dto.ts`
- **Related services:** Expense (balances), Groups (base currency rules)
- **Contract:** `docs/contracts/settlements-contract.md`

## Groups (membership, roles, invites, history)

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §2.5 (membership/ownership), §6 (audit logging); PROJECT_DECISIONS.md (group deletion = archive, one group key per group)
- **Source files:** `backend/src/app/groups/` (`groups.service.ts`, `groups.controller.ts`, `invite.controller.ts`, `members.controller.ts`, `services/groups-{crud,membership,contributions,audit}.service.ts`), `shared/data-models/src/lib/group.entity.ts`, `group-member.entity.ts`, `group-invite.entity.ts`, `group-member-contribution.entity.ts`
- **Related services:** Encryption/Key Management (key provisioning on invite/join), Audit logging
- **Contract:** `docs/contracts/groups-contract.md`

## Encryption / Key Management (Zero-Knowledge core)

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §2 (full ZK model, provisioning Flows A/B/C); PROJECT_DECISIONS.md "Key Management Model (Option 2)"; `zk_group_key_provisioning_architecture.md`; `docs/group-key-flow.md`
- **Source files:** backend `backend/src/app/encryption/encryption.service.ts`; entities `group-key-version.entity.ts`, `member-wrapped-group-key.entity.ts`, `encrypted-group-key.entity.ts`, `encrypted-expense-key.entity.ts`, `encryption.transformer.ts`, `dto/group-key.dto.ts`, `dto/is-ciphertext.decorator.ts`; frontend `frontend/src/app/core/services/encryption.service.ts`, `zk-key-vault.service.ts`, `group-key.service.ts`, `crypto-bootstrap.service.ts`, `expense-decryption.service.ts`, `expense-decrypt-coordinator.service.ts`
- **Related services:** every module holding encrypted data (Expense, Groups, Notes, Goals)
- **Contract:** `docs/contracts/encryption-contract.md`

## Authentication & Sessions

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §2.4 (JWT dual tokens, Redis sessions, 2FA, rate limits)
- **Source files:** `backend/src/app/auth/` (service, controller, `guards/`, `strategies/`, `decorators/`, `utils/`), `backend/src/app/guards/`, `backend/src/app/throttler/`, `backend/src/app/redis/redis.service.ts`, `shared/data-models/src/lib/dto/auth.dto.ts`; frontend `core/auth/`, `core/interceptors/`
- **Related services:** Users, Email (OTP/reset), Redis, Throttler
- **Contract:** `docs/contracts/auth-contract.md`

## Users & Profiles

- **Owner:** praveen
- **ADRs:** PROJECT_DECISIONS.md (user deletion removes PII only); ARCHITECTURE.md (public_wrapping_key lookup)
- **Source files:** `backend/src/app/users/`, `shared/data-models/src/lib/user.entity.ts`, `profile.entity.ts`, `dto/user.dto.ts`
- **Related services:** Auth, Encryption (public wrapping keys)
- **Contract:** `docs/contracts/users-contract.md`

## Sync / Offline

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §4.2 (optimistic locking, CON_VERSION_CONFLICT), §7 (offline-first claims), §2 roadmap (offline key restoration)
- **Source files:** frontend `core/services/automerge.service.ts`, `conflict-modal.service.ts`, PWA/service-worker config; backend `@VersionColumn` usage across entities
- **Related services:** all mutating modules
- **Contract:** `docs/contracts/sync-contract.md`

## Personal Finance (dashboard, goals, notes)

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md "Personal Dashboard Aggregation"; PROJECT_DECISIONS.md (dashboard aggregated, no duplicate records, UDK for personal data)
- **Source files:** `frontend/src/app/features/dashboard/`, `shared/data-models/src/lib/goal.entity.ts`, `note.entity.ts`, `dto/goal.dto.ts`, `dto/note.dto.ts`; backend expense analytics (`expenses-analytics.service.ts`)
- **Related services:** Expense, Encryption (UDK)
- **Contract:** `docs/contracts/expense-contract.md` (aggregation rules)

## Attachments

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md roadmap "Zero-Knowledge Attachment Storage" (File Key, Supabase)
- **Source files:** `shared/data-models/src/lib/attachment.entity.ts` (see audit for actual implementation status)
- **Related services:** Expense, Notes, Goals, Groups, Encryption
- **Contract:** — (create when implementation starts)

## Search & Projection

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md roadmap "Blind Index Search" (`title_search_hash`)
- **Source files:** roadmap — see `docs/audits/search-projection-audit.md` for current state
- **Related services:** Expense, Encryption
- **Contract:** — (create when implementation starts)

## Import / Export

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md §4.1 (transactional batch imports), rate limits (import 10/min, export 20/min)
- **Source files:** `backend/src/app/import/` (`import.service.ts`, `import.controller.ts`, `export.controller.ts`)
- **Related services:** Expense, Groups, Throttler
- **Contract:** `docs/contracts/import-export-contract.md`

## Notifications & Email

- **Owner:** praveen
- **ADRs:** ARCHITECTURE.md module graph (EmailModule)
- **Source files:** `backend/src/app/email/email.service.ts`
- **Related services:** Auth (OTP, reset), Groups (invites)
- **Contract:** `docs/contracts/email-contract.md`

## AI

- **Owner:** praveen
- **ADRs:** PROJECT_DECISIONS.md ("AI features are opt-in"); ARCHITECTURE.md roadmap (Receipt OCR)
- **Source files:** `backend/src/app/ai/` (`ai.service.ts`, `ai.controller.ts`)
- **Related services:** Expense, Import
- **Contract:** `docs/contracts/ai-contract.md`

## Cross-cutting infrastructure

- **Throttling:** `backend/src/app/throttler/`, `backend/src/app/guards/`
- **Error handling:** `backend/src/app/filters/http-exception.filter.ts`
- **Response envelope:** `backend/src/app/common/response.util.ts`
- **Pagination:** `backend/src/app/common/pagination.util.ts`
- **Audit logging:** `shared/data-models/src/lib/audit-log.entity.ts`, `groups/services/groups-audit.service.ts`
- **Migrations:** `backend/src/migrations/` (also registered in migration CLI DataSource — see commit 918ce54)
