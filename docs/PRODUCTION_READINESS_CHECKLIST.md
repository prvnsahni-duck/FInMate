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

## Database and Migration Readiness
- [ ] Migration is idempotent.
- [ ] Migration backfill validated on staging snapshot.
- [ ] Foreign keys and delete behavior validated.
- [ ] Indexes exist for new key version tables and references.
- [ ] Rollback plan is reviewed and tested.

## API and Backend Readiness
- [ ] OpenAPI matches controller behavior.
- [ ] DTO validation matches request/response contracts.
- [ ] Authorization enforced on key endpoints.
- [ ] Rotation transaction behavior validated.

## Frontend Readiness
- [ ] Refresh restores keys while session is valid.
- [ ] Logout clears key cache and vault.
- [ ] Invite join path handles wrapped group keys safely.
- [ ] Group switching and key retrieval verified.

## QA and Release Gates
- [ ] Backend tests pass.
- [ ] New key-versioning tests pass.
- [ ] Critical-path smoke tests pass.
- [ ] Release and rollback runbooks approved.

## Final Sign-off
- Engineering Lead: __________
- Security Lead: __________
- QA Lead: __________
- Release Manager: __________
- Date: __________
