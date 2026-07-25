# Canonical Documentation Sources

This file is the source-of-truth map for FinMate documentation. Documentation is implementation-driven: when code changes, update the canonical document for the affected topic in the same change.

## Canonical Map

| Topic | Canonical document | Implementation anchors |
| --- | --- | --- |
| System architecture | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | `backend/src/app/app.module.ts`, `frontend/src/app/app.routes.ts`, `shared/data-models/src/lib/` |
| Data model and migrations | [`../../DATABASE_SCHEMA.md`](../../DATABASE_SCHEMA.md) | `shared/data-models/src/lib/*.entity.ts`, `backend/src/migrations/` |
| API contracts | [`../contracts/`](../contracts/) and [`../../openapi.yaml`](../../openapi.yaml) | Nest controllers under `backend/src/app/**` |
| Encryption and key lifecycle | [`../group-key-flow.md`](../group-key-flow.md), [`../contracts/encryption-contract.md`](../contracts/encryption-contract.md) | `frontend/src/app/core/services/encryption.service.ts`, `group-key.service.ts`, `zk-key-vault.service.ts`, backend group key endpoints |
| Expense encryption/decryption | [`../contracts/expense-contract.md`](../contracts/expense-contract.md) | `frontend/src/app/core/services/expense-decryption.service.ts`, `expense-decrypt-coordinator.service.ts`, `backend/src/app/expenses/expenses.service.ts` |
| Carry Forward | [`../contracts/groups-contract.md`](../contracts/groups-contract.md), [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | `backend/src/app/expenses/services/expenses-carry-forward.service.ts`, `ExpensesService.closeMonth`, `ExpensesService.getCarryForwardSummary` |
| History and audit model | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), [`../contracts/groups-contract.md`](../contracts/groups-contract.md) | `shared/data-models/src/lib/audit-log.entity.ts`, `expense-version.entity.ts`, `backend/src/app/groups/services/groups-audit.service.ts`, expense version methods |
| Security operations | [`../SECURITY_VERIFICATION_CHECKLIST.md`](../SECURITY_VERIFICATION_CHECKLIST.md), [`../PRODUCTION_READINESS_CHECKLIST.md`](../PRODUCTION_READINESS_CHECKLIST.md) | Auth, throttling, Redis session, and encryption services |
| Historical decisions | [`../PROJECT_DECISIONS.md`](../PROJECT_DECISIONS.md), [`../frozen-decisions.md`](../frozen-decisions.md) | Historical reasoning only; do not duplicate current behavior here |
| AI/developer rules | [`../../AGENT_RULES.md`](../../AGENT_RULES.md), [`../coding-rules.md`](../coding-rules.md), [`../file-map.md`](../file-map.md) | Repo workflow and coding invariants |

## Authority Rules

- Each major topic has one canonical document. Other docs should link to it instead of restating the same design.
- Historical documents preserve why a decision was made, but current behavior belongs in the canonical topic document.
- Audits under `docs/audits/` are evidence snapshots. They are not authoritative after the code changes unless refreshed.
- Roadmaps, PRDs, TRDs, and project specifications are planning references. Treat implementation and canonical contracts as authoritative when they disagree.
- ADR placeholder files were removed in the 2026-07-25 documentation audit because they contained no decisions. Future ADRs should be added only with real accepted content.

## Update Protocol

1. Change code.
2. Update the canonical document for the affected topic.
3. Update API docs or `openapi.yaml` when request/response shapes change.
4. Record large documentation cleanups in `docs/DOCUMENTATION_AUDIT.md`.
