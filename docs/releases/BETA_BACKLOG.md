# Beta Backlog

Date: 2026-07-25

Confirmed future work only — every item below was directly verified against the current codebase
during this session's audits (cited per item). No speculative or aspirational items are included.
Nothing here blocks `docs/releases/BETA_1.0.md`.

## Storage & Data Integrity

- **Backend receipt storage.** Receipt attachments are encrypted correctly but their bytes live
  only in browser `localStorage`, not any backend store. Needed before any multi-device or
  multi-user (public beta) use of the attachment feature.
  Source: `docs/release/BETA_RECEIPT_DECISION.md`.
- **Receipt cleanup / garbage collection.** Removing an attachment or deleting an expense never
  frees its `localStorage` entry — confirmed via full-codebase search, zero `removeItem` calls
  exist for `sim_storage:*` keys anywhere. Storage usage only grows for the life of the browser
  profile. Should ship alongside backend receipt storage (moot once bytes aren't
  `localStorage`-resident) or be fixed standalone if backend storage is deferred further.
  Source: `docs/release/BETA_RECEIPT_DECISION.md`.
- **Audit-log key versioning.** `AuditLog.metadataJson` carries no `groupKeyVersionId`, so group
  history entries encrypted before a key rotation become permanently undecryptable after one.
  Currently latent (key rotation has no UI entry point). Must ship _before_ any UI that can trigger
  `GroupKeyService.rotateGroupKey`. Tracked as KI-1 in `docs/KNOWN_ISSUES.md`, with an agreed
  direction (stop persisting titles in audit metadata) already recorded there.
  Source: `docs/audits/history-decryption-audit.md`, `docs/EXPENSE_MODULE_STATUS.md`.
- **`Settlement.note` ciphertext validation.** Unlike expense `title`/`description`, `note` has no
  `@IsCiphertext` decorator, so a client could in principle persist a plaintext note despite it
  being documented as client-side encrypted.
  Source: `docs/audits/expense-audit.md`, `docs/EXPENSE_MODULE_FREEZE.md`.

## Dormant / Incomplete Features

- **Dormant `direct_shared` support.** Full entity/DTO/decryption plumbing exists for
  direct-shared (non-group) expense encryption, but backend validation unconditionally rejects
  creating one and the frontend never emits the scope. Needs a product decision: ship it, or
  remove the dormant plumbing.
  Source: `docs/audits/expense-architecture-audit.md` (P2-5), `docs/EXPENSE_MODULE_STATUS.md`.
- **`GroupInvite.contact` is never populated.** Neither invite-creation path
  (`GroupsService.inviteMember`'s compatibility branch, `createGroupInvite`) sets `contact` on the
  `GroupInvite` row it creates, so `ContactsService`'s own claim/merge bookkeeping for durable
  invite records (`contacts.service.ts:313-315`) is currently inert. Separate from, and narrower
  than, the invite-join `GroupMember` duplication bug already fixed this release.
  Source: `docs/audits/groups-architecture-audit.md` (P1-6), `docs/changes/invite-claim-fix.md`.

## Groups Architecture Consolidation

Confirmed duplication found during the Groups module audit; recommended verdict was "needs
architecture consolidation first" before further Groups feature work (not a blocker for existing
functionality — see `docs/EXPENSE_MODULE_FREEZE.md`-style precedent already applied to Expense).

- **Active-membership resolution is implemented six different ways** across `GroupsService` (a
  named helper plus nine inline duplicates plus a third variant in `updateMember`/`removeMember`),
  `GroupRolesGuard`, and independent copies in `ExpensesService`/`SettlementsService`.
- **Role-authorization checks are retyped inline at 11+ call sites** in `GroupsService`, plus a
  second, only-partially-wired `GroupRolesGuard` mechanism (wired onto `MembersController` only).
- **Invite-token minting is duplicated four times**; invite resolution duplicated twice.
- **`GroupsService.memberSummary()` is a fourth, previously-uncounted display-name resolver** —
  the earlier display-name-resolver consolidation didn't find it because the Groups module was
  outside that task's scope.
- **The four `GroupsCrudService`/`GroupsMembershipService`/`GroupsContributionsService`/
  `GroupsAuditService` facades contain no real logic split** — every method is a single-line
  delegation to `GroupsService`, which remains a single 1850-line class regardless of the file
  layout implying otherwise.

Source: `docs/audits/groups-architecture-audit.md` (P1-1 through P1-5).

## Confirmed Dead Code / Cleanup (Groups module)

Same category of work already done for Expense in `docs/changes/legacy-cleanup.md`; not yet done
for Groups.

- `EncryptedGroupKey` entity: registered in `groups.module.ts`/`ormconfig.ts`, zero usage found
  anywhere else in `backend/src`.
- `Group.visibility` field: written on create/update, never read by any access-control path.
- `WrappedGroupKeyResponse` / `RotateGroupKeyResponse` DTO interfaces: exported, zero consumers.
- `GroupDetailComponent.canChangeRole()`: permanently returns `true` (a UI stub), gating a role-
  change control every member sees regardless of permission; the backend correctly rejects
  unauthorized attempts, so this is a UX inconsistency, not a security gap.

Source: `docs/audits/groups-architecture-audit.md` (P2-1 through P2-4).

## Confirmed Gaps (pre-existing, still open)

- **No self-service password recovery.** `POST /auth/change-password` requires an existing valid
  session; there is no forgot/reset-password route on the backend or page on the frontend.
  Source: `docs/release/RC1_READINESS.md` (H-1), `docs/architecture/gap-tracker.md` (AUTH-002).
- **`spectator` role is locked out of member-list routes.** `GroupRolesGuard`'s role-decorator
  type union omits `spectator` entirely, so a member assigned that role cannot view
  `GET /groups/:id/members`.
  Source: `docs/audits/groups-architecture-audit.md` (P1-2), `docs/architecture/gap-tracker.md`
  (GRP-003).
- **Invite links never expire; a departed member's group key is never revoked.** A leaked old
  invite link keeps working indefinitely; removing a member doesn't revoke or rotate their cached
  group key.
  Source: `docs/audits/groups-architecture-audit.md`, `docs/architecture/gap-tracker.md`
  (GRP-004/GRP-005).
- **`InviteDetailsResponse` under-declares its actual response shape** (`memberType`,
  `joinStatus`, `groupKeyVersionId`, `groupKeyVersion` are returned but not in the TypeScript
  interface); `UpdateContributionDto` (backend) and `UpdateContributionsPayload` (frontend) are two
  independent type declarations for the same request-body shape.
  Source: `docs/audits/groups-architecture-audit.md` (P2-5).

## Test Coverage Gaps

- **No unit tests for `GroupMembersComponent` or `JoinGroupComponent`** — the two frontend
  components doing real cryptographic work in the Groups module's invite/join flow (TIK
  generate/wrap, key unwrap on join).
- **No controller-level spec files** for `GroupsController`, `MembersController`, or
  `InviteController`.
- **`groups.service.spec.ts` has no coverage** for `getContributions`, `updateContributions`,
  `getPendingInvitations`, `createGroupInvite`, `regenerateInviteToken`, `getMissingGroupKeys`, or
  `getGroupHistory`.

Source: `docs/audits/groups-architecture-audit.md` (P2-8).

## Low-Probability, Flagged for Awareness

- **A legacy attachment-download fallback fabricates placeholder content.**
  `GroupDetailComponent.downloadAttachment`'s `else` branch (taken when `encryptedFileKey`/
  `encryptedOriginalName` are missing on an `Attachment` row) offers fabricated text as a download
  rather than erroring. The current create flow always populates both fields, so this branch
  appears unreachable today; flagged so it isn't rediscovered as a surprise later.
  Source: `docs/release/BETA_RECEIPT_DECISION.md`.
