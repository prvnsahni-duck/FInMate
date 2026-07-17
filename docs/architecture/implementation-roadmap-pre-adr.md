# FinMate v2 Implementation Roadmap (Pre-ADR)

> **PROVISIONAL.** This roadmap is derived from the 2026-07-16 audit sweep and the working
> [gap-tracker.md](gap-tracker.md), reconciled only against `PROJECT_DECISIONS.md` + `ARCHITECTURE.md`.
> It becomes canonical only after the ADRs are imported (see [canonical-sources.md](canonical-sources.md)).
> No gap IDs are changed, merged, removed, or reprioritized in the tracker itself — this report
> organizes them into an execution plan. **Do not implement any gap until its governing ADR is imported.**

Contents:
1. [Scope & inputs](#1-scope--inputs)
2. [Dependency mapping (per gap)](#2-dependency-mapping-per-gap)
3. [Implementation dependency graph](#3-implementation-dependency-graph)
4. [Gap classification](#4-gap-classification)
5. [Duplicate / dependent-work detection](#5-duplicate--dependent-work-detection)
6. [Phased implementation roadmap](#6-phased-implementation-roadmap)
7. [Architectural risk review](#7-architectural-risk-review)

Effort scale: **S** ≤ half-day · **M** ~1–2 days · **L** ~3–5 days · **XL** > 1 week or multi-surface.
Risk = likelihood × blast radius of a regression from the change.

---

## 1. Scope & inputs

44 gap items across 10 modules, plus 6 roadmap-only items (RM-01…RM-06) and 4 doc-drift items. All evidence is in [../audits/](../audits/). This report covers every gap-tracker row; roadmap-only items are listed but not scheduled (they are new features, not architecture gaps).

Two Criticals were re-validated against live code before this report: **GRP-001** (privilege escalation, `groups.service.ts:668-741`) and **AI-001** (opt-in unenforced server-side, `ai.controller.ts` + no `ai_opt_in` column). Both confirmed.

---

## 2. Dependency mapping (per gap)

Columns: **Sch** = DB schema/migration impact · **API** = API contract impact · **Enc** = encryption/key impact · **Sync** = optimistic-lock/offline impact · **Mig** = migration required. Grouped by module for readability.

### Encryption / Key Management

| Gap | Modules | Key files | Services | Sch | API | Enc | Sync | Mig | Complexity | Depends on |
|-----|---------|-----------|----------|:---:|:---:|:---:|:----:|:---:|:----------:|-----------|
| ENC-001 | Encryption | `encryption/encryption.service.ts`; env validation | Encryption, boot | – | – | ✔ | – | No | S | none (do first) |
| ENC-002 | Encryption, Groups | `groups.controller.ts`, `groups.service.ts` (getMyGroupKey); FE `group-key.service.ts` | Groups-crud, key serving | – | ✔ (add `?versionId`) | ✔ | – | No | M | ENC-001 |
| ENC-003 | Encryption, Users | `users.service.ts`; docs | Users | – | – | ✔ | – | Maybe (if scheme change) | S | ENC-001; decision (doc vs remove) |
| ENC-004 | Encryption | FE `encryption.service.ts`, `group-key.service.ts` | Crypto engine (client) | – | – | ✔ | – | No | M | ENC-001 |
| ENC-005 | Encryption, Groups | `groups.service.ts` (provision/rotate), `dto/group-key.dto.ts` | Key provisioning | Maybe (persist algo) | – | ✔ | – | Maybe | S | ENC-002 |

### Groups

| Gap | Modules | Key files | Services | Sch | API | Enc | Sync | Mig | Complexity | Depends on |
|-----|---------|-----------|----------|:---:|:---:|:---:|:----:|:---:|:----------:|-----------|
| GRP-001 | Groups | `groups.service.ts` (updateMember), `members.controller.ts`, `group-roles.guard.ts` | Membership | – | – | – | – | No | S–M | none (security, do early) |
| GRP-002 | Groups | `groups.service.ts` (rotate/provision/invite/regenerate/contrib), `groups-audit.service.ts` | Audit | – | – | – | – | No | M | none |
| GRP-003 | Groups | `group-roles.decorator.ts`, `members.controller.ts`, guard | Membership authz | – | – | – | – | No | S | GRP-001 (same authz surface) |
| GRP-004 | Groups | `groups.service.ts` (invites), `group.entity.ts`, `invite.controller.ts` | Invites | Maybe (token expiry col) | ✔ (revoke endpoint) | – | – | Maybe | M | none |
| GRP-005 | Groups, Encryption | `groups.service.ts` (removeMember), key rotation | Membership + key rotation | – | – | ✔ | – | No | L | ENC-002 (needs working versioned re-key) |
| GRP-006 | Groups | `group.entity.ts`, `dto/group.dto.ts`, migration, docs | Groups-crud | ✔ (if built) | ✔ | – | – | Yes (if built) | S (doc) / M (feature) | ADR decision (build vs doc-only) |
| GRP-007 | Groups, Encryption | `groups.service.ts` (getHistoryLogs), audit metadata, FE `groups.service.ts` | Audit + history | Maybe | – | ✔ | – | Maybe | M | ENC-002; EXP-002/003 (version-stamped metadata) |

### Expense / Settlements

| Gap | Modules | Key files | Services | Sch | API | Enc | Sync | Mig | Complexity | Depends on |
|-----|---------|-----------|----------|:---:|:---:|:---:|:----:|:---:|:----------:|-----------|
| EXP-001 | Expense, Settlements | `expenses.service.ts` (updateExpense/persistSplits), `expense-split.entity.ts` | Expenses-crud | Maybe (adjustment model) | ✔ (edit semantics) | – | ✔ (version) | Maybe | L | EXP-004, EXP-005 |
| EXP-002 | Expense, Encryption | `recurring-expense.entity.ts`, migration, scheduler | Recurring | ✔ (add `groupKeyVersionId`) | – | ✔ | – | Yes | M | ENC-002 |
| EXP-003 | Expense, Encryption | `expenses.service.ts` (updateExpense) | Expenses-crud | – | – | ✔ | – | No | M | ENC-002; EXP-002 |
| EXP-004 | Expense | `expense-split.entity.ts`, `expenses.service.ts` (updateExpense) | Expenses-crud | ✔ (add `deletedAt` to splits) | – | – | – | Yes | M | none (do before EXP-001) |
| EXP-005 | Expense | `expense-split.entity.ts`, split writes, delete/restore | Expenses-crud | ✔ (add `@VersionColumn`) | – | – | ✔ | Yes | M | EXP-004 (same entity change) |
| EXP-006 | Expense | `expenses.service.ts` (restore grace calc) | Expenses-crud | – | – | – | – | No | S | ADR decision (code vs doc) |
| EXP-007 | Expense | `recurring-expenses.service.ts`, scheduler | Recurring | – | – | – | – | No | S | none |
| EXP-008 | Expense, Settlements | `dto/settlement.dto.ts`, `settlements.service.ts` | Settlements | – | ✔ (validation) | ✔ | – | No | S | none |
| EXP-009 | Expense, Encryption | `expenses.service.ts` (validate), DTOs, FE | Expenses-crud | – | Maybe | ✔ | – | No | S (remove) / L (enable) | ADR decision (remove vs implement `direct_shared`) |

### Authentication / Users

| Gap | Modules | Key files | Services | Sch | API | Enc | Sync | Mig | Complexity | Depends on |
|-----|---------|-----------|----------|:---:|:---:|:---:|:----:|:---:|:----------:|-----------|
| AUTH-001 | Auth | `auth.service.ts`, `auth.controller.ts`, FE `jwt.interceptor.ts`, `auth.service.ts` | Auth + FE | – | ✔ (cookie transport) | – | – | No | L | ADR decision (cookie vs body); coordinated FE+BE |
| AUTH-002 | Auth, Users, Email, Encryption | `auth.controller.ts`, `auth.service.ts`, `email.service.ts`, `users.service.ts` (UDK re-wrap) | Auth, Email, Users | Maybe (reset tokens) | ✔ (3 endpoints) | ✔ (UDK re-wrap) | – | Maybe | XL | NOTIF-002; email working; ENC model |
| AUTH-003 | Auth | `auth.service.ts`, `jwt.strategy.ts` | Auth | – | – | – | – | No | S | none |
| AUTH-004 | Auth | `main.ts` (CORS) | boot | – | – | – | – | No | S | none |
| AUTH-005 | Auth, Infra | `main.ts` (trust proxy, Swagger) | boot | – | – | – | – | No | S | none |
| AUTH-006 | Auth | `auth.service.ts` (login failure) | Auth audit | – | – | – | – | No | S | none |
| AUTH-007 | Auth, Users | `users.service.ts` (saveKeys), `totp.util.ts` | Users, Auth | – | ✔ (re-auth) | ✔ | – | No | M | AUTH-002 (interacts with password/UDK flow) |
| PF-001 | Personal Finance, Users | `users.controller.ts`, `users.service.ts` | Users | Maybe (anonymize) | ✔ (`DELETE /users/me`) | – | – | Maybe | L | ADR decision (PII scope, ledger retention) |
| PF-002 | Personal Finance, Encryption | `goal.entity.ts`, `dto/goal.dto.ts`, FE goals | Goals (new) | ✔ (if built) | ✔ | ✔ | – | Yes (if built) | L | Goals feature (RM-03) or crypto-only fix |

### Sync / Search / Attachments / Notifications / AI

| Gap | Modules | Key files | Services | Sch | API | Enc | Sync | Mig | Complexity | Depends on |
|-----|---------|-----------|----------|:---:|:---:|:---:|:----:|:---:|:----------:|-----------|
| SYNC-001 | Sync/Frontend | `angular.json`, `ngsw-config.json` (new), manifest, `app.config.ts` | FE build | – | – | – | ✔ | No | L | none (infra) |
| SYNC-002 | Sync/Frontend | FE outbox service (new), interceptors, IndexedDB | FE | – | Maybe | ✔ (offline keys) | ✔ | No | XL | SYNC-001; ENC-004 (offline keys); EXP-005 (conflict on replay) |
| SYNC-003 | Sync/Frontend | `group-detail.component.ts/html` | FE | – | – | – | – | No | S | SYNC-002 (fix copy when real) |
| SRCH-001 | Search/Expense | `expenses.service.ts` (listExpenses pagination) | Expenses-access | – | ✔ (cursor semantics) | – | – | No | M | EXP-004/005 (touches same query paths) |
| SRCH-002 | Search/Infra | `expenses.service.ts` analytics, Redis | Analytics, Redis | – | – | – | – | No | M | none (perf) |
| ATT-001 | Attachments | storage adapter (new), FE upload, backend endpoints | Attachments (new) | Maybe | ✔ (upload/download) | ✔ | – | Maybe | XL | ENC-002 (key version on files); ATT-002 |
| ATT-002 | Attachments, Encryption | `expenses.service.ts` (legacy attachmentKeys), DTOs | Expenses-crud | – | ✔ (deprecate legacy) | ✔ | – | No | M | ENC-002 |
| NOTIF-001 | Notifications, Infra | `members.controller.ts`, `groups.controller.ts`, `throttle.constants.ts` | Throttler | – | – | – | – | No | S | none (add throttle profile) |
| NOTIF-002 | Notifications, Auth | `email.service.ts`, `auth.controller.ts` | Email, Auth | Maybe | ✔ | – | – | Maybe | M | part of AUTH-002 |
| NOTIF-003 | Notifications/Infra | new WS gateway, FE socket client | new module | – | ✔ | – | ✔ | No | XL | none (new feature) |
| NOTIF-004 | Notifications | notification entity (new), endpoints, FE center | new module | ✔ | ✔ | – | – | Yes | L | none (new feature) |
| AI-001 | AI, Users | `ai.controller.ts`, `ai.service.ts`, `user.entity.ts`, migration, FE | AI, Users | ✔ (add `ai_opt_in`) | ✔ (guard) | – | – | Yes | M | none (security) |
| AI-002 | AI | `ai.controller.ts`, `ai.service.ts` | AI | – | ✔ (constrain model/system) | – | – | No | M | AI-001 |
| AI-003 | AI, Infra | `ai.controller.ts`, `throttle.constants.ts` | Throttler | – | – | – | – | No | S | AI-001 |

---

## 3. Implementation dependency graph

Ordering by **technical dependency**, not severity. Each arrow = "must exist / be stable before."

```
ENC-001  (fail-closed server key)
   │  boot-safety; everything crypto-adjacent assumes a real key
   ▼
ENC-002  (serve wrapped key by versionId)   ◄── the linchpin
   │  a working versioned re-key path is the prerequisite for every
   │  "reference the correct key version" and rotation-correctness gap
   ├─────────────► EXP-002 / EXP-003   (stamp/refresh key version on expenses)
   ├─────────────► ATT-002 / ATT-001   (files reference key version)
   ├─────────────► GRP-005             (rotate keys on member leave)
   └─────────────► GRP-007             (decrypt history at correct version)
   ▼
ExpenseSplit entity hardening  (EXP-004 soft-delete  →  EXP-005 version column)
   │  both mutate the same entity/migration; do together, splits-first
   ▼
EXP-001  (settled-edit adjustments)
   │  needs versioned + soft-deletable splits to build an adjustment trail
   ▼
SYNC-001 (service worker / PWA shell)
   │  offline caching must exist before an offline mutation queue is meaningful
   ▼
SYNC-002 (offline mutation queue / outbox)
   │  replay depends on EXP-005 (per-split version) + ENC-004 (offline keys)
   ▼
SRCH-001 (cursor pagination correctness)   ── touches the same list/query paths
   ▼
Projection / History  (GRP-007, SRCH-002)  ── derived views, safe once sources stable
   ▼
ATT-001 / ATT-002  (real ZK attachment storage)
   ▼
PF-001 / PF-002  (account lifecycle, goals)  ── product surfaces on a stable core
   ▼
AUTH-002  (password change/reset + UDK re-wrap)  ── needs email (NOTIF-002) + ENC model
   ▼
AI-001 → AI-002 → AI-003  (opt-in gate, then guards, then throttle)  ── last; no core dep
```

**Standalone security/infra items** (no upstream dependency — can be done anytime, ideally early because they are cheap and high-value): GRP-001, GRP-002, GRP-003, NOTIF-001, AUTH-003, AUTH-004, AUTH-005, AUTH-006, EXP-007, EXP-008, AI-001 (AI-001 has no core dependency and is a Critical, so it is pulled forward despite AI sitting last in the *feature* order).

### Why each dependency exists

- **ENC-001 first:** if the server key can silently fall back to a public constant, every downstream crypto assertion (2FA at rest, avatar) is unsound. Fail-closed is a precondition, not a feature.
- **ENC-002 is the linchpin:** the backend currently ignores `?versionId=` and always serves the ACTIVE key. Until it can serve the *correct historical version*, any fix that "stamps the right key version" (EXP-002/003, ATT files, GRP-007 history) has nothing to resolve against, and real rotation (GRP-005) would make historical data undecryptable. Everything version-correctness-related sits behind it.
- **EXP-004 before EXP-005 before EXP-001:** they touch the same entity and migration. You need soft-deletable, individually-versioned splits before you can represent a settlement adjustment instead of a destructive rewrite.
- **SYNC-001 before SYNC-002:** an offline mutation queue is pointless if the app can't even load offline. The PWA shell is the substrate.
- **SYNC-002 needs EXP-005 + ENC-004:** replaying queued edits reconciles via per-record versions (EXP-005) and requires keys available offline in a safe (non-extractable) form (ENC-004).
- **AUTH-002 needs NOTIF-002 + ENC model:** password reset requires working transactional email and a defined UDK re-wrap; it is XL and should not start until email and the encryption model are stable.
- **AI last (except AI-001):** AI touches no core invariant; fixing it doesn't unblock anything else. AI-001 is pulled forward only because it is a Critical security gate, and it is self-contained (a user column + a guard).

---

## 4. Gap classification

Every gap classified into exactly one bucket. **IDs unchanged, nothing merged or removed.**

| Class | Gaps |
|-------|------|
| **Architecture** | ENC-002, ENC-004, ENC-005, EXP-002, EXP-003, EXP-004, EXP-005, EXP-001, GRP-005, GRP-007, SYNC-002, SRCH-001, ATT-002, ATT-001, EXP-009 |
| **Security** | GRP-001, AI-001, ENC-001, AUTH-001, AUTH-003, AUTH-005, AUTH-006, AUTH-007, GRP-003, NOTIF-001, AI-002, EXP-008, EXP-007 |
| **Product** | AUTH-002, PF-001, PF-002, GRP-004, NOTIF-002, NOTIF-004, GRP-006 |
| **Infrastructure** | SYNC-001, AI-003, SRCH-002, AUTH-004, GRP-002, NOTIF-003 |
| **Documentation** | ENC-003, EXP-006, SYNC-003 (+ the 4 doc-drift items: refresh-token transport, offline-first claims, offline key restoration labeling, trip type) |
| **Enhancement** | (roadmap-only) RM-01 blind index, RM-02 OCR, RM-03 goals CRUD, RM-04 notes CRUD, RM-05 offline/PWA feature set, RM-06 push/BullMQ |

Notes on borderline calls:
- **EXP-006** (restore grace window) and **ENC-003** (avatar scope) and **SYNC-003** (banner copy) are classified Documentation because the likely resolution is "state the real behavior," pending an ADR that may instead mandate a code change — flagged for reconciliation.
- **GRP-006** (trip type) is Product because it's a feature decision, though its cheapest resolution is a doc fix.
- **EXP-009** (dead `direct_shared`) is Architecture because it's latent design surface; resolution (remove vs implement) is an ADR decision.

---

## 5. Duplicate / dependent-work detection

Gaps that are **symptoms of, or absorbed by, another gap**. These should not be scheduled as independent line items — fixing the parent resolves or de-risks them.

| Dependent gap | Parent / absorbing gap | Relationship |
|---------------|------------------------|--------------|
| EXP-003 | EXP-002 + ENC-002 | Same root: expenses must carry & resolve the correct group key version. Fix the version-stamping model once; both are facets. |
| EXP-005 | EXP-004 | Same entity + same migration (`expense_splits`). One schema change adds both `deletedAt` and `@VersionColumn`. |
| EXP-001 | EXP-004 + EXP-005 | Cannot build a non-destructive settled-edit/adjustment without soft-deletable, versioned splits. Dependent, not independent. |
| GRP-003 | GRP-001 | Same authorization surface (member routes + `GroupRoles`). Fixing role authz touches the same decorator/guard; do together. |
| GRP-005 | ENC-002 | Re-keying on leave is meaningless until versioned key serving works. Dependent. |
| GRP-007 | ENC-002 (+ EXP-002/003) | History decrypt-at-correct-version needs versioned key serving and version-stamped audit metadata. |
| ATT-002 | ENC-002 | Legacy plaintext attachment path is retired as part of the versioned-key attachment model. |
| SYNC-003 | SYNC-002 | The "showing cached data" banner is only truthful once a real offline cache/queue exists. Don't fix copy in isolation. |
| NOTIF-002 | AUTH-002 | The dead verification/reset email templates come alive as part of the password/verify flow. Same work item. |
| AI-002, AI-003 | AI-001 | Both build on the opt-in gate + AI controller hardening. Sequence within one AI work batch. |
| AUTH-007 | AUTH-002 | `saveKeys` re-auth is part of defining the password/UDK-rewrap security model. |
| ENC-005 | ENC-002 | Wrapping-algorithm metadata is fixed while reworking the key provisioning/serving path. |

**Net effect:** ~12 of the 44 gaps are dependents. Independent "root" work items number ~32, and the true critical-path roots are **ENC-001 → ENC-002 → EXP-004/005 → EXP-001 → SYNC-001 → SYNC-002**.

---

## 6. Phased implementation roadmap

Phases follow the dependency graph. Within a phase, items are independent unless a blocking dependency is noted. **Every task is gated on its governing ADR being imported first.**

### Phase 1 — Foundational security, encryption & key management

| Gap | Reason for priority | Files likely affected | Risk | Mig | Effort | Blocking deps |
|-----|--------------------|-----------------------|------|:---:|:------:|---------------|
| ENC-001 | Fail-closed server key; precondition for all crypto | `encryption.service.ts`, env validation | Low | No | S | none |
| GRP-001 | Critical privilege escalation (validated) | `groups.service.ts`, `members.controller.ts`, `group-roles.guard.ts` | Med | No | S–M | none |
| GRP-003 | Same authz surface as GRP-001 | `group-roles.decorator.ts`, `members.controller.ts` | Low | No | S | GRP-001 |
| AI-001 | Critical: opt-in unenforced (validated); self-contained | `ai.controller.ts`, `ai.service.ts`, `user.entity.ts` + migration | Med | Yes | M | none |
| NOTIF-001 | Email-bomb / enumeration vector; cheap | `members.controller.ts`, `groups.controller.ts`, `throttle.constants.ts` | Low | No | S | none |
| AUTH-003/004/005/006 | Cheap auth hardening, no core deps | `auth.service.ts`, `jwt.strategy.ts`, `main.ts` | Low | No | S each | none |
| ENC-002 | **Linchpin**: versioned key serving unblocks Phase 2 | `groups.controller.ts`, `groups.service.ts`, FE `group-key.service.ts` | High | No | M | ENC-001 |
| ENC-004 | Offline-safe (non-extractable) keys; needed by SYNC-002 later | FE `encryption.service.ts`, `group-key.service.ts` | Med | No | M | ENC-001 |
| ENC-005 | Fix wrapping-algo metadata while in the key path | `groups.service.ts`, `dto/group-key.dto.ts` | Low | Maybe | S | ENC-002 |

### Phase 2 — Expense domain, ExpenseShare & settlements

| Gap | Reason | Files | Risk | Mig | Effort | Blocking deps |
|-----|--------|-------|------|:---:|:------:|---------------|
| EXP-004 | Split soft-delete; preserves ledger history | `expense-split.entity.ts`, `expenses.service.ts` + migration | Med | Yes | M | none (post-ENC) |
| EXP-005 | Split version column; same migration as EXP-004 | `expense-split.entity.ts`, split writes, delete/restore | Med | Yes | M | EXP-004 |
| EXP-002 | Recurring template key version | `recurring-expense.entity.ts` + migration, scheduler | Med | Yes | M | ENC-002 |
| EXP-003 | Refresh key version on update | `expenses.service.ts` (updateExpense) | Med | No | M | ENC-002, EXP-002 |
| EXP-001 | Settled-edit adjustments (no silent history mutation) | `expenses.service.ts`, `expense-split.entity.ts` | High | Maybe | L | EXP-004, EXP-005 |
| EXP-007 | Recurring currency validation | `recurring-expenses.service.ts` | Low | No | S | none |
| EXP-008 | Settlement note ciphertext validation | `dto/settlement.dto.ts`, `settlements.service.ts` | Low | No | S | none |
| EXP-009 | Resolve dead `direct_shared` (remove or implement) | `expenses.service.ts`, DTOs, FE | Med | No | S/L | ADR decision |
| GRP-002 | Audit coverage for key/invite/contrib actions | `groups.service.ts`, `groups-audit.service.ts` | Low | No | M | none |

### Phase 3 — Sync, projection & search

| Gap | Reason | Files | Risk | Mig | Effort | Blocking deps |
|-----|--------|-------|------|:---:|:------:|---------------|
| SYNC-001 | PWA/service-worker shell (offline substrate) | `angular.json`, `ngsw-config.json`(new), manifest | Med | No | L | none |
| SYNC-002 | Offline mutation queue / outbox | FE outbox(new), interceptors, IndexedDB | High | No | XL | SYNC-001, ENC-004, EXP-005 |
| SYNC-003 | Truthful offline banner | `group-detail.component.*` | Low | No | S | SYNC-002 |
| SRCH-001 | Cursor pagination correctness | `expenses.service.ts` (listExpenses) | Med | No | M | EXP-004/005 |
| SRCH-002 | Redis aggregation cache (perf) | `expenses.service.ts` analytics, Redis | Low | No | M | none |
| GRP-007 | History decrypt at correct version | `groups.service.ts`, audit metadata, FE | Med | Maybe | M | ENC-002, EXP-002/003 |
| GRP-005 | Rotate keys on member leave (needs versioned re-key) | `groups.service.ts` (removeMember), key rotation | Med | No | L | ENC-002 |

### Phase 4 — Attachments, personal finance & reports

| Gap | Reason | Files | Risk | Mig | Effort | Blocking deps |
|-----|--------|-------|------|:---:|:------:|---------------|
| ATT-001 | Real ZK attachment storage backend | storage adapter(new), FE upload, endpoints | High | Maybe | XL | ENC-002, ATT-002 |
| ATT-002 | Retire legacy plaintext attachment path | `expenses.service.ts`, DTOs | Med | No | M | ENC-002 |
| PF-002 | Goal title encryption (crypto fix) / goals feature | `goal.entity.ts`, `dto/goal.dto.ts`, FE | Med | Yes(if built) | L | Goals feature decision |
| PF-001 | Account deletion (PII-only) | `users.controller.ts`, `users.service.ts` | High | Maybe | L | ADR decision (PII scope) |

### Phase 5 — Authentication improvements & account lifecycle

| Gap | Reason | Files | Risk | Mig | Effort | Blocking deps |
|-----|--------|-------|------|:---:|:------:|---------------|
| AUTH-001 | Refresh-token transport (cookie vs body) | `auth.service.ts`, `auth.controller.ts`, FE interceptor | High | No | L | ADR decision |
| AUTH-002 | Password change/reset + UDK re-wrap | `auth.*`, `email.service.ts`, `users.service.ts` | High | Maybe | XL | NOTIF-002, email, ENC model |
| NOTIF-002 | Activate verify/reset email templates | `email.service.ts`, `auth.controller.ts` | Med | Maybe | M | (part of AUTH-002) |
| AUTH-007 | `saveKeys` re-auth + constant-time TOTP | `users.service.ts`, `totp.util.ts` | Med | No | M | AUTH-002 |

### Phase 6 — AI & enhancements

| Gap | Reason | Files | Risk | Mig | Effort | Blocking deps |
|-----|--------|-------|------|:---:|:------:|---------------|
| AI-002 | Constrain model/systemInstruction; ZK-content guard | `ai.controller.ts`, `ai.service.ts` | Med | No | M | AI-001 |
| AI-003 | Dedicated AI throttle / cost cap | `ai.controller.ts`, `throttle.constants.ts` | Low | No | S | AI-001 |
| GRP-004 | Invite revocation + token expiry | `groups.service.ts`, `group.entity.ts`, `invite.controller.ts` | Med | Maybe | M | none |
| NOTIF-003 | WebSocket real-time push (new) | new WS gateway, FE client | Med | No | XL | none |
| NOTIF-004 | In-app notification center (new) | notification entity(new), endpoints, FE | Med | Yes | L | none |
| GRP-006 | trip type (doc or feature) | `group.entity.ts`, DTO, docs | Low | Maybe | S/M | ADR decision |
| ENC-003 / EXP-006 / SYNC-003 | Documentation reconciliations | respective docs/code | Low | No | S each | ADR decision |
| RM-01…RM-06 | Roadmap features (not gaps) | — | — | — | — | product decision |

---

## 7. Architectural risk review

### Hotspots (files/areas touched by many gaps — change carefully, high regression surface)

1. **`backend/src/app/expenses/expenses.service.ts`** — the single largest blast radius. Touched by EXP-001/002/003/004/005/006/007/009, SRCH-001/002, ATT-002, and the personal-dashboard aggregation. It mixes CRUD, splits, analytics, carry-forward, and encryption metadata. **Any Phase 2/3 change risks the ledger.**
2. **`backend/src/app/groups/groups.service.ts`** — GRP-001/002/004/005/007, ENC-002/005. Mixes membership authz, invites, key-version tables, history, and audit. Concentrates both the Critical authz bug and the key-serving linchpin.
3. **Frontend crypto services** (`encryption.service.ts`, `group-key.service.ts`, `zk-key-vault.service.ts`, `expense-decryption.service.ts`) — ENC-002/004/005, EXP-002/003, GRP-007, SYNC-002, ATT-001. Client-side key handling; errors here silently produce undecryptable data.
4. **`shared/data-models/src/lib/expense-split.entity.ts`** — EXP-004/005/001. A single migration alters the split lifecycle model that the whole ledger depends on.
5. **`backend/src/main.ts` + throttler** — AUTH-004/005, NOTIF-001, AI-003. Cross-cutting boot/security config; low individual risk but affects every request.

### Highest-coupling modules

- **Encryption ↔ Groups ↔ Expense:** the key-version model spans all three (Groups owns the version tables, Expense stamps versions, Encryption resolves them). ENC-002 changes ripple into both others. This triangle is the architectural core; treat changes to it as coordinated, not local.
- **Auth ↔ Users ↔ Email ↔ Encryption:** the password/reset/UDK-rewrap flow (AUTH-002) couples all four. It is the most cross-module product work item.
- **Sync ↔ every mutating module:** the offline queue (SYNC-002) must understand each entity's version + conflict semantics, so it couples to Expense, Groups, Settlements simultaneously.

### Modules most likely to introduce regressions

1. **Expense/ledger** (financial correctness; soft-delete + version + settlement changes can corrupt balances or history).
2. **Key management** (a wrong version stamp or serve makes data permanently undecryptable — silent, hard to detect, not caught by typecheck).
3. **Offline sync** (replay/merge bugs can duplicate or drop mutations).
4. **Auth token transport** (AUTH-001 cookie migration can lock users out or break refresh across FE/BE).

### Areas requiring integration tests *before* implementation

Write/confirm these harnesses first (they map to `docs/testing-matrix.md` guarantee tests):

- **Key provisioning round-trip** — member A encrypts → member B decrypts (guards ENC-002, EXP-002/003, ATT).
- **Rotation correctness** — post-rotation, old data decrypts at its stamped version; removed member cannot decrypt new data (guards ENC-002, GRP-005, GRP-007).
- **Split invariants** — split sums = amount across all types; edit-after-settlement produces an adjustment, not a silent reset (guards EXP-001/004/005).
- **Currency consistency** — one-off and recurring writes reject non-base currency (guards EXP-007).
- **Optimistic-lock reconciliation** — 412 → merge/modal path stays intact under the split-version change (guards EXP-005, SYNC-002).
- **Auth refresh lifecycle** — rotation/revocation survive the transport change (guards AUTH-001).
- **AI opt-in gate** — `POST /ai/proxy` is rejected without a persisted opt-in (guards AI-001).

**Recommendation:** land the integration harnesses for key round-trip, rotation, and split invariants *before* starting Phase 2, because those three cover the highest-regression surfaces and currently have no dedicated coverage.

---

*End of provisional roadmap. Reconcile against ADRs before execution — see [canonical-sources.md](canonical-sources.md).*
