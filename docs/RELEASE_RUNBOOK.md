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
2. Take verified database backup/snapshot.
3. Deploy application build.
4. Run migrations.
5. Execute post-deploy smoke tests.

## Post-deploy Smoke Tests
1. Authenticate and refresh token flow.
2. Fetch group key for existing user.
3. Join group invite and verify wrapped key retrieval.
4. Perform one key rotation in controlled group.
5. Verify no duplicate expense records introduced.

## Monitoring and Stabilization
1. Monitor auth failures, key endpoint errors, DB errors.
2. Monitor latency on groups key endpoints.
3. Confirm no spike in decryption failure placeholders.
4. Keep rollback decision deadline explicit.

## Completion
1. Mark release as successful.
2. Publish release notes and known risks.
3. Archive deployment timestamps and checks.
