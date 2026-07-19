# FinMate P1 Group Key Versioning Plan (Approved Option 2)

## Context

Implement approved Option 2 architecture for group key versioning and member wrapped keys as separate lifecycle models.

## Approved Decisions

1. Use separate tables:
   - `group_key_versions`
   - `member_wrapped_group_keys`
2. Keep historical versions immutable.
3. Rotation always creates a new version.
4. Exactly one `ACTIVE` key version per group.
5. Every encrypted group resource should reference the key version used.

## Scope

- Add new entities and migration for Option 2 schema.
- Wire group key APIs to version-aware persistence and retrieval.
- Add rotation endpoint with owner/admin authorization.
- Persist key-version reference for current encrypted group resources (`expenses`, `notes`, `attachments`) where applicable.
- Keep legacy `encrypted_group_keys` table for backward compatibility during migration, but switch runtime flows to new tables.
- Add/adjust unit tests for invite and key lifecycle flows.
- Update architecture, database, API, and decision docs.
- Update progress log and run architecture drift checklist.

## Files (Planned)

- shared/data-models/src/lib/group-key-version.entity.ts
- shared/data-models/src/lib/member-wrapped-group-key.entity.ts
- shared/data-models/src/lib/group-invite.entity.ts
- shared/data-models/src/lib/expense.entity.ts
- shared/data-models/src/lib/note.entity.ts
- shared/data-models/src/lib/attachment.entity.ts
- shared/data-models/src/lib/dto/group-key.dto.ts
- shared/data-models/src/index.ts
- backend/src/migrations/1719000000000-AddGroupKeyVersioningModel.ts
- backend/src/migrations/index.ts
- backend/src/app/groups/groups.module.ts
- backend/src/app/groups/groups.controller.ts
- backend/src/app/groups/groups.service.ts
- backend/src/app/groups/groups.service.spec.ts
- frontend/src/app/features/groups/pages/join-group/join-group.component.ts
- frontend/src/app/core/services/group-key.service.ts
- ARCHITECTURE.md
- DATABASE_SCHEMA.md
- API_SPECIFICATION.md
- openapi.yaml
- docs/PROJECT_DECISIONS.md
- FinMate_Project_Specification.md

## Verification Plan

- Static diagnostics on changed files.
- Request targeted tests for groups and expenses key lifecycle paths.
- Validate API contract consistency and migration model references.
- Confirm architecture drift checklist PASS.

## Rollback Plan

- Keep new schema additive and non-destructive.
- Preserve legacy `encrypted_group_keys` table/readability during transition.
- Revert service/controller to previous key path if critical regressions occur.
