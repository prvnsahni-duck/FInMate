# Sync / Offline Contract

Source: frontend `core/services/` (optimistic-lock, automerge, conflict modal) + backend `@VersionColumn`. Audit: [sync-audit.md](../audits/sync-audit.md)

## Responsibilities (what actually exists)

- ✔ Optimistic concurrency: backend `@VersionColumn` → `CON_VERSION_CONFLICT` (412) → frontend interceptor fetches latest, automerges non-overlapping fields, or opens the conflict-diff modal.
- ✔ Version-keyed key cache survives refresh (IndexedDB, memory fallback).

## Roadmap (NOT built — do not claim as working)

- 📋 Service worker / offline asset caching / installable PWA.
- 📋 Offline mutation queue / outbox + reconnect replay.
- 📋 IndexedDB ledger cache for offline reading.

## Public surface

- The optimistic-lock interceptor + conflict modal (client); the version check + 412 error code (server).

## Dependencies

- Every mutating module (expenses, groups, settlements, notes, goals) via their version columns.

## Must NEVER

- ❌ Break the 412 reconciliation flow — every versioned write must surface `CON_VERSION_CONFLICT` cleanly.
- ❌ Advertise offline capability in UI copy that isn't backed by an outbox (see SYNC-003).
- ❌ Auto-merge overlapping-field conflicts without user confirmation.
