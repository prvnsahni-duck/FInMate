# FinMate Documentation Map

Start here when updating or auditing FinMate documentation. The canonical source map is [`architecture/canonical-sources.md`](architecture/canonical-sources.md).

## Daily Drivers

| Doc | Use it for |
| --- | --- |
| [`architecture/canonical-sources.md`](architecture/canonical-sources.md) | The authoritative map of docs by topic. |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Current system architecture, module boundaries, security model, frontend/backend responsibilities, and key ledger mechanics. |
| [`../DATABASE_SCHEMA.md`](../DATABASE_SCHEMA.md) | Data model and migration-backed schema reference. |
| [`contracts/`](contracts/) | Module/API boundary contracts and non-negotiable invariants. |
| [`group-key-flow.md`](group-key-flow.md) | Canonical group key lifecycle, cache, rotation, and expense decryption reference. |
| [`EXPENSE_MODULE_STATUS.md`](EXPENSE_MODULE_STATUS.md) | Expense module status: architecture overview, canonical doc map, recent consolidations, known limitations. |
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | Known implementation limitations that remain current. |
| [`PROJECT_DECISIONS.md`](PROJECT_DECISIONS.md) and [`frozen-decisions.md`](frozen-decisions.md) | Historical reasoning and approved decisions. |
| [`coding-rules.md`](coding-rules.md), [`file-map.md`](file-map.md), [`testing-matrix.md`](testing-matrix.md) | Developer and AI-agent working rules. |

## Operational Docs

Runbooks and checklists remain operational references: release, disaster recovery, maintenance, production readiness, QA, E2E, and security verification. Keep them concise and link back to canonical topic docs instead of duplicating architecture.

## Audit Snapshots

Files under [`audits/`](audits/) record point-in-time evidence. They are useful for history, but the canonical docs and current codebase win when there is disagreement.

## Planning Docs

Root planning files such as `PRD.md`, `TRD.md`, `APP_FLOW.md`, `UI_UX_BRIEF.md`, `FinMate_Project_Specification.md`, `expsnsis-module-plan.md`, `zk_group_key_provisioning_architecture.md`, and `implementation_plan.md` are product/planning references. They are not the source of truth for current implementation details — where a planning doc's self-description ("single source of truth", "approved") conflicts with a canonical topic document under [`architecture/canonical-sources.md`](architecture/canonical-sources.md) or `docs/contracts/`, the canonical document and the current codebase win. See [`EXPENSE_MODULE_STATUS.md`](EXPENSE_MODULE_STATUS.md) for the expense module's current, implementation-driven status.
