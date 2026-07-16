# Sync & Offline Audit — 2026-07-16

## Summary

**"Offline-first" in FinMate is almost entirely aspirational.** Of the offline/sync stack the docs describe, exactly one pillar is genuinely implemented end-to-end: **optimistic-locking conflict resolution** (backend `@VersionColumn` + `CON_VERSION_CONFLICT` 412 → frontend global interceptor → automerge or interactive conflict-diff modal). That part is real, wired, and enforced.

Everything else the docs sell as "offline-first" does not exist as running code:

- **No service worker / PWA at all.** There is no `ngsw-config.json`, no `@angular/pwa` / `@angular/service-worker` dependency, no `"serviceWorker": true` in `angular.json`, no web app manifest, and no `serviceWorker.register` call anywhere. The app is a plain SPA with a few Apple/mobile-web meta tags in `index.html`. Nothing is cached; a cold load offline yields a blank app.
- **No offline mutation queue / outbox.** No code queues expenses/notes for later sync. Creating or editing offline simply fails at the network layer. The ARCHITECTURE.md §2 wording ("Future offline support will… queue encrypted expenses while offline") is honest — it is roadmap-only — but TRD.md/Spec/PRD present offline drafting and IndexedDB-cached ledgers as existing capabilities, which is false.
- **IndexedDB is used only for the ZK key vault**, not for transactions. So the documented "IndexedDB stores decrypted transactions for offline reading" and "View ledger (cached in IndexedDB)" are not implemented.
- **Key availability offline is actually *better* than ARCHITECTURE.md admits**: keys are already persisted to IndexedDB (memory → IndexedDB → backend), not merely in-memory "future" work. But with no cached ciphertext to act on, this buys little offline value today.
- One **undocumented** offline affordance exists: a single online/offline banner on the group-detail page that re-fetches on reconnect. It is cosmetic and its "Showing cached data" copy is misleading (only shows in-memory data, lost on reload).

Only mark ✅ where enforcing code was observed. Optimistic locking is the sole ✅.

## Findings table

| # | Documented guarantee | Status | Evidence (file:line) | Gap | Priority |
|---|----------------------|--------|----------------------|-----|----------|
| 1 | "Service workers cache static assets" (TRD.md:24); "PWA support and offline service worker caching" (PRD.md:202); "Service Worker caching strategies" (Spec:1012); app is a "PWA" (ARCHITECTURE.md:3,14,34) | ❌ | No `ngsw-config.json` (find: none); `angular.json` has no `serviceWorker` key (grep: empty); `package.json` has no `@angular/pwa`/service-worker/workbox dep (grep: empty); no `serviceWorker.register`/`provideServiceWorker` anywhere (grep frontend/src: empty); `frontend/src/index.html` has only meta tags, no manifest link | Zero offline asset caching; app cannot boot offline. "PWA" is a label with no service worker behind it | High |
| 2 | Web app manifest / installable PWA (implied by PWA claims; Spec:1713 "PWA meta capability tags") | ⚠ | `frontend/src/index.html:20-24` has `apple-mobile-web-app-capable`/`mobile-web-app-capable` meta only; no `manifest.webmanifest` (find: none) | Meta tags present but no manifest → not truly installable; partial cosmetic PWA only | Low |
| 3 | Offline drafting of expenses/notes then sync on reconnect: "draft new personal/group expenses… Sync upon reconnect" (Spec:471-472, 792); "queue encrypted expenses while offline" (ARCHITECTURE.md:195); "Support offline bulk editing" (PRD.md:91) | 📋 Roadmap-only | No outbox/queue/draft-persistence code (grep `outbox\|offline.?queue\|queueExpense\|pendingSync\|syncQueue\|offlineDraft` frontend/src: empty); ARCHITECTURE.md:194-195 explicitly labels it "Future offline support" | Mutations offline just error out; no queue, no replay. Spec/PRD overstate it as present | High |
| 4 | "IndexedDB stores decrypted transactions for offline reading" (TRD.md:24); "View ledger (cached in IndexedDB)" (Spec:472); "Offline Local Storage… IndexedDB caching. Sync upon reconnect" (Spec:792); "Decrypted keys are cached securely to enable offline record decryption" (PRD.md:149) | ❌ (transactions) / ⚠ (keys) | IndexedDB usage is confined to the key vault: `frontend/src/app/core/services/zk-key-vault.service.ts:16,47`, `group-key.service.ts:65-534`, `encryption.service.ts:98-139`. No transaction/ledger IndexedDB store exists (grep: only vault + `test-setup.ts`) | No cached ledger → nothing to read offline even though keys are available. Key-cache half satisfies PRD.md:149 | High |
| 5 | Optimistic locking / version-based concurrency: `@VersionColumn`, `CON_VERSION_CONFLICT` 412, client "fetch state, merge, retry" + interactive diff modal (ARCHITECTURE.md:328-329; Spec:628-704, 671-696; TRD.md:30) | ✅ | Backend entities: `shared/data-models/src/lib/expense.entity.ts:84`, `note.entity.ts:37`, `group.entity.ts:55`, `settlement.entity.ts:42`, `goal.entity.ts:38`, `recurring-expense.entity.ts:59` all `@VersionColumn()`. Enforcement: `expenses.service.ts:878-885` (version check → 412 `CON_VERSION_CONFLICT`), `groups.service.ts:351-356`, `settlements.service.ts:477-479`, filter `http-exception.filter.ts:184,200`. Frontend: `optimistic-lock.interceptor.ts:25-90` (fetch-latest → automerge or modal), wired in `app.config.ts:29`, `AutomergeService` (`automerge.service.ts`), `ConflictModalService` (`conflict-modal.service.ts`) + `conflict-diff-modal.component.ts` | None — genuinely end-to-end | — |
| 6 | "Offline Key Restoration… restores wrapped keys from IndexedDB, allowing offline decryption" listed as roadmap (ARCHITECTURE.md:194-195) but as present in PRD.md:149 / Spec:496-497 | ✅ (implemented, mis-labeled as future) | `zk-key-vault.service.ts` persists keys to IndexedDB; `group-key.service.ts:65,455-534` resolves Memory → IndexedDB → Backend and re-persists unwrapped keys; graceful memory-only fallback when IndexedDB unavailable (`zk-key-vault.service.ts:84,101-135`) | Actually built already; ARCHITECTURE.md §2 understates it as "future." Limited value without cached ciphertext (see #4) | Low (doc drift) |

## Detailed findings for ⚠/❌

### #1 / #2 — No service worker; PWA is a label only (❌/⚠)
The repo advertises a PWA in ARCHITECTURE.md (intro, diagram node, module table lines 3/14/34) and promises service-worker asset caching in TRD.md:24, PRD.md:202, and Spec:1012. None of the Angular service-worker machinery is present:
- `angular.json`: no `serviceWorker`/`ngsw` configuration (grep returned nothing).
- `package.json`: no `@angular/pwa`, `@angular/service-worker`, or `workbox` dependency.
- No `ngsw-config.json` and no `manifest.webmanifest` on disk.
- No runtime registration (`serviceWorker.register` / `provideServiceWorker` / `ServiceWorkerModule`) anywhere in `frontend/src`.
- `dist/` contains no `ngsw*`/worker artifacts.

`capacitor.config.ts` merely points `webDir` at `dist/frontend/browser` with no offline/native offline config. Net effect: offline the app cannot load; online it behaves as a normal SPA. The only PWA-ish surface is the Apple/mobile meta tags in `index.html:20-24` (installable-ish chrome, no manifest → not a true installable PWA).

### #3 — No offline mutation queue / outbox (📋 roadmap-only, but oversold)
Spec:471-472/792 and PRD.md:91 describe offline drafting/bulk-editing that "syncs upon reconnect," and ARCHITECTURE.md:195 describes queuing encrypted expenses offline. There is no queue, outbox, draft store, or reconnect-replay logic in the codebase (broad grep for `outbox|offline.?queue|queueExpense|pendingSync|syncQueue|offlineDraft|drafts` over `frontend/src/app` returns nothing). ARCHITECTURE.md is internally consistent (marks it "Future"), but TRD/Spec/PRD present it as a shipped capability — that is the doc gap to fix.

### #4 — IndexedDB caches keys, not transactions (❌ for ledger caching)
TRD.md:24 and Spec:472/792 claim IndexedDB holds decrypted transactions for offline reading. In reality IndexedDB is used exclusively by the ZK key vault (`zk-key-vault.service.ts`, `group-key.service.ts`, `encryption.service.ts`). No expense/note/ledger records are persisted client-side. The group-detail "Offline – Showing cached data" banner is therefore misleading: it only reflects data already in in-memory component signals, which is lost on reload.

## Undocumented behavior found

1. **Group-detail online/offline banner + auto-refetch** (not in any doc): `group-detail.component.ts:209` initializes `isOffline` from `navigator.onLine`; `@HostListener('window:online')` (`:560-568`) and `('window:offline')` (`:570-573`) toggle it and, on reconnect, re-fetch expenses and balances. Template `group-detail.component.html:26-33` renders an indigo "Offline – Showing cached data." banner. This is the *only* online/offline awareness in the app (grep for `navigator.onLine`/`window:online`/`window:offline` returns only this component) — it is not global, exists on no other page, and its "cached data" copy overstates what is actually retained (in-memory only).

2. **Automerge no-overlap fast path** (`optimistic-lock.interceptor.ts:59-66`): when a 412 conflict has *no* overlapping fields, the interceptor silently auto-merges server state + local payload and retries the PATCH without prompting the user — only field-overlap conflicts open the diff modal. The docs describe "client-side automerge policies vs interactive manual diff modals" (Spec:1181) but do not specify this overlap-based branching behavior.

3. **Key-vault graceful degradation to memory-only** (`zk-key-vault.service.ts:84,101-107,133-135`): when IndexedDB is unavailable, the vault silently falls back to an in-memory key cache. Reasonable, but undocumented and it means "offline key restoration" quietly stops persisting across reloads in some environments.
