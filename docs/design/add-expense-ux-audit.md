# Add Expense UX — First-Time-User Audit

> **Purpose:** First-time-user UX audit — walkthroughs of the current flow and
> the concrete issues (noise, height, taps, unclear model) they surface.
> **Status:** Approved (findings). Fed into the roadmap's phased plan.
> **Last updated:** 2026-08-05
> **Related:** [Research & Review](./add-expense-ux-review.md) · [Implementation Roadmap](./add-expense-ux-roadmap.md)
>
> Scope: `create-expense-modal` (group + personal + direct-share). **No code changes.**

Grounded in the current template/labels
([create-expense-modal.component.html](../../frontend/src/app/features/groups/components/create-expense-modal/create-expense-modal.component.html)),
not screenshots. Real screenshots would require the app + backend + a seeded,
unlocked encrypted group.

## Walkthroughs

- **Normal expense (group):** Transaction-Type toggle → Title → Amount+Currency
  → Category+Date → Paid by (card) → Split (card + checklist) → Notes →
  Attachments + Beta warning → Save. **~9 vertical blocks before the button.**
- **Refund:** same, plus **two explanatory paragraphs** (under the toggle and
  under Notes).
- **Exact-amount split:** Split card → "Customize Split" → nested sheet →
  toggle _Exact Amount_ → per-person amounts → watch Remaining → Done → Save.
  **Nested sheet + 2 extra taps.**
- **Edit:** every changed field shows a "Modified" chip **and** a focus ring,
  **plus** a bottom "Changes" summary card.

## Findings

| #   | Issue                                                                 | Why it hurts a first-timer                                                    | Severity |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| 1   | Transaction Type is the very first control                            | 95% add an expense; leading with Expense/Refund is tax before typing anything | High     |
| 2   | Notes + Attachments always expanded                                   | Two optional, rarely-used blocks add height & scrolling on every add          | High     |
| 3   | Attachment Beta warning is loud amber text on every expense           | Wordy 2-sentence warning shown even when nothing is attached                  | Med      |
| 4   | "Paid by" and "Split" are two stacked padded cards                    | Extra height + two mental steps; leading apps collapse to one line            | Med      |
| 5   | Split invalid → Save disabled with no reason on the main form         | "Remaining ₹X" only shows inside the sheet; dead Save button confuses         | Med      |
| 6   | Inline member checklist **and** Customize sheet both manage the split | Two places to reason about "who's involved" vs "how much"                     | Med      |
| 7   | Header subtitle "Create or edit a shared expense…"                    | Redundant with the H2; always says "Create or edit"                           | Low      |
| 8   | Refund helper text is two paragraphs                                  | Good intent, noisy                                                            | Low      |
| 9   | "Select all" shown even when all are already selected (default)       | Dead button in the common case                                                | Low      |
| 10  | Edit mode: per-field chips + rings **and** a summary card             | Redundant signalling; screen lights up                                        | Low      |
| 11  | Currency dropdown takes half the amount row                           | Group already has a base currency; rarely changed                             | Low      |

## Vs. leading apps (where FinMate can get simpler, not copy)

- **Tricount / Google Wallet:** amount-first, type/advanced hidden → demote the
  Refund toggle, foreground amount.
- **Splitwise:** "paid by X · split equally" single collapsible sentence →
  collapse Paid-by + Split into one summary line (findings #4/#6).
- **Settle Up:** explicit member list, but it's the _only_ one — no duplicate
  inline + sheet (finding #6).

## Prioritized recommendations (impact ÷ effort)

**Do first — high impact, Small effort:** (1) Beta warning only after a file is
attached; (2) surface "must total ₹X" on the main form; (3) context-specific or
dropped subtitle; (4) hide "Select all" when all selected; (5) trim refund
helper text.

**High-value — Medium effort:** (6) collapse Notes + Attachments behind an
"Add note / receipt" line; (7) demote the Refund toggle; (8) merge Paid-by +
Split into one Splitwise-style summary line.

**Bigger bets — Large effort (defer):** (9) participant selection only in the
sheet, main form shows a pure summary; (10) amount-first layout.

**Net:** the happy path is already fast; the highest-leverage work is reducing
vertical noise (#1–#4) and clarifying the split model (#5, #6). None require
backend changes.
