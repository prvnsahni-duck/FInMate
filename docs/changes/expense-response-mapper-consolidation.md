# Expense Response Mapper Consolidation

Date: 2026-07-25
Source: `docs/audits/expense-architecture-audit.md`, finding P2-1 ("Expense response mapping is duplicated inside `ExpensesService`").

## Objective

Ensure there is exactly one canonical expense response mapper in `ExpensesService`, so new response fields can't be added to one mapping path and forgotten in the other.

## Files Changed

| File | Change |
| --- | --- |
| `backend/src/app/expenses/expenses.service.ts` | Extracted a pure `toExpenseResponse(expense, splits, attachments, wrappedContentKeys)` mapper. `mapExpenseResponse` and `batchMapExpenseResponses` now both call it after loading their relations; neither builds the response object directly anymore. |

No DTOs, controller routes, or response shapes changed.

## Previous Duplicate Implementations

- `mapExpenseResponse(expense)` — single-item path. Loads splits, attachments, and wrapped content keys with three per-expense queries (via `expenseSplitRepository.find`, `attachmentRepository.find`, and `getWrappedContentKeys`), then builds the response object inline.
- `batchMapExpenseResponses(expenses)` — list path. Loads splits, attachments, and wrapped keys with three `IN (...)`-clause batch queries regardless of list size, groups them by expense ID into `Map`s, then builds the same response object inline per expense.

### Field-by-field comparison

Both inline object literals emitted the exact same 21 top-level fields, in the same order, with the same null-coalescing and `Number(...)` coercion: `id, title, description, amountTotal, currency, category, paidByUserId, paidByGroupMemberId, ownerUserId, groupId, groupKeyVersionId, groupKeyVersion, expenseDate, status, encryptionScope, ledgerMonth, isCarryForward, splits, attachments, wrappedContentKeys, version, createdAt, updatedAt, deletedAt`. The nested `splits` and `attachments` mapping closures were also byte-for-byte identical between the two methods.

**Only intentional difference — data loading, not shape:**

| Field | Single-item (`mapExpenseResponse`) | Batch (`batchMapExpenseResponses`) |
| --- | --- | --- |
| `wrappedContentKeys` | `await this.getWrappedContentKeys(expense.id)`, which internally does `encryptedExpenseKeyRepository.find({ where: { expense: { id: expenseId } }, relations: ['user'] })` then maps to `{ userId: k.user.id, wrappedKey: k.wrappedKey }` | Loads all keys for the batch in one `IN (...)` query, groups by expense ID, then maps to the same `{ userId: k.user.id, wrappedKey: k.wrappedKey }` shape inline |

The output shape (`{ userId, wrappedKey }[]`) is identical in both cases — the difference is purely in query strategy (per-item query vs. batch `IN`-query), which is exactly the batch-loading optimization the audit said to preserve. `splits` and `attachments` had the same per-item-vs-batch query difference with identical output shapes.

This confirms the audit's read: the two "mappers" were not divergent implementations of the response shape — they were duplicated object-construction code sitting on top of two different (and both necessary) data-loading strategies.

## Canonical Mapper

```ts
private toExpenseResponse(
  expense: Expense,
  splits: ExpenseSplit[],
  attachments: Attachment[],
  wrappedContentKeys: Array<{ userId: string; wrappedKey: string }>,
): Record<string, unknown>
```

A pure function — no repository access, no `await` — that takes already-loaded relations and returns the response object. It is a verbatim copy of the object-literal body shared by the two prior implementations.

- `mapExpenseResponse` now: runs its three per-item queries (unchanged), then calls `this.toExpenseResponse(expense, splits, attachments, wrappedContentKeys)`.
- `batchMapExpenseResponses` now: runs its three batch `IN`-queries and per-expense grouping (unchanged), then calls `this.toExpenseResponse(expense, splits, attachments, wrappedContentKeys)` per expense in the final `.map(...)`.

## Intentional Differences Retained

- **Query shape only.** `mapExpenseResponse` issues 3 queries for 1 expense (plus 1 more inside `getWrappedContentKeys`); `batchMapExpenseResponses` issues 3 `IN (...)` queries regardless of list size, as documented in its existing comment ("Replaces N×3 per-expense queries with 3 bulk queries regardless of list size"). This optimization is untouched — only the object-construction step that ran after data loading was deduplicated.

## Verification

- **Single canonical mapper**: `toExpenseResponse` is now the only place the response object literal is constructed; both call sites are thin wrappers around their respective data-loading strategy.
- **Identical responses**: since both paths call the same pure function with equivalent input shapes, single-item and batch responses for the same expense are identical by construction (previously identical by manual duplication).
- **No API changes**: field names, order, nullability, and coercion (`Number(...)`, `?? null`) are unchanged — the mapper body was moved, not rewritten.
- **No performance regression**: the batch path's grouped `IN`-query loading (`splitsByExpId`, `attachsByExpId`, `keysByExpId` maps) is untouched; `toExpenseResponse` does no I/O.

## Test Results

```
Test Suites: 9 passed, 9 total
Tests:       109 passed, 109 total
```

Ran the full `backend/src/app/expenses` suite (`expenses.service.spec.ts`, `expenses.controller.spec.ts`, `expenses.controller.routing.spec.ts`, `expenses-split-query-mapping.spec.ts`, `split-calculator.util.spec.ts`, `dto/expenses.dto.spec.ts`, `services/expenses-carry-forward.service.spec.ts`, `services/recurring-expenses.service.spec.ts`, `recurring-expenses.controller.spec.ts`), covering both `mapExpenseResponse` call sites (create/update/get/restore/deleted-listing) and the `batchMapExpenseResponses` call site (`listExpenses`), with no test changes required.

`npx tsc --noEmit -p backend/tsconfig.app.json` and `npx eslint src/app/expenses/expenses.service.ts` both passed with no new errors or warnings (one pre-existing, unrelated `no-non-null-assertion` warning remains at line 1367).
