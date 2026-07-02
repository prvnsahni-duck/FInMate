# FinMate Security Verification Checklist

## References
- ARCHITECTURE.md
- docs/PROJECT_DECISIONS.md
- API_SPECIFICATION.md
- openapi.yaml

## Zero-Knowledge Controls
- [ ] Backend does not decrypt expense, note, or group encrypted payloads.
- [ ] Encryption boundaries match architecture docs.
- [ ] Decryption placeholders are used safely in UI paths.

## Key Management Controls
- [ ] UDK is user-scoped and never shared.
- [ ] Group keys are group-scoped.
- [ ] Key versions are immutable history.
- [ ] Wrapped keys are immutable per key-version and user.
- [ ] Rotation cannot overwrite historical wrapped keys.
- [ ] One ACTIVE version per group is enforced in DB.

## Invite and Session Security
- [ ] Invite metadata endpoint authentication is enforced.
- [ ] Invite expiry is enforced.
- [ ] Wrapped keys are not exposed to unauthorized users.
- [ ] Refresh flow does not weaken session guarantees.
- [ ] Logout clears in-memory and vault key material.

## Storage and Offline Security
- [ ] IndexedDB key vault behavior is validated.
- [ ] Session expiration handling is verified.
- [ ] Multi-tab behavior does not leak stale key state.

## Operational Security
- [ ] Rotation and emergency revocation runbooks exist and are approved.
- [ ] Security incident rollback path is documented.
