# FinMate Approved Decisions

## Security

✓ Zero-Knowledge is mandatory.

✓ Backend never decrypts titles.

✓ Amounts remain plaintext.

✓ User Data Key encrypts personal data.

✓ Group Key encrypts shared data.

✓ One Group Key per group.

✓ Group Key Versioning enabled.

✓ Group deletion = Archive.

✓ User deletion removes PII only.

✓ Personal Dashboard is aggregated.

✓ No duplicate expense records.

✓ AI features are opt-in.

Status: APPROVED

## Key Management Model (Option 2)

✓ Group Key Versions and Member Wrapped Keys are separate lifecycle concepts.

✓ `group_key_versions` stores immutable history per group (`ACTIVE`, `SUPERSEDED`, `REVOKED`).

✓ `member_wrapped_group_keys` stores per-user wrapped keys for a specific key version.

✓ Rotation creates a new ACTIVE key version and supersedes the previous ACTIVE version.

✓ Encrypted group resources should reference the key version used where applicable.

Status: APPROVED
