# Attachments Audit — 2026-07-16

## Summary

FinMate models attachments as **metadata-only records** plus a **client-side zero-knowledge encryption path**, but has **no real storage backend and no dedicated attachment API**. Key facts from the code:

- The `Attachment` entity exists with the full polymorphic parent set (expense/note/goal/group) and an uploader FK, matching the ER diagram (`shared/data-models/src/lib/attachment.entity.ts:16-74`).
- There is **no attachment controller/module and no upload or download endpoint**. Attachments are created only as a side-effect of create/update **expense** (`backend/src/app/expenses/expenses.service.ts:677-707, 1038-1068`). Notes, goals, and standalone group attachments have no creation path despite the polymorphic schema.
- Client-side ZK encryption **is implemented for expense attachments**: a random file key (AES-256-GCM) encrypts the bytes and the filename, and the file key is wrapped with the scope key (`create-expense-modal.component.ts:459-476`). This is more advanced than the docs, which list ZK attachments as *roadmap-only*.
- **The "storage backend" is a browser `localStorage` simulation** (`sim_storage:` keys), not Supabase Storage as documented. No Supabase/S3/MinIO SDK is present in `package.json`. Encrypted bytes never leave the browser (`create-expense-modal.component.ts:467`, download at `group-detail.component.ts:936`).
- A **legacy `attachmentKeys` path stores plaintext storage keys and filenames** (`expenses.service.ts:693-706`), leaking metadata relative to the ZK goal.
- **No file size or MIME-type limits** are enforced anywhere (backend only checks `sizeBytes` is finite/≥0 and non-empty mime).
- **Receipt OCR: not implemented** (roadmap-only).
- DB-level orphan cleanup is correct (`ON DELETE CASCADE` on all parents), but simulated `localStorage` blobs are never cleaned up.

Only the client-side envelope-encryption metadata and the DB cascade are enforced by real code; the storage/transport layer is a stub.

## Findings table

| # | Documented guarantee | Status | Evidence (file:line) | Gap | Priority |
|---|----------------------|--------|----------------------|-----|----------|
| 1 | Attachment entity with polymorphic links (expense/note/goal/group) per ER diagram | ✅ (schema) / ⚠ (usage) | `shared/data-models/src/lib/attachment.entity.ts:16-40`; migration `1717977600000-InitialSchema.ts:161-183`; creation only for expenses `backend/src/app/expenses/expenses.service.ts:677-707` | Entity & CHECK constraint correct, but only the **expense** parent is ever populated; notes/goals/groups attachments have no create/read path | Medium |
| 2 | Upload/download endpoints with auth + group-membership authorization on download | ❌ | No attachment controller (only `import.controller.ts` FileInterceptor for CSV). Create gated by `JwtAuthGuard` + membership `expenses.service.ts:181-220`. Download is pure client-side `group-detail.component.ts:936-951` | No server upload/download endpoint exists; file bytes are read directly from `localStorage`, so there is **no server-side authorization on the object itself** (moot only because there is no server object) | High |
| 3 | Files encrypted client-side before upload (ZK roadmap) | ⚠ Partial (implemented client-side, but only-simulated storage + a plaintext legacy path) | Modern path encrypts bytes+name & wraps key `create-expense-modal.component.ts:459-476`; legacy plaintext path `expenses.service.ts:693-706` stores `storageKey`/`originalName` in clear | Content is genuinely encrypted on the modern path, but (a) there is no real upload so "before upload" is untested against a server, and (b) legacy `attachmentKeys` leaks filename + storage-key metadata | Medium |
| 4 | Storage backend = Supabase Storage (`ARCHITECTURE.md:193`, `TRD.md:12`) | ❌ | `localStorage.setItem('sim_storage:'+key, ...)` `create-expense-modal.component.ts:467`; read `group-detail.component.ts:936`; no Supabase/S3 dep in `package.json` | Documented Supabase Storage is **not integrated**; storage is a browser simulation. Attachments are non-persistent, non-shareable across devices/users | High |
| 5 | File Key wrapped with Group Key/UDK | ✅ (client-side) | `wrapKey(fileKey, scopeKey)` `create-expense-modal.component.ts:463`; stored as `encryptedFileKey`; backend validates envelope present `expenses.service.ts:291-308`; columns `attachment.entity.ts:62-70`; `group_key_version_id` link for rotation `attachment.entity.ts:39-40` | Wrapping is real on the client; backend only validates metadata is present (cannot verify crypto by design) | Low |
| 6 | Receipt OCR workflow (`ARCHITECTURE.md:198-200`) | 📋 Roadmap-only | No `ocr`/`tesseract`/`textract`/AI-receipt code anywhere (grep clean) | Not implemented | Low |
| 7 | Orphan cleanup on parent deletion | ✅ (DB) / ⚠ (blobs) | `ON DELETE CASCADE` for user/expense/note/goal/group FKs `1717977600000-InitialSchema.ts:165-169`; `groupKeyVersion onDelete SET NULL` `attachment.entity.ts:39` | Metadata rows cascade correctly, but simulated `sim_storage:` blobs in `localStorage` are never deleted → orphaned encrypted blobs accumulate | Low |
| 8 | File size / MIME-type validation | ❌ (undocumented + unimplemented) | Backend: only `Number.isFinite(sizeBytes) && >=0` and non-empty mime `expenses.service.ts:294-308`. Frontend `onFileSelected` has no size/type checks `create-expense-modal.component.ts:563-585` | No max-size cap, no MIME allowlist on client or server | Medium |

## Detailed findings for each ⚠/❌

### #2 — No attachment upload/download endpoints (❌, High)
The only file-upload controller in the backend is `backend/src/app/import/import.controller.ts:11-40` (CSV/XLSX import via `FileInterceptor`), unrelated to attachments. Attachment rows are created transactionally inside expense create/update (`expenses.service.ts:677-707` and `:1038-1068`), authorized by `@UseGuards(JwtAuthGuard)` on `expenses.controller.ts:24` plus the group-membership/ownership checks in `expenses.service.ts:181-220`. Reads are delivered embedded in the expense response (`mapExpenseResponse`, `expenses.service.ts:364-414`). Actual bytes are fetched client-side from `localStorage` (`group-detail.component.ts:936`). Consequence: there is no server endpoint enforcing group membership on the *file object*, and attachments cannot be shared between users or devices.

### #3 — ZK encryption partially met; legacy plaintext path (⚠, Medium)
Modern uploads generate a per-file AES-GCM key, encrypt the bytes (`encryptBytes`) and filename (`encrypt`), and wrap the file key with the scope key (`create-expense-modal.component.ts:459-476`), persisting `encryptedFileKey` + `encryptedOriginalName` and a UUID-based `.enc` storage key. However the legacy branch (`expenses.service.ts:693-706`) accepts raw `attachmentKeys` (e.g. `receipts/20260609_taj.jpg`, see `openapi.yaml:1281-1285`) and stores `storageKey` and a plaintext `originalName` derived via `basename(key)` with `mimeType='application/octet-stream'`. This leaks receipt filenames/paths — a metadata leak against the ZK goal. This legacy path is still fully wired and reachable via the documented API.

### #4 — Storage backend not implemented (❌, High)
`ARCHITECTURE.md:193` and `TRD.md:12` promise Supabase Storage. In reality the frontend writes encrypted bytes to `localStorage['sim_storage:'+storageKey]` (`create-expense-modal.component.ts:467`) and reads them back the same way (`group-detail.component.ts:936-941`). No object-storage SDK exists in `package.json`. Attachments are therefore ephemeral, device-local, and invisible to other group members — the feature is a UI simulation, not a working storage integration.

### #8 — No size/type enforcement (❌, Medium)
Neither client nor server caps attachment size or restricts MIME types. The backend envelope validation (`expenses.service.ts:294-308`) only rejects missing fields / negative sizes; `onFileSelected` (`create-expense-modal.component.ts:563-585`) accepts any file. Once a real backend/storage is wired, this is an abuse/DoS vector and should be closed proactively.

## Undocumented behavior found

- **`localStorage` "simulation storage"** (`sim_storage:` prefix) as the de-facto attachment store — undocumented and non-persistent (`create-expense-modal.component.ts:467`, `group-detail.component.ts:936`).
- **Envelope-encryption columns `encrypted_file_key` / `encrypted_original_name`** added via migration `1718800000000-AddEnvelopeEncryption.ts:55-78` and the `encryptedAttachments` request field (`create-expense.dto.ts:105-111`) are **implemented but absent from `openapi.yaml`** and `API_SPECIFICATION.md`, which only document the legacy plaintext `attachmentKeys` (`openapi.yaml:1281-1285`). The `Attachment` schema in `openapi.yaml:2969-3015` also omits `encryptedFileKey`/`encryptedOriginalName`.
- **`attachments.group_key_version_id` link** (`attachment.entity.ts:39-40`, migration `1719000000000-...:132-152`) ties attachments into group-key rotation — a real capability not described in the attachment sections of the docs.
- **Legacy vs modern dual-path** on both create and update (`expenses.service.ts:677-707`, `:1038-1068`) with silent divergence in what metadata is stored (encrypted vs plaintext) — undocumented.
- **Attachment reads only surface through expense responses**; there is no way to list/download attachments for notes, goals, or groups even though the schema and ER diagram advertise those parents.
