# Add Expense UX — Implementation Roadmap (Planning Only)

> **Purpose:** Implementation roadmap — synthesizes the review + audit into a
> sequenced, phased plan with effort, risks, and gating decisions. **This is the
> authoritative sequencing** where it differs from the review.
> **Status:** Approved (roadmap). No phase implemented yet.
> **Last updated:** 2026-08-05
> **Related:** [Research & Review](./add-expense-ux-review.md) · [UX Audit](./add-expense-ux-audit.md)
>
> **No code, templates, styles, DTOs, APIs, or schema are changed by this
> document.** It draws on the review (capability + backend audit) and the audit
> (first-time UX findings).

## Guiding constraint

> **A normal expense is added in under 15 seconds.** Every item below must
> reduce cognitive load, scrolling, or taps — never add surface area to the
> default path. Advanced capability stays hidden until explicitly requested,
> even when the backend already supports it.

Effort key: **S** ≈ ≤0.5 day · **M** ≈ 1–3 days · **L** ≈ 1+ week.

---

## Release map at a glance

| Release | Theme | Net effort | Backend change | Risk |
|---|---|---|---|---|
| **1.1** | Quick polish (noise & clarity) | S (≈0.5–1 day total) | None | Very low |
| **1.2** | Reduce form height (scrolling) | M (≈1–2 days) | None | Low |
| **1.3** | Simplify the mental model | Design now; M–L to build later | None (UI restructure) | Medium |
| **2** | Advanced features | Design now; per-feature later | Some (multi-payer, OCR) | Feature-specific |

Sequencing rationale: ship the risk-free wins (1.1) first to build confidence,
then reclaim vertical space (1.2), *then* — only after the form is lean — tackle
the harder conceptual restructure (1.3), because 1.3's payoff is hard to judge
until the surrounding noise is gone. Phase 2 is gated behind an explicit product
decision and is deliberately not scheduled.

---

## Phase 1.1 — Quick UX Polish

Small, isolated, near-zero-risk template/logic tweaks.

### 1.1-a · Beta attachment warning only after a receipt is attached
- **Problem:** a loud amber 2-sentence warning renders on every Add Expense, even when no one attaches anything.
- **Why it matters:** it's the most visually aggressive element on the form and it fires in the 95% case where it's irrelevant.
- **Proposed solution:** render the warning only when `attachedFiles.length > 0` (keep the exact copy; the storage caveat is still shown before the user relies on a receipt).
- **User benefit:** calmer default form; the warning still appears exactly when it's actionable.
- **Complexity:** S · **Technical risk:** none · **Regression risk:** very low (pure `@if`) · **Dependencies:** none.

### 1.1-b · Surface the split-validation reason on the main form
- **Problem:** when a fixed split doesn't total, Save is disabled but the "Remaining ₹X" hint lives only inside the Customize sheet.
- **Why it matters:** a disabled button with no visible cause is a classic dead-end for first-timers.
- **Proposed solution:** show a small inline hint near the Split summary when `splitMode === 'fixed' && !splitIsValid()` (e.g. "Exact amounts must total {{ splitTotalLabel() }} — {{ splitRemainingLabel() }} left"). Reuses existing computeds.
- **User benefit:** the form tells you why you can't save, and where to fix it.
- **Complexity:** S · **Technical risk:** none · **Regression risk:** low · **Dependencies:** none.

### 1.1-c · Context-specific (or dropped) header subtitle
- **Problem:** subtitle always reads "Create or edit a shared expense for the group." while the H2 already says "Add New Expense"/"Edit Expense".
- **Why it matters:** redundant words at the top of a height-constrained sheet.
- **Proposed solution:** either drop the subtitle or make it mode-specific ("Add a shared expense" / "Edit this expense").
- **User benefit:** less to read; recovers a few px.
- **Complexity:** S · **Technical risk:** none · **Regression risk:** very low · **Dependencies:** none.

### 1.1-d · Hide "Select all" when everyone is already selected
- **Problem:** in the default state all participants are pre-selected, yet "Select all" is always shown.
- **Why it matters:** a no-op button adds noise to the common case.
- **Proposed solution:** show "Select all" only when `selectedUserIds.size < availableParticipants.length`; keep "Clear" always.
- **User benefit:** the participant card reads cleaner by default.
- **Complexity:** S · **Technical risk:** none · **Regression risk:** low · **Dependencies:** none.

### 1.1-e · Trim refund helper text
- **Problem:** two explanatory paragraphs appear when Refund is selected.
- **Why it matters:** helpful once, noise thereafter.
- **Proposed solution:** collapse to one concise line under the toggle; keep the deductions note only in the Notes placeholder (already present) rather than as a second paragraph.
- **User benefit:** the refund path stops feeling heavier than the expense path.
- **Complexity:** S · **Technical risk:** none · **Regression risk:** very low · **Dependencies:** none.

**Phase 1.1 total: S (≈0.5–1 day). No backend. No migration. Fully independent items — shippable in any order.**

---

## Phase 1.2 — Reduce Form Height

Goal: fit the default group expense on a single phone viewport with minimal
scroll. Approximate savings assume ~72–96px per labelled block on a 375×667
viewport.

### 1.2-a · Collapse Notes behind an "Add note" line
- **Problem:** an always-visible optional textarea (~120px).
- **Solution:** replace with a single "+ Add note" affordance that reveals the textarea on tap; auto-expanded in edit mode if a note already exists.
- **≈ vertical saved:** ~90px collapsed.
- **Complexity:** M · **Tech risk:** low · **Regression risk:** low (ensure the control still binds to `description`; edit-mode diff must still detect note changes) · **Dependencies:** none.

### 1.2-b · Collapse Attachments behind an "Add receipt" line
- **Problem:** label + Beta warning + button (~130px), even unused.
- **Solution:** single "+ Add receipt" affordance; reveals the uploader (and, per 1.1-a, the warning) only when engaged; auto-expanded in edit mode if attachments exist.
- **≈ vertical saved:** ~110px collapsed.
- **Complexity:** M · **Tech risk:** low · **Regression risk:** medium — attachment add/remove + edit-mode change detection must be re-verified · **Dependencies:** pairs with 1.1-a.

### 1.2-c · Tighten vertical spacing
- **Problem:** `space-y-4` (16px) across ~9 blocks.
- **Solution:** step to `space-y-3` where legibility allows; audit card paddings.
- **≈ vertical saved:** ~16–30px.
- **Complexity:** S · **Tech risk:** none · **Regression risk:** low (visual only) · **Dependencies:** none.

### 1.2-d · Revisit the currency selector footprint
- **Problem:** a full dropdown occupies half the Amount row though the group has a base currency rarely changed per-expense.
- **Solution (options):** (i) render currency as a compact tap-to-change symbol prefix on the Amount field; (ii) hide it unless the user opts to override the group currency. Keep the field editable — just smaller.
- **≈ vertical saved:** ~0 (row already shared) but frees horizontal space and reduces noise; lets Amount grow more prominent (supports the Phase-1.3 amount-first idea).
- **Complexity:** M · **Tech risk:** low · **Regression risk:** medium — multi-currency groups and existing non-group flows must still be able to change currency · **Dependencies:** none; complements 1.3.

**Phase 1.2 total: M (≈1–2 days). Estimated ~200–230px reclaimed (roughly a third of a phone viewport). No backend.**

---

## Phase 1.3 — Simplify the Mental Model (design exercise; do NOT implement)

**Question:** can a brand-new user understand **Paid By**, **Split With**, and
**Customize Split** within five seconds?

**Assessment:** Not reliably. Today these live as (1) a "Paid by" dropdown card,
(2) a "Split" card with an inline member checklist, and (3) a separate
"Customize Split" sheet for mode + amounts. Participant selection exists in *two*
places (the inline checklist and, implicitly, the sheet), which is the core
confusion. Three alternatives follow. **Splitwise's pattern is one input, not the
assumed answer.**

### Alternative A — Splitwise-style single sentence
```
Paid by [ You ▾ ]  ·  split [ equally ▾ ]  among [ 4 people ▾ ]
   └ tapping "equally" or "people" opens the detail sheet
```
- **Advantages:** most compact (one line); familiar; reads as natural language.
- **Disadvantages:** three inline controls get cramped on small phones; "among 4 people" still needs a picker; natural-language wrapping is fiddly to keep responsive.
- **Simplicity impact:** big height reduction; comprehension still = 3 concepts, just phrased as a sentence.
- **Migration effort:** M — collapse two cards into one line; reuse existing dropdown + sheet.

### Alternative B — Consolidated summary + one "Split details" sheet
```
┌ Split details ───────────────── Edit ┐
│ You paid · Split equally · 4 people   │   ← read-only summary on the form
└───────────────────────────────────────┘
   Edit → ONE sheet: Who paid? / Who shares? / How (Equal · Exact)
```
- **Advantages:** minimal default form (a single row); **one home** for every split concept — directly kills the dual-model confusion (audit #6); one obvious entry point.
- **Disadvantages:** changing the payer needs a tap even in the common case (mitigated: payer defaults correctly, so rarely touched); the sheet becomes denser.
- **Simplicity impact:** highest for the default form; strongest consolidation of the mental model.
- **Migration effort:** M–L — move payer selection into the sheet; make the main card a read-only summary; edit-mode diff must read from the new structure.

### Alternative C — Plain-language questions with avatar toggles
```
Who paid?     ( •You )  ( Naveen )  ( Praveen )  ( Riya )
Who shares?   [✓You] [✓Naveen] [✓Praveen] [✓Riya]     Split unequally →
```
- **Advantages:** plain questions are the most beginner-legible (best shot at the 5-second test); avatar tapping is fast and thumb-friendly; no dropdowns.
- **Disadvantages:** avatar rows consume horizontal space and wrap/scroll for large groups; still two labelled sections (some height).
- **Simplicity impact:** best comprehension; moderate height.
- **Migration effort:** M — reshape existing controls into avatar toggles + question labels; participant logic largely reused.

### Recommendation for 1.3
**Hybrid: B's consolidation shell + C's plain-language avatar selection inside
the sheet.** The default form shows a single read-only summary row (B); tapping
Edit opens one sheet titled with plain questions — "Who paid?" / "Who shares?" /
"How to split?" — using avatar toggles (C), with "Equal / Exact" as the only
mode control (Phase 1 scope). This yields the leanest default form *and* the
clearest single place to learn the model, without adopting A's cramped inline
sentence. Build only after 1.1 + 1.2 land. **Effort: M–L; UI-only, no backend.**

---

## Phase 2 — Advanced Features (design proposals only; do NOT implement)

| Feature | Real user value | Frequency | Added complexity | Hide behind advanced? | Backend impact | Est. effort |
|---|---|---|---|---|---|---|
| **Percentage split** | Income-proportional sharing | Low–Med | Low (calc/DTO/preserve exist) | Yes — inside the split sheet only | **None** (already supported) | S (template) |
| **Share split** | Rent by room, couples, kids | Med | Low (already supported) | Yes — inside the split sheet | **None** | S (template) |
| **Multi-payer** | "We both put in cash" | Low (<5–10%) | High | Yes — "Multiple people paid" opt-in | **Schema + settlement/analytics/refund/export/duplicate** re-verify | L (1–2 wks) |
| **Receipt OCR** | Faster entry | Low | Very high | Yes — optional scan action | New service + parsing + likely 3rd-party | L |
| **Itemized expenses** | Line-by-line bill splitting | Very low | Very high | Yes — separate flow | New line-item model + calc | L |

Notes:
- **Percentage/Share** are the cheapest possible re-introductions — end-to-end
  backend support already exists and edit mode already preserves them; exposing
  them is essentially adding two buttons + input rows to the split sheet. They
  remain **out of Phase 1 by product choice, not technical cost.**
- **Multi-payer** is the only item forcing a data-model change (the single-payer
  DB `CHECK` and the "credit one payer the full amount" balance loop). It
  warrants its own design doc + migration (`expense_payers` join table) and a
  full vertical re-verification. Keep it opt-in; never on the default form.
- **OCR / itemized** are differentiators, not table stakes, and conflict with
  the simplicity mandate. Park unless a clear user demand emerges.

---

## Product risks

- **Over-collapsing (1.2/1.3):** hiding Notes/Attachments/currency can make
  features undiscoverable. Mitigate by auto-expanding in edit mode when data
  exists, and keeping affordances labelled ("+ Add note", not just an icon).
- **Change fatigue on a critical flow:** Add Expense is core muscle memory.
  Ship small (1.1) → measure → proceed. Avoid a big-bang redesign.
- **1.3 restructure regressing the <15s promise:** any new "tap to edit" step
  must be offset by the default path staying fully pre-filled, so the common
  case is still zero extra taps.
- **Advanced creep:** each Phase 2 feature pressures the default UI. Enforce the
  "hidden until requested" rule as an acceptance criterion, not a nicety.

## Technical risks

- **Edit-mode change detection** (`changeSummary`, `originalSnapshot`,
  `originalSplits`, per-field "Modified") is tightly coupled to the current
  field layout. Any control that moves (Notes collapse, payer into sheet,
  currency affordance) must keep feeding the diff or edit UX silently breaks.
- **Split preservation invariant:** existing percent/share expenses must keep
  being preserved verbatim (via `originalSplits`) regardless of UI restructure —
  covered by existing specs; re-run them for every phase.
- **Encryption scopes** (`personal` / `group` / `direct_shared`) and the
  crypto/group-key resolution paths are threaded through `onSubmit`; UI changes
  must not disturb payload assembly.
- **Currency footprint change** must not break multi-currency groups, refunds,
  or the non-group ("Split with Friends") flow.
- **Multi-payer** touches settlements, analytics attribution, refunds,
  export/import round-trip, and duplicate detection — treat as its own project.

---

## Final recommendation

1. **Ship Phase 1.1 now** — five S-sized, independent, backend-free wins that
   remove the loudest noise (Beta warning, dead Save reason, redundant subtitle,
   no-op button, wordy refund copy). ~0.5–1 day, negligible risk.
2. **Then Phase 1.2** — collapse Notes + Attachments and tighten spacing to
   reclaim ~a third of a phone viewport; revisit the currency footprint as the
   bridge toward a more prominent amount. ~1–2 days.
3. **Then Phase 1.3** — implement the **B+C hybrid** (single summary row on the
   form; one plain-language, avatar-based "Split details" sheet) to make the
   model learnable in five seconds and eliminate the dual participant-selection
   surfaces. UI-only, M–L, only after the form is already lean.
4. **Hold Phase 2** behind an explicit product decision. If/when demand appears,
   **Percentage + Shares** are the cheapest additions (template-only, already
   backend-supported, edit-safe); **Multi-payer** gets its own design doc and
   migration; **OCR/itemized** stay parked.

Reasoning: this order front-loads certain, low-risk value; defers the one
conceptually hard change until the surrounding noise is gone (so its benefit is
measurable); and keeps every advanced capability gated so the sub-15-second
default path is never taxed for a minority scenario.
