# FinMate Agent Rules

## Purpose

This document is the single source of truth for AI agent behavior in this repository.

It applies to Claude Code, Cursor, Codex, Roo Code, Cline, OpenHands, GitHub Copilot, Antigravity IDE, and similar coding agents.

### 🗺️ Project Documentation Map

Before planning or implementing any feature, agents MUST reference the appropriate blueprint files:

- **Product Overview & Features**: Check [PRD.md](./PRD.md)
- **Architecture & Technology Decisions**: Check [TRD.md](./TRD.md)
- **User Journey & Screen Layouts**: Check [APP_FLOW.md](./APP_FLOW.md)
- **Design Guidelines, Colors & UI Rules**: Check [UI_UX_BRIEF.md](./UI_UX_BRIEF.md)
- **DB Entities, Relations & Security Rules**: Check [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- **REST Endpoints & DTO Contracts**: Check [API_SPECIFICATION.md](./API_SPECIFICATION.md)
- **Build Phases & Execution Roadmap**: Check [implementation_plan.md](./implementation_plan.md)
- **Detailed Expenses Module Specifications**: Check [expsnsis-module-plan.md](./expsnsis-module-plan.md)
- **Master Design Overview & Dated Progress Log**: Check [FinMate_Project_Specification.md](./FinMate_Project_Specification.md) for dated implementation diaries, historical decisions, and system specifications.

Primary goals, in order:

1. Correctness
2. Minimal token usage
3. Minimal code changes
4. Fast verification
5. Clear communication

Spend effort on:

- Root cause analysis
- Architecture decisions
- Implementation
- Verification

Avoid spending effort on:

- Broad repository exploration
- Re-reading previously known context
- Large logs or file dumps
- Repeated searches
- Excessive planning
- Unrelated refactoring

---

## Information-First Policy

Before reading files, searching the repository, running investigation steps, or proposing changes, ask:

"Can the user provide this information faster than I can discover it?"

If yes, request the minimum missing information first.

Examples:

- Affected file
- Error message
- Stack trace
- Failing test
- Reproduction steps
- Relevant command output
- Expected behavior

Only perform repository exploration when the information cannot reasonably be provided by the user, or when enough information is already available to proceed with targeted work.

Do not perform repository-wide discovery when the user can provide the missing information more efficiently.

---

## Repository Exploration Rules

Read only files directly related to the task.

Avoid:

- Repository-wide scans
- Reading unrelated directories
- Loading large numbers of files
- Repeated searches
- Rereading known information

Every file read must have a clear reason tied to the task.

---

## Scope Control

Do not expand scope automatically.

Do not:

- Fix unrelated issues
- Refactor adjacent code
- Redesign architecture
- Rename files or folders
- Introduce new patterns
- Change styling conventions

unless explicitly requested.

Use the smallest effective change that solves the requested problem.

---

## Approval Requirements

Request approval before:

- Installing packages
- Adding new dependencies
- Running database migrations
- Deleting files
- Renaming files or folders
- Making architecture changes
- Modifying more than 5 files
- Creating large boilerplate structures
- Introducing new frameworks or libraries

The agent may do the following without approval when scoped to the task:

- Read relevant files
- Search relevant files
- Analyze code
- Create implementation plans
- Propose diffs

These are additional approval gates. Stricter project-specific planning, implementation, dependency, and progress-log rules still apply.

---

## Token Efficiency Rules

Prefer:

- Targeted retrieval
- Minimal diffs
- Localized fixes
- Concise responses
- Focused investigation
- Reusing known context

Avoid:

- Unnecessary planning
- Opportunistic refactoring

---

## Context Reuse Rules

Maintain and reuse a compressed working summary containing:

- Objective
- Relevant files
- Known constraints
- Findings
- Current status

Do not repeatedly rediscover information already known from the current task or prior verified context.

---

## Command Execution Policy

Default state:

DO NOT EXECUTE TERMINAL COMMANDS.

For diagnostics, investigation, information gathering, debugging, and repository analysis:

The agent MUST ask the user to run commands and provide the output.

Examples:

- `npm run build`
- `npm test`
- `pytest`
- `git diff`
- `nx test`
- `nx build`
- `pnpm lint`

Request only:

- first relevant error
- failing test output
- relevant stack trace
- minimal command output

Do not request full logs unless absolutely necessary.

The agent MUST NOT execute commands solely for:

- information gathering
- debugging
- repository exploration
- dependency discovery
- build investigation
- test investigation

Instead, ask the user to run the command and provide the result.

---

## Allowed Command Execution Cases

The agent may execute commands only when ALL of the following are true:

1. The user explicitly instructs the agent to run the command.

OR

2. The user explicitly approves command execution.

OR

3. An implementation plan has already been approved and command execution is required for final verification of the approved work.

If none of the above conditions are met:

The agent must not execute commands.

---

## User-Provided Information Preference

When information can be obtained from either:

- user-provided output
- agent-executed commands

Always prefer user-provided output.

Ask:

"Can the user provide this information faster than I can discover it?"

If yes:

Request the information from the user first.

---

## Investigation Rules

Before running any command, the agent must check whether the user can provide:

- affected file
- error message
- stack trace
- failing test
- command output
- reproduction steps

If any of these are missing and required:

Request them from the user before attempting command execution.

---

## Verification Rules

After implementation approval:

The agent may recommend commands for verification.

Prefer asking the user to run:

- affected test
- affected package test
- affected build target

instead of executing commands directly.

---

## Final Priority Rule

User-provided information is preferred over command execution.

Reading relevant files is preferred over command execution.

Command execution should be the last option, not the first option.

The agent must minimize unnecessary command execution to reduce cost, token usage, and unintended side effects.

Ensure this policy has higher priority than generic investigation behavior and repository exploration behavior.

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

- Generated file list
- Generated code, if relevant
- Desired customization

Do not manually create large boilerplate structures that can be generated automatically.

Focus on:

- Business logic
- Custom behavior
- Integration
- Validation
- Bug fixes

Exception: generate files directly when explicitly requested or when no suitable generator exists.

---

## Planning and Approval Rules

### Ask Before Implementing

If any of the following are unclear, stop and ask the user before writing code:

- The user's request is not specific enough
- Which technology, library, or package to use
- Whether a dependency is already installed or needs to be added
- Whether a UI component should be built from scratch or reuse an existing one
- Whether the work belongs in frontend, backend, shared code, or more than one area
- Whether a feature should be gated behind a user setting or feature flag

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

Never install a new npm package without telling the user first and receiving approval.

---

## Technology Stack

Do not deviate from these decisions without asking the user.

| Concern             | Technology                                  | Notes                                                                        |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Backend Framework   | NestJS (TypeScript)                         | Modules, controllers, services, guards                                       |
| Database ORM        | TypeORM + PostgreSQL                        | Entities with `@VersionColumn` for optimistic locking                        |
| Authentication      | JWT via `@nestjs/passport` + `passport-jwt` | `JwtAuthGuard` on all protected routes                                       |
| Frontend Framework  | Angular 21 standalone components            | No NgModules; use `app.config.ts` providers                                  |
| Frontend HTTP       | Angular `HttpClient` + `HttpInterceptorFn`  | Register via `provideHttpClient(withInterceptors([...]))` in `app.config.ts` |
| Frontend Styling    | Tailwind CSS v3 primary + SCSS fallback     | Use SCSS only when Tailwind cannot cover the need                            |
| Frontend State      | Signals, RxJS, and NGXS                     | Follow the state management strategy below                                   |
| Frontend Encryption | Web Crypto API `SubtleCrypto`               | PBKDF2 + AES-256-GCM; no third-party crypto libraries                        |
| Backend Encryption  | Node.js `crypto`                            | AES-256-GCM; see `EncryptionService`                                         |
| Backend Security    | Helmet + `@nestjs/throttler`                | Security headers and rate limiting                                           |
| Spreadsheet I/O     | SheetJS `xlsx`                              | Already installed                                                            |
| Testing             | Jest via `npx nx test <project>`            | New services and interceptors must have unit tests                           |
| Monorepo            | Nx workspace                                | Run targets via `npx nx <target> <project>`                                  |
| Mobile Native       | Capacitor                                   | Bridge to iOS/Android; `capacitor.config.ts` in root                         |
| PWA                 | `@angular/pwa`                              | Service worker via `ngsw-config.json`; manifest in `frontend/src/`           |

---

## Environment Variables Rules

- All backend environment variables must be documented in `.env.example`.
- Never commit `.env` or `.env.*` files (they are gitignored; `.env.example` is tracked).
- Frontend services must never hardcode API base URLs. Always use `environment.apiBaseUrl` from `frontend/src/environments/environment.ts`.
- The `environment.ts` and `environment.prod.ts` files define `apiBaseUrl` and `production` flag.
- Backend services access env vars via `@nestjs/config` `ConfigService`, not `process.env` directly (except `main.ts` and `ormconfig.ts`).
- CORS origins are configured via `CORS_ORIGINS` env var (comma-separated) or default to `FRONTEND_URL`.

## PWA Rules

- The service worker configuration lives in `frontend/ngsw-config.json`.
- The web app manifest lives in `frontend/src/manifest.webmanifest`.
- All static assets that must work offline must be listed in `ngsw-config.json` asset groups.
- API data caching strategy should use `performance` mode for frequently accessed data and `freshness` for real-time data.
- Do not bypass the service worker for API calls unless explicitly needed.

## Capacitor Rules

- Capacitor config lives in `capacitor.config.ts` at the workspace root.
- Web build output directory is `dist/frontend/browser`.
- After any frontend build change, sync with `npx cap sync` before testing on native.
- Platform-specific code must be behind capability checks, never `if (iOS)` style conditionals.
- Use `@capacitor/` official plugins when available before reaching for community plugins.
- Safe area CSS variables (`--safe-area-inset-*`) are defined in `styles.scss` for iOS notch handling.

---

## Frontend State Management Strategy

Use a hybrid approach with Angular Signals, RxJS, and NGXS.

### Angular Signals

Use for local, component-scoped, synchronous UI state.

Examples:

- Simple form toggles such as `isDropdownOpen` or `isLoading`
- Derived local values using `computed`
- Fast synchronous reactivity that does not require streams

Signals are the modern Angular default for local reactivity.

### RxJS

Use for asynchronous streams, event handling, and timing operations.

Examples:

- HTTP requests from `HttpClient`
- WebSockets or Server-Sent Events
- Debounced or throttled inputs
- Composing async events with operators such as `switchMap` and `combineLatest`

Convert RxJS results to Signals when the data only needs local UI consumption.

### NGXS

Use for global, persistent, shared, or complex application state.

Examples:

- Authentication state
- Cached entity data shared across views
- User preferences persisted to a backend
- Complex action-driven side effects

NGXS is the global source-of-truth layer for complex shared state.

---

## Coding Standards

### General

Use the latest stable syntax and features from the chosen libraries when officially stable and supported.

### TypeScript

- Do not use `any`; use `unknown` with type guards or explicit generics.
- Strict mode is enabled in all `tsconfig.json` files; do not relax it.
- All public service methods must have JSDoc comments.

### Angular

- All new components must be standalone with `standalone: true`.
- Use `inject()` or constructor injection; never use `Injector` directly.
- Use Angular `HttpClient` for all frontend HTTP calls.
- Do not use raw `fetch` or `axios` in Angular frontend code.
- Components must not inject `HttpClient` or make raw HTTP requests directly.
- Use dedicated services under `app/services/` for data access.
- Shared reusable components belong under `app/shared/components/`.
- Always keep HTML templates separate in their own `.component.html` files. Do not write inline templates. Separate style (`.component.scss`) and testing (`.component.spec.ts`) files as necessary.
- Follow the Rule of Three for UI components: Extract a component into a shared/common component (under `app/shared/components/`) only if it is reused in 3 or more places. For 1 or 2 occurrences, keep the markup/logic inline or local to avoid premature/over-engineered abstractions. If a Card layout is repeated 3 or more times across different components, extract it as a shared common component to guarantee styling and design consistency.
- For form controls:
  - Do not create wrapper components for simple Inputs and Selects; instead, use standard HTML elements styled with CSS/Tailwind utility classes (e.g., classes on native HTML elements or a class `.finmate-input` in `styles.scss`) to avoid ControlValueAccessor boilerplate.
  - Create common components for Buttons that handle loading or state indicators (e.g., `app-submit-button`).
  - Create common components for complex Selects/Dropdowns that include search filtering, multi-select tag listing, or autocomplete.
- Keep menus, navigation, categories, and routing lists in config structures or constants.
- Configure routes in `app.routes.ts` to load components lazily with `loadComponent`.
- For very large datasets, plan to use `@angular/cdk/scrolling` virtual scroll.
- Interceptors must use the functional `HttpInterceptorFn` signature.
- Use modern Angular control flow syntax: `@if`, `@else if`, `@else`, `@for`, `@switch`, and `@case`.
- Avoid importing `CommonModule` in new components; import only specific pipes or directives when needed.

### NestJS

- All protected routes must use `@UseGuards(JwtAuthGuard)`.
- DTOs must use `class-validator` decorators.
- Services must not import controllers.
- Controllers must not contain business logic.
- Error responses must conform to the `ErrorResponse` schema in `openapi.yaml`.

### Styling

- Use Tailwind CSS utility classes for all new frontend UI.
- Use SCSS only when Tailwind cannot express the requirement, such as complex keyframes.
- Do not mix BEM class names with Tailwind in the same component.

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

- Minimal diffs
- Localized edits
- Targeted fixes
- Incremental changes
- Existing local patterns

Avoid:

- Full-file rewrites
- Unrelated refactors
- Architecture changes
- Style-only modifications
- New abstractions without clear need

Modify only what is required to achieve the requested outcome.

---

## Verification Rules

Run or request the minimum verification necessary.

Prefer:

- Affected test
- Affected module
- Affected package
- Affected build target
- Focused lint command for changed files

Avoid:

- Full repository validation
- Full test suites
- Large logs

unless required by the task or requested by the user.

New services and interceptors must have unit tests.

---

## Progress Log & Blueprint Update Rules

### 1. Blueprint Updates (On Change Only)

The blueprint files (`PRD.md`, `TRD.md`, `APP_FLOW.md`, `UI_UX_BRIEF.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`) are **not** updated for simple work status tracking. They are **only** modified when a feature requirement, design rule, DB structure, or API endpoint contract actually changes.

### 2. Dated Progress Log (On Every Task/Update)

The **only** document that MUST be updated at the end of every completed task, change, or update is the "Progress Log" section at the bottom of `FinMate_Project_Specification.md`.

Use the established dated format:

- Date
- Summary
- Changes Made
- Artifacts Updated
- Decisions
- Next Actions

This project specification file is the long-term project source of truth.

If the task explicitly excludes documentation updates, ask the user whether to skip the progress log entry.

## Mandatory Task Lifecycle

Every task must follow this sequence.

### Phase 1 - Discovery

Before coding:

1. Read relevant blueprint files.
2. Read relevant architecture files.
3. Identify impacted modules.
4. Ask questions if information is missing.

Output:

- assumptions
- impacted files
- open questions

Do not code yet.

---

### Phase 2 - Implementation

Implement only after:

- requirements understood
- architecture checked
- impact analysis complete

Update:

- code
- tests
- DTOs
- entities
- contracts

---

### Phase 3 - Synchronization

Before task completion verify:

- documentation updated
- roadmap updated
- progress log updated
- architecture references updated
- API specs updated

---

### Phase 4 - Verification

Generate:

- Files Modified
- Tests Added
- Documentation Updated
- Progress Log Updated
- Architecture Drift (PASS / FAIL)

Task is NOT complete until PASS.

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

- The requested task is complete
- The requested deliverable is produced
- Relevant verification passes

Do not continue with opportunistic improvements unless explicitly requested.

---

## Never Do These

- Never install a new npm package without telling the user first and receiving approval.
- Never use `any` types in TypeScript.
- Never use `axios` or raw `fetch` in Angular frontend code.
- Never write raw SCSS when Tailwind can cover the requirement.
- Never start non-trivial implementation before the required plan is approved.
- Never skip unit tests for new services or interceptors.
- Never delete or rename files without approval.
- Never make architecture changes without approval.
- Never fix unrelated issues unless explicitly requested.
# Architecture Governance Rules

This project follows an Architecture-First approach.

The approved architecture is the source of truth.

Agents MUST NOT modify architecture unless explicitly approved by the user.

If implementation requires a new architectural or business decision:

1. STOP.
2. Explain why the decision is required.
3. Present 2-3 implementation options.
4. List pros and cons.
5. Recommend one option.
6. Wait for user approval.

Never assume architecture.
Never invent business rules.
Never silently simplify security.
Never replace an approved design with an easier implementation.

Architecture decisions are permanent unless explicitly superseded.

If architecture changes:

- Update all affected documentation.
- Update ADR documents.
- Update implementation plan.
- Update progress log.
- Verify no documentation drift remains.
# Architecture Drift Prevention

Before completing any task verify:

✓ Code matches approved architecture

✓ Documentation matches implementation

✓ Database matches entities

✓ APIs match DTOs

✓ UI matches business rules

✓ Tests cover new behaviour

✓ Progress log updated

✓ ADR updated (if architecture changed)

Do not mark a task complete until all checks pass.
