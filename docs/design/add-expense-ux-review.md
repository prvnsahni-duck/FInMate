# Add Expense UX — Research & Design Review

> **Purpose:** Research & competitive analysis — what Add Expense does today,
> how leading apps handle expense creation, and which capabilities are worth
> exposing. The "why" behind the product direction.
> **Status:** Approved (research). Its Phase A/B/C *sequencing* is superseded —
> see the reconciliation note below and the roadmap.
> **Last updated:** 2026-08-05
> **Related:** [UX Audit](./add-expense-ux-audit.md) · [Implementation Roadmap](./add-expense-ux-roadmap.md)
>
> Scope: `create-expense-modal` (group + personal + direct-share). **No implementation** — planning only.

---

## 0. TL;DR / Recommendation

FinMate's Add Expense flow is already in good shape and was *deliberately
simplified* in the most recent commit (`94d28e4 feat: simplify add expense
split UX`) down to **Equal + Exact Amount**. The backend, however, still fully
supports four split algorithms (`equal`, `fixed`, `percent`, `share`) with
cent-accurate deterministic math. So most of the "advanced" capability already
exists in the data model and API — the open questions are almost entirely about
**how much to expose in the UI**, plus one genuinely new capability
(**multi-payer**) that would need a schema change.

**Recommendation in one line:** keep the default flow exactly as simple as it is
now, re-expose **Percentage** and **Shares** inside the existing "Customize
Split" sheet (near-zero backend cost), and treat **multi-payer** as a separate,
later, opt-in phase because it is the only item that forces a data-model change
and is used by a small minority of expenses.

Do **not** add anything to the default (collapsed) form. Every new capability
belongs behind the "Customize Split" progressive-disclosure surface that already
exists.

> **Product decision (2026-08-05) — supersedes the sequencing in this document.**
> Percentage and Shares will **remain hidden for now**; they are *not* the
> recommended first step. They stay fully backend-supported and preserved on
> edit, but exposing them is deferred to a gated **Phase 2** in the
> [roadmap](./add-expense-ux-roadmap.md), which is the **authoritative
> sequencing**. The "Phase A/B/C" plan below is retained as original research
> (the *option* is genuinely cheap); the *decision* was to prioritize
> simplicity/height polish over exposing more split modes. Where this document
> and the roadmap differ on ordering, the roadmap wins.

---

## Phase 1 — Audit of the Existing Implementation

### 1.1 Current UI flow

Component: [create-expense-modal.component.ts](../../frontend/src/app/features/groups/components/create-expense-modal/create-expense-modal.component.ts)
· template: [create-expense-modal.component.html](../../frontend/src/app/features/groups/components/create-expense-modal/create-expense-modal.component.html)

The modal serves **three modes** from one component:

| Mode | Trigger | Payer/Split UI shown? |
|------|---------|-----------------------|
| Personal | no `groupId`, "Split with Friends" off | No — expense is just yours |
| Direct-share | no `groupId`, "Split with Friends" on | Yes — search + add friends |
| Group | `groupId` set | Yes — group members |

Default group flow (the common path):

1. Transaction Type toggle (Expense / Refund) — defaults to Expense.
2. Title (required).
3. Amount + Currency (currency pre-filled from group).
4. Category + Date (date defaults to today).
5. **Paid by** — defaults to the current user.
6. **Split** — defaults to *equal among all active members*, all pre-selected.
7. Notes (optional), Attachments (optional).

The split section shows a **summary card** ("Equal between N people", "N
selected") with a member checklist and Select-all / Clear. A **"Customize
Split"** link opens a separate bottom-sheet where the user picks **Equal** or
**Exact Amount** and, for Exact, types per-person amounts with a live
Expense / Assigned / Remaining tally.

### 1.2 Current data model

- **Expense** ([expense.entity.ts](../../shared/data-models/src/lib/expense.entity.ts)):
  single payer — a DB `CHECK` enforces *exactly one* of `paidByUserId` /
  `paidByGroupMemberId` is set. `amountTotal` (decimal 12,2), `currency`,
  `category`, `transactionType` (`expense` | `refund`), `expenseDate`,
  `encryptionScope` (`personal` | `group` | `direct_shared`), `version`
  (optimistic concurrency).
- **ExpenseSplit** ([expense-split.entity.ts](../../shared/data-models/src/lib/expense-split.entity.ts)):
  one row per participant. `splitType` (`equal`|`fixed`|`percent`|`share`),
  `shareValue` (decimal 12,4 — the raw input), `amountOwed` (decimal 12,2 — the
  computed cent-accurate owed amount), plus a `CHECK` that each split names
  exactly one participant (user *or* group member).
- Group expenses key both payer and participants by **GroupMember**, not User,
  so pending (Contact-backed, account-less) members can still participate. The
  UI resolves member↔user ids in both directions (`resolveParticipantUserId`).

**Key fact:** the schema already supports all four split types and stores both
the raw share and the resolved owed amount. It does **not** support more than
one payer.

### 1.3 Validation rules

- **Client** (`expenseForm`): title required/≤160, amount required/≥0.01,
  currency/category/date/payer required, ≥1 participant, and `splitIsValid()`
  (equal always ok; fixed must total to the cent; percent must sum to 100;
  share must be >0).
- **Server DTO** ([expense.dto.ts](../../shared/data-models/src/lib/dto/expense.dto.ts)
  + [split-payload.validator.ts](../../backend/src/app/expenses/dto/split-payload.validator.ts)):
  uniform `splitType` across lines, unique participants, exactly-one-identifier
  per split, equal ⇒ every `shareValue === 1`, percent ⇒ sum 100, fixed ⇒ sum
  equals `amountTotal` (cent-compared).
- **Canonical calculator** ([split-calculator.ts](../../shared/utils/src/lib/split-calculator.ts)):
  deterministic, integer-cent math with remainder distribution ordered by
  payer-priority then participant key — so rounding is stable and the payer
  absorbs the odd cent first.

Validation is **defense-in-depth**: client, DTO, and calculator each re-check.

### 1.4 Backend API & settlement calc

- `POST /expenses` / `PATCH /expenses/:id` (create/update). Update carries
  `version` for optimistic-lock conflict detection.
- Settlement math ([settlements.service.ts](../../backend/src/app/settlements/settlements.service.ts)):
  per-currency balance map keyed by GroupMember. Payer gets `+amountTotal`; each
  participant gets `-amountOwed`; refunds invert the sign on both sides;
  confirmed settlements fold in. Balances are then run through a debt simplifier
  to suggest the minimum set of transfers.
- **Multi-payer implication:** the balance loop credits the *single* payer the
  *full* `amountTotal`. Supporting several payers means either multiple
  payment rows or splitting the credit — i.e. a real schema + calc change.

### 1.5 Refund compatibility

Refunds are first-class: `transactionType: 'refund'` reuses the identical
paidBy/split model but is treated as a **negative expense** everywhere (balances,
net-spend, analytics, export/import round-trip). This is already a solved,
documented invariant (see project memory: *refund-net-calculation*). Any Add
Expense change must preserve it — in practice that means: whatever split types we
expose for expenses must behave identically for refunds (they do today).

### 1.6 Edit expense flow

Strong. On open in edit mode the modal:

- Resolves member↔user ids so payer + participants render correctly.
- Snapshots the original editable state and shows a **live "Changes" diff**
  (from → to per field) with per-field "Modified" badges.
- **Preserves the original split configuration verbatim** unless the participant
  set changes or the split is explicitly edited — so changing an unrelated field
  (e.g. title) never silently flattens a percent/share/fixed split to equal.
- Disables Save when nothing changed; guards no-op updates server-bound.

This is the flow most at risk from a redesign and deserves the most care.

### 1.7 Mobile experience

Mobile-first already: full-height bottom-sheet on mobile / centered modal on
desktop, sticky header + footer, scrollable body, `pb-safe` for the home
indicator, large touch targets, a drag-handle affordance on the split sheet, and
a participant search that appears only once there are ≥8 members.

### 1.8 Identified limitations

1. **Single payer only.** No way to record "Naveen paid ₹700, Praveen ₹300".
   Blocked by the DB `CHECK` and the settlement credit loop.
2. **Percent & Share are hidden dead-ends in the UI.** The component still has
   all the logic (`selectSplitMode('percent'|'share')`, `seedShareDrafts`,
   `seedEqualPercentDrafts`, summary strings) but the split sheet's mode toggle
   only renders **Equal / Exact Amount**. So the capability exists everywhere
   *except* where a user could pick it. (Edit mode can still *display/preserve* a
   percent/share split created via API/import, but can't create one.)
2. **No receipt scanning / OCR.** Attachments are manual.
3. **Attachments are device-local (Beta).** Stored in `localStorage`, not
   synced — an explicit, documented Beta limitation, not an Add-Expense flaw.
4. **Amount is a raw number input**, not a keypad-style entry; fine on desktop,
   slightly less "money-app" on mobile.

---

## Phase 2 — Industry Research

How mature expense-sharing apps handle creation (informed by their public UX):

### Splitwise
- **Default:** "You paid, split equally." One line, one tap to change each side.
- **"Paid by" and "Split" are two separate tappable rows** — the mental model
  is explicitly *who paid* vs *how to split*, decoupled.
- Advanced split screen has tabs: **=, 1.23 (exact), % , shares, +/- adjustment,
  itemized**. Multi-payer is under "Paid by → multiple people," entered as exact
  amounts per payer that must total the expense.
- Strength: the two-row "paid by / split" model scales from trivial to complex
  without moving the simple case. Weakness: the advanced screen is dense.

### Tricount
- **Radically simple default:** amount, title, who paid (single), and who's
  involved (checkboxes, equal). Advanced splitting (shares/percentages/amounts)
  is one tap away but the default never shows it.
- No multi-payer in the core flow. Strength: fastest simple entry. Weakness:
  fewer power features.

### Settle Up
- Similar to Tricount but supports **multiple payers** natively and split by
  shares/percent/amount. Uses a "for whom" weight editor. Strength: flexible.
  Weakness: the multi-payer + weights UI is the busiest of the group.

### Google Wallet / Google Pay split
- Extremely minimal: equal split among selected contacts, request money. Almost
  no advanced options — optimized for *requesting*, not *bookkeeping*.

### Splitser / others
- Converge on the same pattern: **simple equal default + a progressive
  "advanced split" surface**, with shares as the most-used non-equal mode
  (because "1 share vs 2 shares" maps to real life: couples, kids, rooms).

### Cross-app takeaways
- **Everyone defaults to "you paid, equal split."** FinMate already does this.
- **"Paid by" and "Split" are conceptually separate.** FinMate already renders
  them as separate sections — good.
- **Shares is the highest-value non-equal mode**, more used than exact amounts
  for recurring group life (rent, trips). FinMate hides both shares *and*
  percent today.
- **Multi-payer is universally an advanced, opt-in affordance**, never on the
  default form. Only Splitwise/Settle Up support it at all.
- **Itemized / receipt-OCR is a differentiator, not table stakes**, and adds
  large complexity. Not recommended for FinMate now.

---

## Phase 3 — Feature-by-feature evaluation vs FinMate

| Feature | Useful? | Real problem solved | Adds complexity | Frequency | Default? | Can hide until needed? |
|---|---|---|---|---|---|---|
| Equal split | Essential | The 90% case | None | Very high | **Yes** | — |
| Exact amounts (fixed) | Yes | "I only had the ₹200 dish" | Low (already built) | Medium | No | Yes (in sheet, built) |
| Percentage | Moderate | Income-proportional sharing | Low (already built in backend) | Low–med | No | Yes (in sheet) |
| Shares | **Yes** | Rent by room, couples, kids | Low (already built in backend) | Medium | No | Yes (in sheet) |
| Multi-payer | Moderate | "We both put in cash" | **High (schema + calc)** | Low (<5–10%) | No | Yes (payer section) |
| Receipt OCR | Nice-to-have | Faster entry | Very high | Low | No | Separate feature |
| Itemized split | Niche | Splitting a bill line-by-line | Very high | Very low | No | Not now |

**Interpretation:** the cheapest wins are Percentage and Shares — the code is
already written and validated end-to-end; they only need a UI toggle. The
expensive item is Multi-payer. OCR/itemized are out of scope for the "keep it
simple" mandate.

---

## Phase 4 — Design principles (scored against today's build)

| Principle | Status today |
|---|---|
| First-timer understands it immediately | ✅ labels + defaults are clear |
| Normal expense in <15s | ✅ open → type title → type amount → Save (everything else defaulted) |
| Advanced options don't clutter default | ✅ "Customize Split" is progressive |
| Mobile-first | ✅ bottom-sheet, safe-area, big targets |
| Minimal scrolling | ⚠️ form is long; type/notes/attachments add height |
| Large touch targets | ✅ |
| Clear validation | ✅ inline + live remaining tally |
| No unnecessary steps | ✅ |

The build already satisfies the principles. The redesign risk is **regressing**
them by adding surface area — which is exactly why new capability should stay
behind "Customize Split."

---

## Phase 5 — Multi-payer analysis

**Verdict: valuable but defer to a dedicated later phase. Not in the default
flow; behind an opt-in toggle when built.**

Why defer:

- It is the **only** requested capability that forces a **data-model change**.
  Today one payer is credited the full `amountTotal` in the balance loop; the DB
  `CHECK` guarantees a single payer column.
- Used in a **minority** of expenses; loading it into the default flow taxes the
  common case for a rare one.
- Correct implementation is invasive: create/edit, settlement math, refunds,
  analytics attribution, export/import, and duplicate detection all assume one
  payer.

Recommended shape *when* built (least-complex UX):
- Payer section stays a single dropdown by default.
- A small **"Multiple people paid"** link reveals a per-payer amount editor
  (identical mental model + validation to the existing Exact-Amount split: a
  live Paid / Total / Remaining tally that must reconcile).
- Only appears when the user asks for it; single-payer expenses are byte-for-byte
  unchanged.

Migration sketch in Phase 9.

---

## Phase 6 — Split options recommendation

- **Default:** Equal. (No change.)
- **Optional, inside "Customize Split":** Exact Amount (built), **Shares**
  (re-expose), **Percentage** (re-expose).
- **Ordering in the sheet** by real-world frequency: **Equal · Shares · Exact ·
  Percentage** (or Equal/Exact/Percentage/Shares to match the enum — pick one
  and be consistent). Shares deserves prominence because it maps to the most
  common non-equal real-life case.
- Keep the single-tap "Reset to Equal" escape hatch (already present).

Because the backend, DTO, calculator, edit-preservation, and even the component
methods already handle all four types, re-exposing Percentage + Shares is
**mostly a template change** (add two buttons to the mode toggle + render the
share/percent input rows that Exact already models). This is the highest
value-to-effort item in the whole review.

---

## Phase 7 — Progressive disclosure

Keep and lean on the pattern that already exists:

- **Default form:** Title, Amount, (defaulted) Paid-by = You, (defaulted) Split =
  Equal among all. Summary card only.
- **"Customize Split" sheet:** split algorithm + per-person editor.
- **Future "Multiple people paid" link:** multi-payer editor, same sheet idiom.

No always-visible advanced controls. The summary card on the main form is the
right amount of information — it tells the user the current split without making
them open the sheet.

---

## Phase 8 — Editing experience

Any change must keep the edit flow's current guarantees:

1. **Never re-enter unrelated data** — editing title must not touch the split.
2. **Preserve non-equal splits verbatim** unless the user changes participants or
   explicitly edits the split (already implemented via `originalSplits` +
   `splitExplicitlyChanged`).
3. **Keep the live "Changes" diff** accurate for any newly exposed mode — if we
   re-expose Percentage/Shares, `splitSummary()` already emits the right label,
   so the diff row ("Split: Original split → Share split between N people")
   continues to work.
4. **Optimistic-lock `version`** stays required.

Re-exposing Percentage/Shares is **safe for edit** because edit mode already
reads and preserves those types; we'd only be *enabling creation* of what edit
could already display.

---

## Phase 9 — Backward compatibility & migration

**Re-exposing Percentage / Shares (Phase A below): zero migration.** No schema,
API, analytics, export, or settlement change. Existing expenses unaffected. Pure
additive UI. This is why it's the recommended first step.

**Multi-payer (Phase C): requires migration.** Options:

- **Option 1 — `expense_payers` join table** (recommended): `(expenseId,
  participantUserId | participantGroupMemberId, amountPaid)`. Migrate every
  existing single-payer expense to one row. Drop reliance on the single-payer
  `CHECK` (or keep `paidBy*` as a denormalized "primary payer" for
  back-compat/read paths). Settlement loop changes from "credit one payer
  `amountTotal`" to "credit each payer their `amountPaid`."
- **Option 2 — keep `paidBy*` for the common case, add an optional payers array**
  only when >1 payer. Less clean but smaller blast radius.

Either way: refunds, analytics contribution graphs, export/import round-trip, and
duplicate detection must be re-verified against multi-payer — a full vertical
slice, which is the core reason to isolate it in its own phase.

---

## Deliverable: text wireframes

### Default group expense (collapsed — the <15s path)
```
┌───────────────────────────── Add New Expense ──────────┐
│  [ Expense ]  [ Refund ]                                │
│  Title / Name *   [ Dinner________________ ]            │
│  Amount *  [ ₹ 1200 ]     Currency [ INR ▾ ]            │
│  Category [ Food ▾ ]      Date [ 2026-08-05 ]           │
│  Paid by *  [ You ▾ ]                                   │
│  Split                                  Customize Split │
│   ┌──────────────────────────────────────────────────┐ │
│   │ Equal between 4 people        4 selected          │ │
│   │ [Select all] [Clear]                              │ │
│   │ ☑ You   ☑ Naveen   ☑ Praveen   ☑ Riya            │ │
│   └──────────────────────────────────────────────────┘ │
│  Notes (optional) […]     Attachments (optional) […]    │
│         [ Cancel ]         [ Save Expense ]             │
└─────────────────────────────────────────────────────────┘
```

### "Customize Split" sheet — recommended (adds Shares + Percentage)
```
┌──────────────── Split Expense ─────────────────┐
│  [ Equal ] [ Shares ] [ Exact ] [ Percentage ] │   ← today: only Equal/Exact
│  Expense ₹1200 · Assigned ₹1200 · Remaining ₹0 │
│  Naveen   [ 2 shares ]                          │
│  Praveen  [ 1 share  ]                          │
│  Riya     [ 1 share  ]                          │
│  You      [ 1 share  ]                          │
│        [ Reset to Equal ]     [ Done ]          │
└─────────────────────────────────────────────────┘
```

### Multi-payer (future phase, opt-in)
```
│  Paid by *  [ You ▾ ]           Multiple people paid → │
│   ── when expanded ──                                  │
│   Naveen  [ ₹700 ]   Praveen [ ₹300 ]                  │
│   Paid ₹1000 · Total ₹1000 · Remaining ₹0             │
```

---

## Recommended phased plan

> **Superseded — see the [roadmap](./add-expense-ux-roadmap.md).** The product
> decision was to keep Percentage/Shares hidden and lead with polish + height
> reduction instead. This original plan is kept for its reasoning only.

- **Phase A (MVP, ~template-only): Re-expose Shares + Percentage** in the
  Customize-Split sheet. No backend, no migration. Highest value/effort ratio.
  Add e2e coverage for creating and editing a share/percent split.
- **Phase B (polish): Split-sheet ergonomics** — reorder modes by real-world
  frequency, tighten the Assigned/Remaining feedback, consider collapsing
  Notes/Attachments behind a "More options" line to cut default-form height.
- **Phase C (major, separate): Multi-payer** — schema (`expense_payers`),
  settlement/analytics/export/refund/duplicate re-verification, and the opt-in
  "Multiple people paid" UI. Own design doc + migration.
- **Out of scope for now:** receipt OCR, itemized bill splitting.

**Guiding rule for every phase:** the collapsed default form must not gain a
single new always-visible control. All new power lives behind existing
progressive-disclosure surfaces.
```
