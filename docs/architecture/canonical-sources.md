# Canonical Architecture Sources

This page defines what will become the **canonical source of truth** for FinMate's architecture, and the current (provisional) state until those documents are imported.

## Canonical set (pending import)

Once provided by the project owner, the following documents become the authoritative references. Every gap, audit, and implementation decision will be reconciled against them. They live as **placeholders** today under [`adr/`](adr/) — reserved slots, no invented content:

| Canonical document      | Placeholder                                                      | Status            |
| ----------------------- | ---------------------------------------------------------------- | ----------------- |
| ADR-000                 | [adr/ADR-000.md](adr/ADR-000.md)                                 | ⏳ Pending import |
| ADR-001                 | [adr/ADR-001.md](adr/ADR-001.md)                                 | ⏳ Pending import |
| ADR-002                 | [adr/ADR-002.md](adr/ADR-002.md)                                 | ⏳ Pending import |
| ADR-003                 | [adr/ADR-003.md](adr/ADR-003.md)                                 | ⏳ Pending import |
| ADR-004                 | [adr/ADR-004.md](adr/ADR-004.md)                                 | ⏳ Pending import |
| ADR-005                 | [adr/ADR-005.md](adr/ADR-005.md)                                 | ⏳ Pending import |
| ADR-006                 | [adr/ADR-006.md](adr/ADR-006.md)                                 | ⏳ Pending import |
| ADR-007                 | [adr/ADR-007.md](adr/ADR-007.md)                                 | ⏳ Pending import |
| ADR-008                 | [adr/ADR-008.md](adr/ADR-008.md)                                 | ⏳ Pending import |
| ADR-009                 | [adr/ADR-009.md](adr/ADR-009.md)                                 | ⏳ Pending import |
| ADR-010                 | [adr/ADR-010.md](adr/ADR-010.md)                                 | ⏳ Pending import |
| ADR-011                 | [adr/ADR-011.md](adr/ADR-011.md)                                 | ⏳ Pending import |
| ADR-012                 | [adr/ADR-012.md](adr/ADR-012.md)                                 | ⏳ Pending import |
| ADR-013                 | [adr/ADR-013.md](adr/ADR-013.md)                                 | ⏳ Pending import |
| ADR-014                 | [adr/ADR-014.md](adr/ADR-014.md)                                 | ⏳ Pending import |
| ADR-015                 | [adr/ADR-015.md](adr/ADR-015.md)                                 | ⏳ Pending import |
| Non-Goals               | [adr/NON-GOALS.md](adr/NON-GOALS.md)                             | ⏳ Pending import |
| Architecture Principles | [adr/ARCHITECTURE-PRINCIPLES.md](adr/ARCHITECTURE-PRINCIPLES.md) | ⏳ Pending import |

## Provisional sources (in force until import)

Until the canonical set is imported, these are the **working** sources of truth. They are provisional and may be superseded, in part or whole, by the ADRs:

- [`docs/frozen-decisions.md`](../frozen-decisions.md) — working decision list (approximation of Non-Goals + settled decisions).
- [`docs/coding-rules.md`](../coding-rules.md) — working implementation rules (approximation of Architecture Principles).
- [`docs/PROJECT_DECISIONS.md`](../PROJECT_DECISIONS.md) — APPROVED decisions on record.
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — current architecture overview.

## Reconciliation protocol (runs the moment ADRs land)

The current [gap-tracker.md](gap-tracker.md) and all [audits/](../audits/) are **provisional** until reconciled. When the ADRs are imported:

1. Map each gap-tracker row to the specific ADR(s) it depends on; replace the "Source-of-truth" column value with the ADR id.
2. Drop or downgrade any gap that the ADRs render a non-issue (false positive) — **without** deleting the ID; mark it `Won't Fix (ADR-reconciled)` with a note.
3. Confirm the phase ordering in [implementation-roadmap-pre-adr.md](implementation-roadmap-pre-adr.md) against the ADR-stated principles/non-goals.
4. Promote that roadmap from "(Pre-ADR)" to the canonical roadmap.

## Rules while placeholders are unfilled

- Do **not** author ADR content, Non-Goals, or Principles into the placeholders.
- Do **not** treat the provisional sources as final.
- Do **not** begin implementation of any gap until its governing ADR is imported and the gap is reconciled.
