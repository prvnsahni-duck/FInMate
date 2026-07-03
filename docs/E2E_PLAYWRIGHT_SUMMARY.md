# Playwright E2E Infrastructure Final Summary

**Architecture changes**
- Introduced a dedicated Nx-managed Playwright lifecycle: `frontend-e2e:playwright` target now owns installation, configuration, test discovery and reporters.
- `frontend-e2e:e2e` delegates to the Playwright Nx target and ensures `APP_ENV=e2e`/`NODE_ENV=e2e` are set.
- Backend and frontend are started via Nx targets as dependencies of the Playwright target; runner orchestration was added to ensure health checks before tests run.

**Files modified (high level)**
- `frontend-e2e/project.json` — added `playwright` target, updated `e2e` target to delegate to Playwright.
- `frontend-e2e/playwright.config.ts` — Playwright config anchored to the project and restricted to `./src`.
- `frontend-e2e/e2e-runner.js` (temp) and `frontend-e2e/with-env.js` — small wrappers used during migration to set `APP_ENV`/`NODE_ENV` and orchestrate processes.
- `backend/src/app/guards/conditional-throttle.guard.ts` — conditional throttling guard (E2E detection).
- `backend/src/app/app.module.ts` — registered Throttler/guards correctly for DI.
- `backend/src/main.ts` — startup logs now print `APP_ENV`/`NODE_ENV`/`THROTTLE_SKIP` and throttle status.
- Various `frontend-e2e` helpers/pages and small Playwright helpers were added/updated (see section below).

**New helpers**
- `frontend-e2e/helpers/*` — common test helpers (auth, expenses, groups, recurring, etc.) to consolidate flows and reduce duplication.
- `frontend-e2e/pages/*` — Page Objects (DashboardPage, ExpenseDialog, LoginPage, RegisterPage) to encapsulate UI actions and selectors.

**New fixtures**
- Playwright fixtures configured through `frontend-e2e/playwright.config.ts` using `nxE2EPreset` and per-test setup helpers for auth and state management.
- CI-oriented output folder set to `dist/.playwright/frontend-e2e/test-output` with per-test artifact buckets.

**New page objects**
- `frontend-e2e/pages/DashboardPage.ts`
- `frontend-e2e/pages/ExpenseCard.ts`
- `frontend-e2e/pages/ExpenseDialog.ts`
- `frontend-e2e/pages/LoginPage.ts`
- `frontend-e2e/pages/RegisterPage.ts`

**Diagnostics improvements**
- Startup logging in `backend/src/main.ts` for `APP_ENV`, `NODE_ENV`, and `THROTTLE_SKIP`.
- Playwright artifacts captured per failure: screenshot, failure-screenshot, dom.html, console.txt, page-errors.txt, network.json, trace.zip and HTML report.
- `ConditionalThrottleGuard` logs E2E detection to help verify runs.

**Reporter improvements**
- Playwright reporters: `list`, `html` (output to `test-results/playwright-report`), and a custom `reporters/enhanced-reporter.ts` for richer CI-friendly artifacts.
- Nx Playwright plugin `merge-reports` target integration available for consolidated CI reports.

**Nx integration changes**
- `frontend-e2e:playwright` target using `@nx/playwright:playwright` with `config` pointing to `{projectRoot}/playwright.config.ts`.
- `frontend-e2e:e2e` delegates to a wrapper that ensures environment variables are set consistently before running the Playwright target.
- Playwright target depends on `frontend:serve` and `backend:serve` for orchestration; Nx handles start ordering.

**Angular `data-testid` additions**
- Added `data-testid` attributes across critical UI elements used by tests (login buttons, add-group, expense controls, dialogs) to make selectors stable and explicit for Playwright.

**Backend E2E environment changes**
- Permanent E2E detection: `ConditionalThrottleGuard` bypasses `@nestjs/throttler` limits when `APP_ENV==='e2e'` or `NODE_ENV==='e2e'` or `THROTTLE_SKIP==='true'`.
- Startup logs confirm `Throttle enabled: false` under E2E mode.
- `AppModule` registers `ThrottlerGuard` to avoid DI ordering issues.

**Remaining known issues**
- Several Playwright tests are flaky or failing under fully automated runs (examples: `key-lifecycle-flow`, `recurring-expenses`, `expense-flow`); failures appear to be functional (race conditions, timing, or UI ambiguity). Traces and artifacts captured in `dist/.playwright/frontend-e2e/test-output`.
- Some inspector / port conflicts were observed during iterative runs — CI should ensure a clean environment.

**Technical debt**
- Some helpers still contain retries and broad selectors that should be hardened.
- Temporary wrapper scripts (`e2e-runner.js`, `with-env.js`) — keep only the `with-env.js` wrapper if desired; consider moving to cross-platform `cross-env` usage in Nx targets.
- A small amount of Nx target configuration was adjusted ad-hoc; consider consolidating Nx Playwright settings in a central dev-doc.

**Recommended future improvements**
- Stabilize flaky tests (create tasks under the `Stabilize Playwright E2E Suite` epic).
- Replace `with-env.js` with `cross-env` or native Nx `env` support when plugin issues are resolved.
- Add CI job that runs `nx e2e frontend-e2e` with a clean environment and caches Playwright browsers and Nx artifacts appropriately.
- Harden selectors and rely more on semantic roles and test ids.
- Add lightweight service mocks for third-party integrations in CI to reduce flakiness.

---

## How to run locally (developer quick steps)

1. Ensure dev services are not running and ports are free (3000/4200).
2. Start the official Nx e2e command:

```bash
npx nx e2e frontend-e2e
```

No additional args required. This command:
- starts the backend with `APP_ENV=e2e` and `NODE_ENV=e2e`,
- starts the frontend,
- waits for health endpoints and then runs Playwright via the Nx target,
- produces artifacts at `dist/.playwright/frontend-e2e/test-output` and HTML report at `test-results/playwright-report`.

## CI notes
- CI should run `npx nx e2e frontend-e2e` in a clean runner.
- Ensure Redis/Postgres services required by backend are available to the CI job or mock them.
- Use `--skipInstall` for Playwright in CI if browsers are preinstalled, otherwise allow Nx to ensure Playwright installation.

