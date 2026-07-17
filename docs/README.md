# FinMate Documentation Map

Navigation for the architecture-governance docs created in the 2026-07-16 freeze pass.
Start here; the daily-driver docs are the inventory, gap tracker, and contracts.

## Daily drivers

| Doc | Use it to… |
|-----|------------|
| [architecture/architecture-inventory.md](architecture/architecture-inventory.md) | One-page system map: modules, owners, source files, contracts. Reference it in audit prompts. |
| [architecture/gap-tracker.md](architecture/gap-tracker.md) | **Single source of truth** for architecture-vs-code gaps. Every gap has a stable ID (say "Implement GRP-001"). Provisional until ADR reconciliation. |
| [architecture/implementation-roadmap-pre-adr.md](architecture/implementation-roadmap-pre-adr.md) | **Provisional execution plan**: dependency mapping, dependency graph, classification, duplicate detection, phased roadmap, risk review. |
| [architecture/canonical-sources.md](architecture/canonical-sources.md) | What becomes canonical once ADRs are imported; the reconciliation protocol; provisional vs. final sources. |
| [architecture/planning-baseline-v2.md](architecture/planning-baseline-v2.md) | **Documentation Freeze Candidate** snapshot: the full planning state + validation result. |
| [architecture/adr/](architecture/adr/) | Placeholder slots ADR-000…015 + Non-Goals + Architecture Principles (pending import — no invented content). |
| [contracts/](contracts/) | Per-module boundary contracts: responsibilities, inputs/outputs, and **Must NEVER**. |
| [prompts.md](prompts.md) | The four standard prompts (Audit / Implement / Review / Test). |

## Governance / rules

| Doc | Purpose |
|-----|---------|
| [frozen-decisions.md](frozen-decisions.md) | Settled decisions. Don't re-propose alternatives without an ADR. |
| [coding-rules.md](coding-rules.md) | Non-negotiable implementation rules that encode the invariants. |
| [file-map.md](file-map.md) | What each key file is for and what must NOT go in it. |
| [module-checklist.md](module-checklist.md) | Per-module ☑/⚠/☐ status. |
| [architecture/adr-map.md](architecture/adr-map.md) | Decision → affected files, so a task reads only what it needs. |
| [testing-matrix.md](testing-matrix.md) | Which test dimensions each flow needs + architectural-guarantee tests. |

## Audits (2026-07-16 sweep)

Full evidence behind every gap-tracker row, one file per module, in [audits/](audits/):
[expense](audits/expense-audit.md) · [encryption](audits/encryption-audit.md) · [auth](audits/auth-audit.md) ·
[groups](audits/groups-audit.md) · [sync](audits/sync-audit.md) · [personal-finance](audits/personal-finance-audit.md) ·
[attachments](audits/attachments-audit.md) · [search-projection](audits/search-projection-audit.md) ·
[notifications](audits/notifications-audit.md) · [ai](audits/ai-audit.md)

## Pre-existing docs (not part of this pass)

Root: `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `TRD.md`, `PRD.md`, `FinMate_Project_Specification.md`.
`docs/`: `PROJECT_DECISIONS.md` (APPROVED decisions), `KNOWN_ISSUES.md` (KI-1 etc.), runbooks and checklists.

## The workflow this supports

1. **Freeze the architecture** — audits done; gaps tracked. ✅
2. **Fix one gap at a time** — "Implement `<GAP-ID>`", then Review, then Test, then commit.
3. **Review after every change** — re-run the Review prompt to catch regressions.
4. **Freeze v2** — when the tracker is clear, freeze ADRs / schema / crypto / sync / API; further changes need a new ADR.

> ADR files (ADR-000…015) are referenced throughout but not yet committed. Until then the authoritative
> sources are `frozen-decisions.md`, `PROJECT_DECISIONS.md`, and `ARCHITECTURE.md`. Importing the ADRs into
> `docs/architecture/` and swapping the "source-of-truth" columns for ADR ids is the natural next step.
