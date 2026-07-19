# FinMate QA Verification Checklist

## References

- ARCHITECTURE.md
- docs/PROJECT_DECISIONS.md
- API_SPECIFICATION.md
- docs/PRODUCTION_READINESS_CHECKLIST.md

## Functional Coverage

- [ ] Group create, invite, join flows pass.
- [ ] Personal dashboard aggregation remains non-duplicative.
- [ ] Group expenses and personal expenses both render correctly.
- [ ] Archived group behavior remains read-only.

## Key Lifecycle Coverage

- [ ] Get my group key works for existing users.
- [ ] Missing key members endpoint works for owner/admin.
- [ ] Rotation creates new ACTIVE version and preserves prior versions.
- [ ] Wrapped keys are not overwritten for historical versions.

## Security and Authorization Coverage

- [ ] Unauthorized requests rejected on protected endpoints.
- [ ] Invite metadata requires valid auth.
- [ ] Invite expiry path verified.

## Frontend Behavior Coverage

- [ ] Refresh restores keys while session is valid.
- [ ] Logout clears key state and vault.
- [ ] Group switching/key retrieval works.
- [ ] Session expiration path behaves correctly.

## Regression Coverage

- [ ] Existing backend unit tests pass.
- [ ] New key versioning tests pass.
- [ ] No regression in expenses and settlements critical paths.

## Sign-off

- QA Owner: \***\*\_\_\*\***
- Date: \***\*\_\_\*\***
