# FinMate — Agent Working Rules & Project Standards

> This document defines how any AI agent or assistant must behave on this project.  
> **Read this before starting any implementation task.**  
> Applies to: Antigravity IDE, Cursor, GitHub Copilot, Claude, and any other AI tools used on this repo.

---

## 🤖 Agent Behaviour Rules

### Rule 1 — Ask Before Implementing
If **any** of the following are unclear, stop and ask the user before writing a single line of code:
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
| **Frontend State** | Angular Signals (`signal`, `computed`, `effect`) | Prefer over RxJS for local/ephemeral UI state; use NGXS for global persistent state when set up |
| **Spreadsheet I/O** | SheetJS (`xlsx`) | Already installed |
| **Frontend Encryption** | Web Crypto API (`SubtleCrypto`) — PBKDF2 + AES-256-GCM | No third-party crypto libs |
| **Backend Encryption** | Node.js `crypto` — AES-256-GCM | See `EncryptionService` |
| **Testing** | Jest via `npx nx test <project>` | All new services and interceptors must have unit tests |
| **Monorepo** | Nx workspace | Run all targets via `npx nx <target> <project>` |

---

## 📐 Coding Standards

### TypeScript
- **No `any` types** — use `unknown` with type guards, or explicit generics.
- Strict mode is enabled on all `tsconfig.json` — do not relax it.
- All public service methods must have JSDoc comments.

### Angular
- All new components must be **standalone** (`standalone: true`).
- Use `inject()` or constructor injection — never use `Injector` directly.
- Use Angular `HttpClient` for all outbound HTTP in the frontend — no raw `fetch` or `axios`.
- Interceptors must use the functional `HttpInterceptorFn` signature (Angular 15+ style).

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
