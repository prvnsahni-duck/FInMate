# FinMate Maintenance Checklist

## References

- ARCHITECTURE.md
- docs/PROJECT_DECISIONS.md
- DATABASE_SCHEMA.md
- API_SPECIFICATION.md
- openapi.yaml

## Before Any Change

- [ ] Confirm change is within approved architecture.
- [ ] Check docs/PROJECT_DECISIONS.md for constraints.
- [ ] Verify no duplicate encrypted data paths are introduced.
- [ ] Verify personal dashboard remains aggregation-based.

## During Development

- [ ] Keep DTOs, controllers, services, and OpenAPI aligned.
- [ ] Keep key lifecycle immutable guarantees intact.
- [ ] Preserve one ACTIVE key version constraint.
- [ ] Avoid duplicating business logic across modules.

## Database and Migrations

- [ ] Migrations must be idempotent.
- [ ] Migrations must include rollback strategy.
- [ ] Backfill logic must be safe for existing users.
- [ ] Add indexes for new query paths.

## Testing and Verification

- [ ] Add tests for all key lifecycle changes.
- [ ] Run targeted backend tests before merge.
- [ ] Validate security-sensitive endpoint authorization.

## Documentation Hygiene

- [ ] Update architecture docs when behavior changes.
- [ ] Update API spec and OpenAPI together.
- [ ] Update progress log after implementation.
- [ ] Keep runbooks/checklists current.
