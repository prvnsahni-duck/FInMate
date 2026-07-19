# Epic: Stabilize Playwright E2E Suite

Purpose: Track and stabilize flaky Playwright tests after the infrastructure refactor. Do not fix tests now — these items are backlog for the epic.

## Description

This epic contains tasks to investigate and stabilize intermittent failures observed when running `npx nx e2e frontend-e2e`. Each failing test should include trace artifacts, screenshots and network logs for triage.

## Remaining flaky tests (captured during verification)

- `frontend-e2e/src/key-lifecycle-flow.spec.ts` — re-authentication / key clearing flakiness
- `frontend-e2e/src/recurring-expenses.spec.ts` — timeout waiting for groups UI
- `frontend-e2e/src/expense-flow.spec.ts` — intermittent register/login 429s observed historically (related to throttling if env not set)
- `frontend-e2e/src/indexeddb-fallback.spec.ts` — storage/refresh timing differences
- `frontend-e2e/src/example.spec.ts` — shell load timing in CI

## Recommended triage steps (to be executed under this epic)

1. Re-run the failing test locally with `npx playwright show-trace <trace.zip>` and review artifacts.
2. Harden selectors that resolved to multiple elements (use data-testid or getByRole with name).
3. Add deterministic waits where necessary (e.g., wait for health/state) and reduce reliance on implicit timing.
4. Consider controlled test data (DB fixtures) to reduce environmental variance.
5. If failures relate to external services, mock or stub them in CI.

## Acceptance criteria for epic

- All playwright tests pass reliably in CI for at least 3 consecutive runs.
- `npx nx e2e frontend-e2e` remains the single command to run E2E.

## Tracking

Create one issue per failing spec with attached artifacts from `dist/.playwright/frontend-e2e/test-output` and assign to the QA/engineering team for triage.
