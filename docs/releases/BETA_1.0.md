# FinMate Beta 1.0 Release Notes

Date: 2026-07-25

## Release Summary

Beta 1.0 closes out a focused verification-and-fix pass on the expense module and its direct
dependents (Settlements, Groups, Encryption/Key Management), following the module freeze
(`docs/EXPENSE_MODULE_FREEZE.md`). The one confirmed release-blocking correctness bug found during
release verification (RC1) has been fixed and regression-tested. The one remaining known
limitation (receipt storage) is now honestly disclosed to the user rather than silently risked.
This release targets **personal daily use** — a single, informed user — not a public, multi-user
beta.

## Major Completed Work

**Architecture consolidation** (behavior-preserving; each recorded individually under
`docs/changes/`):

- Debt simplification unified into one canonical `simplifyLedgerDebts`, shared by Settlements and
  Carry Forward (`docs/changes/debt-simplifier-consolidation.md`).
- Expense response mapping unified into one canonical `toExpenseResponse`, used by both the
  single-item and batch-list paths (`docs/changes/expense-response-mapper-consolidation.md`).
- Member display-name resolution unified into one backend and one frontend resolver, replacing
  five duplicated implementations (`docs/changes/display-name-resolver-consolidation.md`).
- Confirmed dead code removed: `ExpensesAccessService`, three unused `GroupKeyService`/
  `ZkKeyVaultService` methods, and a legacy `SplitCalculator` shim whose own test suite was already
  silently failing (`docs/changes/legacy-cleanup.md`).

**Documentation**: expense-module documentation reconciled against the current codebase, including
a real factual contradiction found and fixed in `ARCHITECTURE.md` (group keys were incorrectly
described as IndexedDB-persisted; they are session-memory only). See
`docs/EXPENSE_MODULE_STATUS.md` and `docs/DOCUMENTATION_AUDIT.md`.

**Release verification**:

- `docs/EXPENSE_MODULE_FREEZE.md` — independent freeze verification: no duplicate logic, no dead
  code, no unresolved correctness issues in the areas covered. Verdict: freeze with known
  limitations.
- `docs/audits/groups-architecture-audit.md` — independent architecture audit of the Groups
  module. Found no P0. Found one confirmed, narrow correctness bug (`GroupInvite.contact` never
  populated — a Contacts-module bookkeeping gap, separate from the invite-join bug below) and
  substantial duplication (membership resolution implemented six different ways across three
  services). Verdict: needs architecture consolidation before further Groups feature work — see
  `docs/releases/BETA_BACKLOG.md`.
- `docs/release/RC1_READINESS.md` — release-candidate audit walking every primary user journey.
  Found one release-blocking correctness bug (below) and one storage-design risk (receipts).
  Verdict at the time: Not Ready.

**The release blocker, found and fixed**: joining a group via its invite link resolved existing
membership by `user_id` only. Anyone invited by email/phone _before_ they had a FinMate account —
the normal way of inviting a new person — got a duplicate `GroupMember` row on joining instead of
having their existing (Contact-backed) membership claimed: their invited role was silently reset to
`'member'`, and any expense history already logged against them was orphaned on the original row.
Fixed by reusing the already-existing, already-tested `ContactsService.claimContactsForUser` (the
same claim logic the email-verification path already used) from the join flow too. 8 regression
tests added; verified non-tautological by temporarily reverting the fix and confirming the tests
fail. See `docs/changes/invite-claim-fix.md`.

**The receipt-storage decision, evaluated and disclosed**: receipt attachments encrypt correctly
but their encrypted bytes live only in browser `localStorage`, not any backend store — metadata
syncs across devices, file content does not. Full workflow trace in
`docs/release/BETA_RECEIPT_DECISION.md`; recommendation was **Safe with Warning**. For Beta 1.0,
the attachment UI (which had been disabled in the template since the 2026-07-05 "v1.0 Release
Sprint" commit, pending exactly this decision) has been re-enabled with the required warning shown
before upload:

> "Beta: Receipts are stored only on this device. They won't sync to other devices and may be lost
> if browser data is cleared."

## Known Limitations

These are disclosed, intentional, and — for personal daily use — non-blocking:

1. **Receipts are device-local only.** No cross-device sync, no backup, lost if browser data is
   cleared. Disclosed via the warning above. See `docs/release/BETA_RECEIPT_DECISION.md`.
2. **Group history is not rotation-safe.** Audit-log metadata carries no key-version stamp, so
   history entries encrypted before a group-key rotation become undecryptable after one. Currently
   latent — key rotation has no UI entry point yet. Tracked as KI-1 in `docs/KNOWN_ISSUES.md`.
3. **No self-service password recovery.** A user who forgets their password has no way back into
   their account (change-password exists for already-logged-in users; there is no forgot/reset
   flow). Acceptable for a single disciplined user; a real risk beyond that.
4. **`direct_shared` expense encryption scope is dormant.** Full plumbing exists but is
   unreachable — backend validation rejects it, frontend never emits it. Intentional, not a defect.
5. **Groups module has significant internal duplication** (membership-active-checks implemented
   six different ways across Groups/Expenses/Settlements; role-authorization checks retyped at 11+
   call sites; invite-token minting duplicated four times). This is a maintainability risk for
   _future_ Groups feature work, not a correctness issue in what exists today — the one correctness
   bug this duplication contributed to (the invite-join bug) has already been fixed independently
   of consolidating the duplication itself. See `docs/audits/groups-architecture-audit.md`.
6. **`Settlement.note` is not ciphertext-validated.** A client could in principle persist a
   plaintext note; low practical exposure, not user-facing today.
7. **`GroupInvite.contact` is never populated** at invite creation, so `ContactsService`'s own
   claim/merge bookkeeping for durable invite records is currently inert for that field. Separate
   from, and narrower than, the invite-join bug fixed this release.

Full detail and evidence for each item is in the audit documents cited above; only confirmed items
carry forward into `docs/releases/BETA_BACKLOG.md`.

## Deferred Backlog

See `docs/releases/BETA_BACKLOG.md` for the full list of confirmed future work. Nothing in it
blocks this release.

## Testing Summary

All suites re-run fresh for this release (not carried over from memory):

| Suite                                   | Result                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Backend (Jest)                          | 29 suites / 394 tests passing                                                                                        |
| Frontend (Jest)                         | 28 suites / 226 tests passing                                                                                        |
| `shared/utils` (Jest)                   | 1 suite / 1 test passing                                                                                             |
| Backend `tsc --noEmit`                  | Clean, 0 errors                                                                                                      |
| Frontend `tsc --noEmit`                 | Clean, 0 errors                                                                                                      |
| ESLint (all files touched this release) | 0 errors; only pre-existing `@typescript-eslint/no-explicit-any` / `no-non-null-assertion` warnings, no new warnings |

The receipt-warning change in this release was verified to introduce **no behavior change beyond
re-enabling the previously-disabled attachment UI and adding the warning text**: `tsc` clean,
`create-expense-modal.component.spec.ts` (30 tests) and the full frontend suite (226 tests) pass
unmodified.

No live E2E/dev-server walkthrough was performed for this release notes pass specifically; RC1's
audit and the freeze verification were code-path-tracing exercises, corroborated by the passing
automated suites above.

## Release Recommendation

Ready for personal daily use. The one release-blocking correctness bug found during RC1
verification is fixed and regression-tested. The one remaining storage-design limitation (receipts)
is now honestly disclosed rather than silently risked, matching the "Safe with Warning" decision.
Everything else outstanding is a disclosed, non-blocking limitation or a maintainability
consolidation opportunity for _future_ work — not a defect in what ships today.

**FinMate Beta 1.0 is ready for personal daily use.**
