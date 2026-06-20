# FinMate Agent Rules

## Purpose

This document is the single source of truth for AI agent behavior in this repository.

It applies to Claude Code, Cursor, Codex, Roo Code, Cline, OpenHands, GitHub Copilot, Antigravity IDE, and similar coding agents.

Primary goals, in order:

1. Correctness
2. Minimal token usage
3. Minimal code changes
4. Fast verification
5. Clear communication

Spend effort on:

* Root cause analysis
* Architecture decisions
* Implementation
* Verification

Avoid spending effort on:

* Broad repository exploration
* Re-reading previously known context
* Large logs or file dumps
* Repeated searches
* Excessive planning
* Unrelated refactoring

---

## Information-First Policy

Before reading files, searching the repository, running investigation steps, or proposing changes, ask:

"Can the user provide this information faster than I can discover it?"

If yes, request the minimum missing information first.

Examples:

* Affected file
* Error message
* Stack trace
* Failing test
* Reproduction steps
* Relevant command output
* Expected behavior

Only perform repository exploration when the information cannot reasonably be provided by the user, or when enough information is already available to proceed with targeted work.

Do not perform repository-wide discovery when the user can provide the missing information more efficiently.

---

## Scope Control

Do not expand scope automatically.

Do not:

* Fix unrelated issues
* Refactor adjacent code
* Redesign architecture
* Rename files or folders
* Introduce new patterns
* Change styling conventions

unless explicitly requested.

Use the smallest effective change that solves the requested problem.

---

## Token Efficiency Rules

Prefer:

* Targeted retrieval
* Minimal diffs
* Localized fixes
* Concise responses
* Focused investigation
* Reusing known context

Avoid:

* Repository-wide scans
* Reading unrelated files
* Loading large file sets
* Repeated searches
* Rereading known context
* Unnecessary planning
* Opportunistic refactoring

Every file read must have a clear reason tied to the task.

---

## Context Reuse Rules

Maintain and reuse a compressed working summary containing:

* Objective
* Relevant files
* Known constraints
* Findings
* Current status

Do not repeatedly rediscover information already known from the current task or prior verified context.

---

## Terminal Command Policy

Do not completely prohibit command execution.

When information is missing, prefer asking the user to run the smallest relevant command and provide summarized output.

Examples:

```bash
npm run build
npm test path/to/test
pytest path/to/test.py
pnpm lint path/to/file
git diff
```

Request only:

* First relevant error
* Failing tests
* Relevant stack trace
* Minimal command output

Avoid requesting full logs unless absolutely necessary.

If sufficient information already exists, continue without requesting additional commands.

When running commands directly is appropriate, run only the minimum verification or inspection command needed for the affected surface.

---

## Framework Generator Policy

When a framework provides an official generator, prefer asking the user to run the generator first.

Examples:

```bash
ng generate component
nx generate
nest generate
rails generate
php artisan make:
```

Ask the user to provide:

* Generated file list
* Generated code, if relevant
* Desired customization

Do not manually create large boilerplate structures that can be generated automatically.

Focus on:

* Business logic
* Custom behavior
* Integration
* Validation
* Bug fixes

Exception: generate files directly when explicitly requested or when no suitable generator exists.

---

## Planning and Approval Rules

### Ask Before Implementing

If any of the following are unclear, stop and ask the user before writing code:

* The user's request is not specific enough
* Which technology, library, or package to use
* Whether a dependency is already installed or needs to be added
* Whether a UI component should be built from scratch or reuse an existing one
* Whether the work belongs in frontend, backend, shared code, or more than one area
* Whether a feature should be gated behind a user setting or feature flag

### Implementation Plan Approval

For any non-trivial feature, defined as more than one source file or more than about 30 lines of source changes:

1. Write an `implementation_plan.md`.
2. Present the plan to the user.
3. Wait for explicit user approval before creating or modifying source files.
4. If approval is given but open questions remain, ask those questions before implementation.

Small tasks may be implemented immediately when the required information is already available.

Medium tasks should receive a brief plan.

Large features require an implementation plan before coding.

Avoid multi-round planning loops unless the task is genuinely unclear.

---

## Dependency Verification Rules

Never assume missing dependencies are available.

Before using a package in code:

1. Check `package.json` or the relevant package manifest.
2. Confirm the dependency is installed.
3. If it is missing and needed, ask the user before adding it or relying on it.

Never install a new npm package without telling the user first and receiving approval when required.

---

## Technology Stack

Do not deviate from these decisions without asking the user.

| Concern | Technology | Notes |
|---|---|---|
| Backend Framework | NestJS (TypeScript) | Modules, controllers, services, guards |
| Database ORM | TypeORM + PostgreSQL | Entities with `@VersionColumn` for optimistic locking |
| Authentication | JWT via `@nestjs/passport` + `passport-jwt` | `JwtAuthGuard` on all protected routes |
| Frontend Framework | Angular 21 standalone components | No NgModules; use `app.config.ts` providers |
| Frontend HTTP | Angular `HttpClient` + `HttpInterceptorFn` | Register via `provideHttpClient(withInterceptors([...]))` in `app.config.ts` |
| Frontend Styling | Tailwind CSS v3 primary + SCSS fallback | Use SCSS only when Tailwind cannot cover the need |
| Frontend State | Signals, RxJS, and NGXS | Follow the state management strategy below |
| Frontend Encryption | Web Crypto API `SubtleCrypto` | PBKDF2 + AES-256-GCM; no third-party crypto libraries |
| Backend Encryption | Node.js `crypto` | AES-256-GCM; see `EncryptionService` |
| Spreadsheet I/O | SheetJS `xlsx` | Already installed |
| Testing | Jest via `npx nx test <project>` | New services and interceptors must have unit tests |
| Monorepo | Nx workspace | Run targets via `npx nx <target> <project>` |

---

## Frontend State Management Strategy

Use a hybrid approach with Angular Signals, RxJS, and NGXS.

### Angular Signals

Use for local, component-scoped, synchronous UI state.

Examples:

* Simple form toggles such as `isDropdownOpen` or `isLoading`
* Derived local values using `computed`
* Fast synchronous reactivity that does not require streams

Signals are the modern Angular default for local reactivity.

### RxJS

Use for asynchronous streams, event handling, and timing operations.

Examples:

* HTTP requests from `HttpClient`
* WebSockets or Server-Sent Events
* Debounced or throttled inputs
* Composing async events with operators such as `switchMap` and `combineLatest`

Convert RxJS results to Signals when the data only needs local UI consumption.

### NGXS

Use for global, persistent, shared, or complex application state.

Examples:

* Authentication state
* Cached entity data shared across views
* User preferences persisted to a backend
* Complex action-driven side effects

NGXS is the global source-of-truth layer for complex shared state.

---

## Coding Standards

### General

Use the latest stable syntax and features from the chosen libraries when officially stable and supported.

### TypeScript

* Do not use `any`; use `unknown` with type guards or explicit generics.
* Strict mode is enabled in all `tsconfig.json` files; do not relax it.
* All public service methods must have JSDoc comments.

### Angular

* All new components must be standalone with `standalone: true`.
* Use `inject()` or constructor injection; never use `Injector` directly.
* Use Angular `HttpClient` for all frontend HTTP calls.
* Do not use raw `fetch` or `axios` in Angular frontend code.
* Components must not inject `HttpClient` or make raw HTTP requests directly.
* Use dedicated services under `app/services/` for data access.
* Shared reusable components belong under `app/components/common/`.
* Keep menus, navigation, categories, and routing lists in config structures or constants.
* Configure routes in `app.routes.ts` to load components lazily with `loadComponent`.
* For very large datasets, plan to use `@angular/cdk/scrolling` virtual scroll.
* Interceptors must use the functional `HttpInterceptorFn` signature.
* Use modern Angular control flow syntax: `@if`, `@else if`, `@else`, `@for`, `@switch`, and `@case`.
* Avoid importing `CommonModule` in new components; import only specific pipes or directives when needed.

### NestJS

* All protected routes must use `@UseGuards(JwtAuthGuard)`.
* DTOs must use `class-validator` decorators.
* Services must not import controllers.
* Controllers must not contain business logic.
* Error responses must conform to the `ErrorResponse` schema in `openapi.yaml`.

### Styling

* Use Tailwind CSS utility classes for all new frontend UI.
* Use SCSS only when Tailwind cannot express the requirement, such as complex keyframes.
* Do not mix BEM class names with Tailwind in the same component.

---

## Mandatory Pre-Implementation Checklist

Before starting any feature ticket, confirm:

1. Frontend, backend, or both?
2. Are all required npm packages installed?
3. Does a similar service, component, module, guard, or interceptor already exist?
4. Does this need a new database migration?
5. Which TypeORM entities are involved, and do they have `@VersionColumn`?
6. Is the feature behind a user opt-in or feature flag?
7. What exact HTTP error code or response schema does the feature depend on?

Use targeted checks only. Do not perform broad repository exploration to answer checklist items if the user can provide the answer faster.

---

## Modification Rules

Prefer:

* Minimal diffs
* Localized edits
* Targeted fixes
* Incremental changes
* Existing local patterns

Avoid:

* Full-file rewrites
* Unrelated refactors
* Architecture changes
* Style-only modifications
* New abstractions without clear need

Modify only what is required to achieve the requested outcome.

---

## Verification Rules

Run or request the minimum verification necessary.

Prefer:

* Affected test
* Affected module
* Affected package
* Affected build target
* Focused lint command for changed files

Avoid:

* Full repository validation
* Full test suites
* Large logs

unless required by the task or requested by the user.

New services and interceptors must have unit tests.

---

## Progress Log Requirement

Upon completing any change, feature, or project step, update the "Progress Log" section at the bottom of `FinMate_Project_Specification.md`.

Use the established dated format:

* Date
* Summary
* Changes Made
* Artifacts Updated
* Decisions
* Next Actions

This project specification file is the long-term project source of truth.

If the task explicitly excludes documentation updates, ask the user whether to skip the progress log entry.

---

## Commit Message Requirement

After each major feature is finished and relevant verification passes, produce a conventional commit message.

Do not create a commit unless the user explicitly asks for one.

---

## Response Format

Keep responses concise.

Default completion response:

1. Root cause
2. Files changed
3. Diff summary
4. Verification results
5. Remaining risks, if any

Do not include unnecessary exploration logs.

Do not repeat repository information already known.

---

## Stop Conditions

Stop when:

* The requested task is complete
* The requested deliverable is produced
* Relevant verification passes

Do not continue with opportunistic improvements unless explicitly requested.

---

## Never Do These

* Never install a new npm package without telling the user first and receiving approval when required.
* Never use `any` types in TypeScript.
* Never use `axios` or raw `fetch` in Angular frontend code.
* Never write raw SCSS when Tailwind can cover the requirement.
* Never start non-trivial implementation before the required plan is approved.
* Never skip unit tests for new services or interceptors.
* Never fix unrelated issues unless explicitly requested.
