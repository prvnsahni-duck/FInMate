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

