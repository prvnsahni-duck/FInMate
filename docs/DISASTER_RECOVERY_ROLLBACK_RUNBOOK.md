# FinMate Disaster Recovery and Rollback Runbook

## Purpose
Recover service safely during release incidents without architecture redesign.

## References
- docs/PROJECT_DECISIONS.md
- DATABASE_SCHEMA.md
- docs/RELEASE_RUNBOOK.md

## Incident Severity Levels
- Sev 1: Data loss risk, key access outage, auth outage.
- Sev 2: Major feature degradation with partial workaround.
- Sev 3: Non-critical degradation.

## Immediate Response
1. Freeze deployments.
2. Activate incident bridge and assign incident commander.
3. Capture current error signals and blast radius.
4. Decide rollback vs hotfix based on recovery time.

## Rollback Decision Criteria
- Choose rollback if key access for existing users fails.
- Choose rollback if migration introduces integrity issues.
- Choose rollback if auth protections regress on sensitive endpoints.

## Application Rollback
1. Redeploy previous known-good backend and frontend artifacts.
2. Validate auth and key retrieval smoke checks.
3. Keep migration state unchanged unless DB rollback is required.

## Database Rollback
1. Only execute DB rollback if data integrity is compromised.
2. Restore from pre-release verified snapshot.
3. Re-run smoke tests for key access and dashboard aggregation.
4. Reconcile data gap window and document impact.

## Disaster Recovery
1. Restore services in order: DB, backend, frontend.
2. Validate Option 2 key lifecycle constraints post-restore.
3. Validate group invite and join flows.
4. Validate archived groups remain read-only.

## Communication
1. Update status page at fixed intervals.
2. Share customer impact, mitigation, ETA.
3. Publish post-incident report with root cause and corrective actions.
