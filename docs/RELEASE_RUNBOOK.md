# FinMate Release Runbook

## Purpose

Operational steps to release the current approved architecture safely.

## References

- ARCHITECTURE.md
- docs/PROJECT_DECISIONS.md
- DATABASE_SCHEMA.md
- openapi.yaml
- docs/PRODUCTION_READINESS_CHECKLIST.md
- docs/DISASTER_RECOVERY_ROLLBACK_RUNBOOK.md

## Pre-release

1. Confirm Production Readiness Checklist is fully complete.
2. Confirm backend tests are green.
3. Confirm OpenAPI and API_SPECIFICATION are synchronized.
4. Confirm migration plan and rollback plan are approved.
5. Confirm on-call owners and communication channel are active.

## Staging Validation

1. Deploy candidate build to staging.
2. Run migration on staging snapshot.
3. Validate existing user key access and invite/join flow.
4. Validate rotation creates new ACTIVE version and preserves history.
5. Record results in release notes.

## Production Deployment

1. Announce maintenance window.
2. Take database backup/snapshot.
3. **Verify Backup Integrity (Mandatory Gate):** Restore the taken backup to a temporary test database, start a test app instance against it, login, and confirm that historical encrypted expenses decrypt successfully on the dashboard.
4. Deploy application build.
5. Run migrations.
6. Execute post-deploy smoke tests.

## Post-deploy Smoke Tests

1. Verify deep diagnostic health check endpoint `/api/v1/health` returns status `200` and report sub-systems (`database`: "up", `redis`: "up").
2. Authenticate and refresh token flow (verify token rotation).
3. Fetch group key for existing user.
4. Join group invite and verify wrapped key retrieval.
5. Perform one key rotation in controlled group.
6. Verify no duplicate expense records introduced.
7. Verify IndexedDB fallback behaviour by blocking IndexedDB in a browser session, logging in, seeing the session warning banner, and logging out.

## Monitoring and Stabilization

1. Monitor rate-limit triggers (Throttler `429` counts) in Prometheus/Grafana or logs.
2. Monitor auth failures, key endpoint errors, DB errors.
3. Monitor latency on groups key endpoints.
4. Confirm no spike in decryption failure placeholders.
5. Keep rollback decision deadline explicit.

## Completion

1. Mark release as successful.
2. Publish release notes and known risks.
3. Archive deployment timestamps and checks.
