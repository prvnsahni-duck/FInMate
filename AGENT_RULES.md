# FinMate — Agent Working Rules & Project Standards

> This document defines how any AI agent or assistant must behave on this project.  
> **Read this before starting any implementation task.**  
> Applies to: Antigravity IDE, Cursor, GitHub Copilot, Claude, and any other AI tools used on this repo.

---

## 🤖 Agent Behaviour Rules

### Rule 1 — Ask Before Implementing
If **any** of the following are unclear, stop and ask the user before writing a single line of code:
- If the user's request is not specific to the issue or lacks sufficient details (ask clarifying questions instead of guessing or making assumptions)
- Which technology / library / package to use for a given concern
- Whether a dependency is already installed or needs to be added
- Whether a UI component should be built from scratch or reuse an existing one
- Which side (frontend vs backend vs shared) the code belongs to
- Whether a feature should be gated behind a user setting or feature flag

### Rule 2 — Never Assume Missing Dependencies Are Available
Always check `package.json` to verify a package is installed before using it in code.  
If it is missing and needed, **install it first and confirm with the user** before writing implementation code.

### Rule 3 — Always Check Existing Patterns First
Before creating a new service, interceptor, component, or module:
1. Search the codebase for similar existing implementations.
2. Follow the same structure, naming, and import style as the existing code.

### Rule 4 — Implementation Plan Must Be Approved Before Code Changes
For any non-trivial feature (more than 1 file or more than ~30 lines):
1. Write an `implementation_plan.md` and present it.
2. Wait for **explicit user approval** before creating or modifying any source files.
3. If approval is given but open questions remain in the plan, ask them before proceeding.

### Rule 5 — Commit Messages on Completion
After each major feature is finished and tests pass, produce a conventional commit message.

### Rule 6 — Always Update the Progress Log in the Project Specification File
Upon completing any change, feature, or project step, you MUST update the **"Progress Log"** section at the bottom of [FinMate_Project_Specification.md](file:///g:/prvn/Projects/FinMate/FinMate_Project_Specification.md) with a new date-stamped entry. Follow the established dated format (Date, Summary, Changes Made, Artifacts Updated, Decisions, Next Actions) to keep it as the single, long-term project source of truth.

### Rule 7 — Ask User to Run Terminal Commands (Always Ask User)
To avoid unnecessary token usage and token expenses, the agent must not run any terminal commands directly using the run command tool.
Instead, for all use cases, the agent must ask/instruct the user in the chat to run these terminal commands themselves on their own machine and report/paste the result back.

### Rule 8 — Ask User to Create/Write Large Files to Save Tokens
To minimize token usage and write expenses during code generation, the agent should write the complete component/file code directly in the chat window. The agent must instruct the user to create the file and paste the code themselves, providing any necessary terminal helper commands (e.g., PowerShell commands to create files) rather than executing `write_to_file` directly for large files.

---

## 🏗️ Technology Stack (Do Not Deviate Without Asking)

| Concern | Technology | Notes |
|---|---|---|
| **Backend Framework** | NestJS (TypeScript) | Modules / Controllers / Services / Guards |
| **Database ORM** | TypeORM + PostgreSQL | Entities with `@VersionColumn` for optimistic locking |
| **Authentication** | JWT via `@nestjs/passport` + `passport-jwt` | `JwtAuthGuard` on all protected routes |
| **Frontend Framework** | Angular 21 (standalone components) | No NgModules; use `app.config.ts` providers |
| **Frontend HTTP** | Angular `HttpClient` + `HttpInterceptorFn` | Register via `provideHttpClient(withInterceptors([...]))` in `app.config.ts` |
| **Frontend Styling** | **Tailwind CSS v3** (primary) + SCSS (fallback) | Use Tailwind for all UI; use SCSS only when Tailwind utility classes cannot cover the need (e.g. complex keyframe animations) |
| **Frontend State** | Signals, RxJS, and NGXS | See detailed State Management Strategy section below |
| **Spreadsheet I/O** | SheetJS (`xlsx`) | Already installed |

---

## 🧠 Frontend State Management Strategy

We use a hybrid approach leveraging **Signals**, **RxJS**, and **NGXS** depending on the specific requirement of the state variable. Follow these guidelines strictly:

### 1. Angular Signals (`signal`, `computed`, `effect`)
**Use for:** Local, component-scoped, synchronous UI state.
- **When to use:** 
  - Simple form toggles (e.g., `isDropdownOpen`, `isLoading`).
  - Derived/computed values that only depend on other local signals (e.g., `fullName = computed(() => firstName() + ' ' + lastName())`).
  - Fast, synchronous reactivity where streams are not required.
- **Why:** Signals are the modern Angular default for local reactivity. They are synchronous, glitch-free, and do not require manual subscription management or `async` pipes in templates.

### 2. RxJS (Observables, Subjects, `takeUntilDestroyed`)
**Use for:** Asynchronous data streams, event handling, and complex timing operations.
- **When to use:**
  - HTTP requests (`HttpClient` returns observables).
  - WebSockets or Server-Sent Events (SSE).
  - Debouncing/Throttling inputs (e.g., search typeahead).
  - Composing multiple async events (e.g., `switchMap`, `combineLatest`).
- **Why:** RxJS excels at composing asynchronous events and handling race conditions. Use RxJS to fetch data, and then convert the result to a Signal (e.g., `toSignal()`) if it only needs to be consumed locally in the UI.

### 3. NGXS (Global State Management)
**Use for:** Global, persistent, shared, or complex application state.
- **When to use:**
  - User Authentication state (`AuthState`, tokens, user profile).
  - Cached entity data shared across multiple views (e.g., `GroupsState`, `ExpensesState`).
  - User preferences (e.g., theme settings if they need to be persisted to a backend).
  - Complex state logic where actions need to trigger side effects (e.g., dispatching `Login` triggering a redirect on success).
- **Why:** NGXS provides a clear CQRS (Command Query Responsibility Segregation) pattern. It gives us a single source of truth, allows for easy debugging via Redux DevTools, and handles complex state mutations safely outside of components.
| **Frontend Encryption** | Web Crypto API (`SubtleCrypto`) — PBKDF2 + AES-256-GCM | No third-party crypto libs |
| **Backend Encryption** | Node.js `crypto` — AES-256-GCM | See `EncryptionService` |
| **Testing** | Jest via `npx nx test <project>` | All new services and interceptors must have unit tests |
| **Monorepo** | Nx workspace | Run all targets via `npx nx <target> <project>` |

---

## 📐 Coding Standards

### General
- **Use Latest Stable Features** — Always use the latest stable syntax and features from the libraries being used (provided they are officially stable and supported by the organization).

### TypeScript
- **No `any` types** — use `unknown` with type guards, or explicit generics.
- Strict mode is enabled on all `tsconfig.json` — do not relax it.
- All public service methods must have JSDoc comments.

### Angular
- All new components must be **standalone** (`standalone: true`).
- Use `inject()` or constructor injection — never use `Injector` directly.
- Use Angular `HttpClient` for all outbound HTTP in the frontend — no raw `fetch` or `axios`.
- **Service/UI Decoupling**: Components MUST NOT inject `HttpClient` or make raw HTTP requests directly. Always construct and inject a dedicated service (e.g. `GroupsService`, `ExpensesService`) under `app/services/` for data access.
- **Common/Shared Components**: Group all components that are shared/reused across multiple modules under the `app/components/common/` namespace.
- **Config-Driven Menus & Options**: Maintain menus, navigation, categories, and routing lists in configuration structures/constants rather than hardcoding lists directly in HTML templates.
- **Slicing & Lazy Loading**: Always configure routes in `app.routes.ts` to load components lazily (`loadComponent`) to keep the initial load bundle size minimal. For listing very large datasets, plan to leverage `@angular/cdk/scrolling` virtual scroll to optimize DOM node foot-print.
- Interceptors must use the functional `HttpInterceptorFn` signature (Angular 15+ style).
- **Control Flow Syntax** — Use the modern Angular control flow syntax (`@if`, `@else if`, `@else`, `@for`, `@switch`, `@case`) instead of structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`). Avoid importing `CommonModule` in new components; instead, import only specific pipes/directives needed (e.g. `NgClass`, `NgStyle`, `CurrencyPipe`, `DatePipe`).

### NestJS
- All protected routes must use `@UseGuards(JwtAuthGuard)`.
- DTOs must use `class-validator` decorators.
- Services must not import controllers; controllers must not contain business logic.
- Error responses must conform to the `ErrorResponse` schema in `openapi.yaml`.

### Styling
- Use **Tailwind CSS utility classes** for all new frontend UI.
- Use SCSS only when Tailwind cannot express the desired effect (e.g. complex keyframes, procedural loops).
- Do not mix BEM class names with Tailwind in the same component.

---

## ❓ Mandatory Pre-Implementation Checklist

Before starting any feature ticket, confirm all of these:

1. **Frontend, backend, or both?**
2. **Are all required npm packages installed?** (Check `package.json`.)
3. **Does a similar service / component already exist?** (Extend, don't duplicate.)
4. **Does this need a new database migration?**
5. **Which TypeORM entities are involved and do they have `@VersionColumn`?**
6. **Is the feature behind a user opt-in or flag?**
7. **What is the exact HTTP error code / response schema the feature depends on?**

---

## 🚫 Never Do These

- Never install a new npm package without telling the user first.
- Never use `any` types in TypeScript.
- Never use `axios` or raw `fetch` in Angular frontend code — always use `HttpClient`.
- Never write raw SCSS when Tailwind can cover the need.
- Never start implementation before the plan is approved.
- Never skip writing unit tests for new services or interceptors.
