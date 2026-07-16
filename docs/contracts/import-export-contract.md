# Import / Export Contract

Source: [import/](../../backend/src/app/import/)

## Responsibilities

- ✔ Import expenses from CSV/XLSX transactionally (all-or-nothing per batch).
- ✔ Export ledger data.
- ✔ Rate-limit: import 10/min, export 20/min.

## Inputs

- Uploaded file (via `FileInterceptor`), authenticated user + group context.

## Outputs

- Created expense/split rows (import); file payloads (export).

## Dependencies

- Expense (row creation), Groups (membership/currency), Throttler.

## Must NEVER

- ❌ Partially apply a batch — any validation error rolls back the whole import.
- ❌ Bypass the ZK boundary — imported title/description must follow the same client-encryption rules if they represent ZK content.
- ❌ Export ZK plaintext the server never had.
- ❌ Violate group currency consistency on imported rows.
