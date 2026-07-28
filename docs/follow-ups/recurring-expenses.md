# Recurring Expenses — Follow-ups (RESOLVED)

Status: the recurring-expense feature is **complete**. The three follow-ups
captured during architectural review were resolved on 2026-07-28 (branch
`fix/postgres-monthly-analytics`). This file is kept as an engineering record.

---

## 1. Timezone / date arithmetic — RESOLVED (commit `fefa64f`)

`advanceDate()` parsed `YYYY-MM-DD` as UTC midnight but advanced with
**local-time** `setDate/setMonth`, so the next occurrence shifted by a day on
negative-offset servers and around DST (worst for monthly). Correct on
UTC/positive-offset servers (prod/Docker, IST dev), but timezone-dependent.

**Fix:** recompute entirely via `Date.UTC(...)` so results are identical in
every timezone. `todayStr` comparisons were already UTC. Regression tests cover
daily/weekly/monthly/yearly incl. month/year boundaries.

Note: the Option A immediate-generation gate compares the frontend's _local_
`getTodayDateString()` against the backend's _UTC_ today, so immediate
generation can defer to the scheduler near the UTC day boundary for non-UTC
users (the scheduler still generates within hours). Left as-is to honor the
deferred Case 3 decision (past-start behavior unchanged); revisit only if it
proves user-visible.

## 2. Month-end recurrence — RESOLVED (commit `fc2d1fb`)

Monthly/yearly overflowed month-end days (Jan 31 → Mar 3, Mar 31 → May 1,
Feb 29 → Mar 1).

**Behavior defined + implemented (standard calendar convention):** if the
scheduled day doesn't exist in the target month, land on that month's **last
valid day**, anchored to the template's start-date day so a "31st" schedule
recovers the 31st in long months:
`Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31 → Jun 30`. Yearly Feb 29 → Feb 28,
recovering on the next leap year. Single `clampToMonth` helper; tests cover all
month-end/leap-year cases.

## 3. Group / member lifecycle — RESOLVED (commit `cf888e5`)

The scheduler generated occurrences without validating the target. Groups are
**archived** (`isArchived`, the app's form of deletion), members **soft-removed**
(`joinStatus` `removed`/`left`); neither was checked, so archived groups and
removed payers kept producing expenses.

**Fix:** a single guard in the shared generation routine skips (does not
advance, does not fail, logs the reason) when the group is archived or the group
payer's `joinStatus` is `removed`/`left`. Personal and active-group templates
unaffected; a skipped template resumes automatically if the condition clears.
Tests cover archived-group, removed-payer, and the active happy path.

Possible future enhancement (not required now): auto-deactivate (pause) a
template whose payer is permanently gone, so it isn't re-scanned daily.

---

## Release note (beta)

> **Recurring Expenses:** Feature complete. Personal and group recurring
> expenses, zero-knowledge storage, immediate first occurrence when starting
> today, scheduler-owned future occurrences, timezone-independent date math,
> standard month-end recurrence, and lifecycle guards against archived groups /
> removed payers. No known deferred engineering work remaining.
