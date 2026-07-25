# Documentation Audit

Date: 2026-07-25
Scope: project documentation only. Application code was not modified.

## Files Updated

- `docs/architecture/canonical-sources.md`
  - Replaced pending-ADR placeholder model with an implementation-driven canonical documentation map.
  - Defined authority rules and update protocol.
- `docs/group-key-flow.md`
  - Rewrote as the canonical group key lifecycle document.
  - Documented key types, version-keyed session-cache behavior, canonical key resolution, provisioning, rotation, and expense decryption responsibilities.
- `docs/contracts/encryption-contract.md`
  - Updated the encryption/key-management contract to match current frontend/backend responsibilities and public key APIs.
- `docs/contracts/groups-contract.md`
  - Added Carry Forward and History/Audit boundaries.
  - Documented group-facing Carry Forward APIs and delegation to `ExpensesCarryForwardService` / `ExpensesService`.
- `docs/README.md`
  - Replaced the old freeze-pass navigation with a concise current documentation map.
  - Clarified that audit files are point-in-time evidence, not canonical implementation sources.

## Files Created

- `docs/DOCUMENTATION_AUDIT.md`
  - This audit report.

## Files Removed

Removed obsolete placeholder ADR files that contained no decisions and only reserved future slots:

- `docs/architecture/adr/ADR-000.md`
- `docs/architecture/adr/ADR-001.md`
- `docs/architecture/adr/ADR-002.md`
- `docs/architecture/adr/ADR-003.md`
- `docs/architecture/adr/ADR-004.md`
- `docs/architecture/adr/ADR-005.md`
- `docs/architecture/adr/ADR-006.md`
- `docs/architecture/adr/ADR-007.md`
- `docs/architecture/adr/ADR-008.md`
- `docs/architecture/adr/ADR-009.md`
- `docs/architecture/adr/ADR-010.md`
- `docs/architecture/adr/ADR-011.md`
- `docs/architecture/adr/ADR-012.md`
- `docs/architecture/adr/ADR-013.md`
- `docs/architecture/adr/ADR-014.md`
- `docs/architecture/adr/ADR-015.md`
- `docs/architecture/adr/NON-GOALS.md`
- `docs/architecture/adr/ARCHITECTURE-PRINCIPLES.md`

## Duplicate Docs Merged

- Group key lifecycle and cache behavior were consolidated into `docs/group-key-flow.md`.
- Encryption boundary rules were consolidated into `docs/contracts/encryption-contract.md`, which now links to `docs/group-key-flow.md` instead of duplicating lifecycle detail.
- Carry Forward and group History/Audit responsibilities were consolidated into `docs/contracts/groups-contract.md` and mapped from `docs/architecture/canonical-sources.md`.
- The documentation navigation in `docs/README.md` now points to canonical topic documents instead of treating the 2026-07-16 freeze-pass docs as daily drivers.

## Summary of Changes

The audit changed documentation from a provisional ADR-import model to an implementation-driven source-of-truth model. The current codebase shows versioned group keys, session-memory group key caching with legacy IndexedDB purge support, classified key resolution, group-key rotation with immutable history, centralized expense decryption, group-facing Carry Forward endpoints, and separate audit/version-history models. The updated docs now describe those behaviors directly and identify where each topic is authoritative.

Historical reasoning was preserved in `docs/PROJECT_DECISIONS.md`, `docs/frozen-decisions.md`, planning files, and audit snapshots. Empty ADR placeholders were removed because they did not preserve reasoning or implementation facts.

## Canonical Documentation Map

| Topic | Canonical source |
| --- | --- |
| System architecture | `ARCHITECTURE.md` |
| Data model and migrations | `DATABASE_SCHEMA.md` |
| API contracts | `docs/contracts/` and `openapi.yaml` |
| Encryption and group key lifecycle | `docs/group-key-flow.md`, `docs/contracts/encryption-contract.md` |
| Session-only group key cache | `docs/group-key-flow.md` |
| Canonical key resolution | `docs/group-key-flow.md` |
| Key rotation | `docs/group-key-flow.md` |
| Expense encryption/decryption | `docs/contracts/expense-contract.md`, `docs/group-key-flow.md` |
| Carry Forward | `docs/contracts/groups-contract.md`, `ARCHITECTURE.md` |
| History/Audit model | `ARCHITECTURE.md`, `docs/contracts/groups-contract.md` |
| Frontend/backend responsibilities | `ARCHITECTURE.md`, `docs/contracts/` |
| Security model | `ARCHITECTURE.md`, `docs/group-key-flow.md`, `docs/SECURITY_VERIFICATION_CHECKLIST.md` |
| Historical decisions | `docs/PROJECT_DECISIONS.md`, `docs/frozen-decisions.md` |
| AI/developer guidance | `AGENT_RULES.md`, `docs/coding-rules.md`, `docs/file-map.md` |

## Remaining Follow-Up

- Some historical audit/planning docs still mention the removed placeholder ADR files. They were left intact as historical snapshots except where canonical docs were updated.
- `openapi.yaml` and root API docs were not regenerated in this pass; endpoint contract updates were made in focused contract docs.

## Addendum: Expense Module Documentation Finalization (2026-07-25, later same day)

Follow-up pass scoped to the expense module, after a run of behavior-preserving internal
consolidations (`docs/changes/debt-simplifier-consolidation.md`,
`docs/changes/expense-response-mapper-consolidation.md`,
`docs/changes/display-name-resolver-consolidation.md`, `docs/changes/legacy-cleanup.md`) and a
design review (`docs/audits/history-decryption-audit.md`). No application code changed in this
addendum pass — documentation only.

**Files updated:**

- `docs/architecture/architecture-inventory.md` — removed the stale "ADR files not yet committed"
  framing (superseded by this file's Authority Rules), removed the deleted `ExpensesAccessService`
  facade reference, and added `backend/src/app/common/ledger-debt-simplifier.ts` and
  `member-display.util.ts` as shared implementation anchors for Expense and Settlements.
- `docs/README.md` — added `expsnsis-module-plan.md`, `zk_group_key_provisioning_architecture.md`,
  and `implementation_plan.md` to the Planning Docs list (previously present in the repo but not
  indexed, so their "single source of truth" self-descriptions could mislead a reader into treating
  them as current); added `EXPENSE_MODULE_STATUS.md` to Daily Drivers.
- `docs/KNOWN_ISSUES.md` — cross-referenced `docs/audits/history-decryption-audit.md` from KI-1 as
  independent architecture-level corroboration of the same root cause.
- `docs/architecture/canonical-sources.md` — added a "Settlement" row (the contract existed but the
  topic was missing from the map), added `EXPENSE_MODULE_STATUS.md` as the expense-module rollup,
  and documented `docs/changes/*.md` as the recorded convention for behavior-preserving internal
  consolidations.

**File created:** `docs/EXPENSE_MODULE_STATUS.md` — expense module status rollup: architecture
overview, current responsibilities, canonical documentation map, recent consolidations, known
intentional limitations, future prerequisites, and module status.

**Verified during this pass, no drift found:** `docs/contracts/expense-contract.md`,
`docs/contracts/settlements-contract.md`, `docs/contracts/groups-contract.md`,
`docs/contracts/encryption-contract.md`, `docs/group-key-flow.md` (Provisioning/Rotation/Expense
Decryption/Security Invariants sections), `ARCHITECTURE.md` §4/§6, `docs/module-checklist.md`,
`docs/file-map.md`, `docs/testing-matrix.md`. These describe responsibilities and boundaries, not
internal implementation structure, so this session's internal consolidations (which changed no
public API, DTO, or behavior) did not require edits to them.

**Left untouched (frozen historical/evidence records, per Authority Rules):**
`docs/audits/expense-architecture-audit.md`, `docs/audits/expense-audit.md`,
`docs/audits/expense-module-final-signoff-post-grot.md`,
`docs/audits/expense-module-release-signoff.md`,
`docs/audits/expense-module-architecture-verification.md`, `docs/product-decisions-v2-final.md`.

## Documentation Audit Summary — Expense Module Finalization (Complete)

Second, same-day follow-up pass closing out the "Expense Module Documentation Finalization" task.
Extends the addendum above (still accurate) with one additional real finding — a factual
contradiction, not just staleness — plus the explicit accounting below. No application code
changed; no historical audit/decision document was rewritten.

### Documents reviewed

Every document `docs/architecture/canonical-sources.md` maps to a topic touching the expense
module, plus every doc a repo-wide search for `simplifyDebts`, `ExpensesAccessService`,
`refreshGroupKey`, `clearLocalState`, `storeGroupKey`/`loadGroupKey`/`deleteGroupKey`,
`SplitCalculator`, `mapExpenseResponse`/`batchMapExpenseResponses`, `memberDisplay`, and
`Carry Forward` returned: `ARCHITECTURE.md`, `docs/README.md`, `docs/KNOWN_ISSUES.md`,
`docs/architecture/canonical-sources.md`, `docs/architecture/architecture-inventory.md`,
`docs/group-key-flow.md`, `docs/contracts/expense-contract.md`,
`docs/contracts/settlements-contract.md`, `docs/contracts/groups-contract.md`,
`docs/contracts/encryption-contract.md`, `docs/audits/expense-audit.md`,
`docs/audits/expense-architecture-audit.md`, `docs/audits/history-decryption-audit.md`,
`docs/module-checklist.md`, `docs/file-map.md`, `docs/testing-matrix.md`, and the root planning
docs (`expsnsis-module-plan.md`, `zk_group_key_provisioning_architecture.md`,
`implementation_plan.md`, `PRD.md`, `TRD.md`).

### Documents updated

- `ARCHITECTURE.md` §2 — **corrected a factual contradiction, not just drift**: the doc claimed
  "wrapped Group Keys are stored in a local IndexedDB cache via `ZkKeyVaultService`" in two places.
  This is false — confirmed by `docs/group-key-flow.md` (session-memory-only cache), by
  `GroupKeyService`'s actual implementation (a plain in-memory `Map`, never calling any
  `ZkKeyVaultService` group-key method), and directly by the legacy-cleanup pass, which found
  `ZkKeyVaultService.storeGroupKey`/`loadGroupKey`/`deleteGroupKey` had **zero callers** — i.e. the
  IndexedDB group-key path this section described doesn't just no longer run, the code path never
  ran in the current architecture. Rewrote to distinguish the personal master key (UDK — genuinely
  IndexedDB-persisted) from group keys (session-memory only), and pointed the rotation/provisioning
  narrative sections at `docs/group-key-flow.md` instead of restating its rules.
- `docs/EXPENSE_MODULE_STATUS.md` — added a "Module Boundaries" section (dependency direction
  between Expense/Settlements/Groups/Encryption and the most commonly-violated "must never" rules,
  distinct from "Current Responsibilities" which describes what each module owns); renamed two
  canonical-map rows to match this task's exact topic phrasing ("Session-memory group key cache",
  "Canonical group key convergence").
- All files listed in the prior addendum's "Files updated" remain accurate; see above.

### Documents merged

None. No two living (non-frozen) documents were found describing the same topic in conflicting or
copy-pasted detail. Places that looked like candidates on a first pass turned out to be
complementary, not duplicate, once read in full — same topic, different facet:

- `ARCHITECTURE.md` §2's Flow A/B/C **diagrams** (message sequences) vs. `group-key-flow.md`'s
  **prose rules** (Provisioning/Rotation sections) — kept both, but trimmed `ARCHITECTURE.md`'s
  prose paragraphs that restated rules already fully specified in `group-key-flow.md`, replacing
  them with pointers. This is the closest thing to a "merge" in this pass: convergence on one
  prose source of truth while keeping the diagram as a different, non-duplicate representation.
- `docs/contracts/expense-contract.md`'s one-line Settlements dependency mention vs.
  `docs/contracts/settlements-contract.md`'s full contract — a dependency pointer, not duplicated
  content.
- `ARCHITECTURE.md` §4's one-sentence Carry Forward mechanics summary vs.
  `docs/contracts/groups-contract.md`'s "Carry Forward Boundary" section — a one-line
  system-overview mention, not a restatement.

### Documents removed

None. No expense-related document was found to be fully obsolete (superseded end-to-end by
another document) as opposed to merely containing some stale references. Root planning docs
(`expsnsis-module-plan.md`, etc.) were reclassified via indexing rather than deleted, consistent
with how `PRD.md`/`TRD.md` are already handled — they retain historical planning value.

### Canonical documents created or selected

- **Created:** `docs/EXPENSE_MODULE_STATUS.md` — the expense-module rollup, with a canonical
  documentation map naming exactly one primary document per topic for all twelve topics this task
  lists.
- **Selected (already existed, now explicitly the designated canonical source in
  `canonical-sources.md`):** `docs/contracts/settlements-contract.md` for Settlement (the contract
  file existed but the topic row was missing from the map — a real gap, now closed).

### Obsolete references removed

- `ExpensesAccessService` reference in `docs/architecture/architecture-inventory.md`'s Expense
  source-files list (class deleted in `docs/changes/legacy-cleanup.md`).
- The "ADR files (ADR-000…ADR-015) have not yet been committed to this repo" framing in
  `architecture-inventory.md`, which contradicted `canonical-sources.md`'s own Authority Rules
  (those placeholders were removed in the original 2026-07-25 documentation audit).
- The false "wrapped Group Keys are stored in a local IndexedDB cache" claim in `ARCHITECTURE.md`
  §2 (two occurrences) — see "Documents updated" above.

### Verified again, no drift found

`docs/contracts/expense-contract.md`, `docs/contracts/settlements-contract.md`,
`docs/contracts/groups-contract.md`, `docs/contracts/encryption-contract.md`,
`docs/group-key-flow.md`'s Provisioning/Rotation/Expense-Decryption/Security-Invariants sections
(content, not the `ARCHITECTURE.md` cross-references into them), `docs/module-checklist.md`,
`docs/file-map.md`, `docs/testing-matrix.md`. All internal cross-references in every file touched
across both passes were checked to resolve to an existing file.

