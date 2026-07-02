# FinMate Operations Runbook

## Scope
Runbook for routine and emergency operations under the approved architecture.

## References
- ARCHITECTURE.md
- docs/PROJECT_DECISIONS.md
- DATABASE_SCHEMA.md
- openapi.yaml

## Group Key Rotation
1. Confirm owner/admin authorization.
2. Confirm complete member wrapped-key input set is available.
3. Trigger rotation endpoint.
4. Verify previous ACTIVE becomes SUPERSEDED.
5. Verify exactly one ACTIVE version remains.
6. Verify wrapped keys inserted for new version only.
7. Record rotation reason and operator.

## Emergency Key Revocation
1. Trigger incident process and classify severity.
2. Identify affected group(s) and users.
3. Rotate group key immediately with emergency reason.
4. Confirm new ACTIVE key version provisioned to valid members.
5. Disable compromised access path (account/session/device).
6. Verify audit trail entries and incident notes.

## Staging Migration Validation
1. Prepare production-like staging snapshot.
2. Run migration package.
3. Validate backfill from legacy key table to versioned tables.
4. Validate key version references on group resources.
5. Validate one ACTIVE key version per group.
6. Run staging smoke tests and record outputs.

## Production Deployment
1. Execute docs/RELEASE_RUNBOOK.md pre-release steps.
2. Confirm backup completed and restore test is valid.
3. Deploy release and run migrations.
4. Run post-deploy checks for auth, key retrieval, invite flow.
5. Observe logs/metrics during stabilization window.
6. Close deployment with release report.
