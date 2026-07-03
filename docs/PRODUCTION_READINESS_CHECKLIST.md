# FinMate Production Readiness Checklist

## Scope
This checklist is for Release Candidate sign-off of the approved architecture.

## Architecture and Decision References
- ARCHITECTURE.md
- DATABASE_SCHEMA.md
- API_SPECIFICATION.md
- openapi.yaml
- docs/PROJECT_DECISIONS.md

## Architecture Conformance
- [ ] Implementation follows approved Option 2 key model.
- [ ] No architecture drift against docs/PROJECT_DECISIONS.md.
- [ ] No duplicated encrypted records.
- [ ] Personal dashboard uses aggregation, not replication.
- [ ] No unauthorized architecture changes introduced.

## Security Readiness
- [ ] Backend does not decrypt expense/note/group encrypted content.
- [ ] UDK remains user-scoped.
- [ ] Group keys remain group-scoped.
- [ ] Key version history is immutable.
- [ ] Exactly one ACTIVE key version per group.
- [ ] Invite endpoints require authentication where required.
- [ ] Session refresh and local key restore are validated.
- [ ] Route-specific throttling limits configured and verified.
- [ ] Zero-Knowledge console warnings verified in the fallback path.

## Database and Migration Readiness
- [ ] Migration is idempotent.
- [ ] Migration backfill validated on staging snapshot.
- [ ] Foreign keys and delete behavior validated.
- [ ] Indexes exist for new key version tables and references.
- [ ] Rollback plan is reviewed and tested.
- [ ] **Backup Integrity Validation Gate:** Backup was restored on test environment, data decrypted successfully, and dashboard load verified.

## API and Backend Readiness
- [ ] OpenAPI matches controller behavior.
- [ ] DTO validation matches request/response contracts.
- [ ] Authorization enforced on key endpoints.
- [ ] Rotation transaction behavior validated.
- [ ] Deep Diagnostic Health endpoint `/api/v1/health` verified with Postgres & Redis checks.

## Frontend Readiness
- [ ] Refresh restores keys while session is valid.
- [ ] Logout clears key cache and vault.
- [ ] Invite join path handles wrapped group keys safely.
- [ ] Group switching and key retrieval verified.
- [ ] UI session warning banner verified when IndexedDB fails.

## QA and Release Gates
- [ ] Backend tests pass.
- [ ] New key-versioning tests pass.
- [ ] Playwright E2E integration test suites pass (Expense Flow, Recurring Expenses, Fallback, Lifecycle).
- [ ] Release and rollback runbooks approved.

## Final Sign-off
- Engineering Lead: __________
- Security Lead: __________
- QA Lead: __________
- Release Manager: __________
- Date: __________
