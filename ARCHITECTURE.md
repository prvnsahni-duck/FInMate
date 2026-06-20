# FinMate Architecture Overview

## Workspace Layout

FinMate is an Nx monorepo containing three primary packages and supporting infrastructure:

```mermaid
graph TD
    subgraph "Nx Workspace"
        FE["frontend<br/>(Angular 21)"]
        BE["backend<br/>(NestJS)"]
        DM["shared/data-models<br/>(TypeScript Library)"]
        UT["shared/utils<br/>(TypeScript Library)"]
    end

    FE -->|imports entities, DTOs, types| DM
    BE -->|imports entities, DTOs, types| DM
    FE -.->|proxy /api → :3000/api/v1| BE
    BE -->|TypeORM| DB[(PostgreSQL)]
    BE -->|Cache| RD[(Redis)]

    style FE fill:#4facfe,color:#fff
    style BE fill:#00f2fe,color:#000
    style DM fill:#818cf8,color:#fff
    style DB fill:#34d399,color:#000
    style RD fill:#f87171,color:#fff
```

### Package Descriptions

| Package | Path | Purpose |
|---------|------|---------|
| `frontend` | `frontend/` | Angular 21 SPA with standalone components, NGXS state, Tailwind CSS |
| `backend` | `backend/` | NestJS REST API with JWT auth, TypeORM, PostgreSQL |
| `data-models` | `shared/data-models/` | Shared TypeORM entities, DTOs, validation classes, response types |
| `utils` | `shared/utils/` | Shared utility functions |

---

## Backend Architecture

### Module Structure

```mermaid
graph LR
    AM[AppModule] --> Auth[AuthModule]
    AM --> Users[UsersModule]
    AM --> Groups[GroupsModule]
    AM --> Expenses[ExpensesModule]
    AM --> Settlements[SettlementsModule]
    AM --> Import[ImportModule]
    AM --> AI[AiModule]
    AM --> Email[EmailModule]
    AM --> Redis[RedisModule]

    Auth --> JWT[JwtStrategy]
    Auth --> Passport[PassportModule]
```

### Request Flow

```
Client Request
  → Helmet (security headers)
  → CORS check
  → ThrottlerGuard (rate limiting)
  → JwtAuthGuard (authentication)
  → ValidationPipe (DTO validation)
  → Controller → Service → TypeORM Repository → PostgreSQL
  → HttpExceptionFilter (error formatting)
  → Response
```

### Database Layer

- **ORM**: TypeORM with PostgreSQL
- **Naming**: `SnakeNamingStrategy` (all DB columns use `snake_case`)
- **Migrations**: Stored in `backend/src/migrations/`, exported via barrel `index.ts`
- **Entities**: Defined in `shared/data-models/src/lib/`, imported via `@finmate/data-models`
- **Optimistic Locking**: Entities use `@VersionColumn()` for conflict detection
- **Soft Deletes**: Expenses support soft delete via `@DeleteDateColumn()`

### Key Entities

| Entity | Description |
|--------|-------------|
| `User` | Account with email, password hash, 2FA support |
| `Profile` | Extended user profile data |
| `Group` | Expense group (normal, household, trip types) |
| `GroupMember` | Membership with role (owner/admin/member/viewer/spectator) |
| `GroupMemberContribution` | Custom contribution percentages per ledger month |
| `Expense` | Expense record with soft delete and carry-forward |
| `ExpenseSplit` | Individual split allocation per participant |
| `Settlement` | Payment settlement between users |
| `Note` | User notes/memos |
| `Goal` | Financial goals |
| `Attachment` | File attachments for expenses/notes/goals |
| `AuditLog` | Action audit trail |

### Security

- **Authentication**: JWT access + refresh tokens via `@nestjs/passport`
- **Password Hashing**: Argon2
- **Encryption**: AES-256-GCM for sensitive fields (via `ENCRYPTION_KEY` env var)
- **Rate Limiting**: `@nestjs/throttler` (10 requests/60 seconds global)
- **Security Headers**: Helmet middleware
- **CORS**: Configured via `CORS_ORIGINS` / `FRONTEND_URL` env vars

---

## Frontend Architecture

### Structure

```
frontend/src/
├── app/
│   ├── core/                  # Singletons (auth, interceptors, services)
│   │   ├── auth/              # AuthService, AuthGuard, AuthState (NGXS)
│   │   ├── interceptors/      # JWT, error, optimistic-lock interceptors
│   │   ├── services/          # Encryption, automerge, conflict-modal
│   │   └── constants/         # App-wide constants
│   ├── features/              # Feature modules (lazy-loaded)
│   │   ├── groups/            # Group management + expenses
│   │   └── friends/           # Friends & balances
│   └── shared/                # Shared components, pipes, models
├── environments/              # environment.ts, environment.prod.ts
└── styles.scss                # Global Tailwind + safe-area CSS
```

### State Management

FinMate uses a hybrid approach:

| Layer | Technology | Use Case |
|-------|-----------|----------|
| **Local UI** | Angular Signals | Toggles, form state, derived values |
| **Async Streams** | RxJS | HTTP requests, debounced inputs, event composition |
| **Global State** | NGXS | Auth state, cached entities, user preferences |

### Styling

- **Primary**: Tailwind CSS v3 with custom `finmate` color palette
- **Fallback**: SCSS for complex keyframes or cases Tailwind can't cover
- **Dark Mode**: Class-based (`dark` class on `<html>`)
- **Mobile-First**: Responsive breakpoints (xs → 2xl) in Tailwind config
- **Safe Areas**: iOS notch/bottom inset CSS variables

### API Communication

- All services use `environment.apiBaseUrl` (from `environments/environment.ts`)
- Dev proxy (`proxy.conf.json`) rewrites `/api` → `http://localhost:3000/api/v1`
- Interceptors handle JWT injection, error formatting, and optimistic lock conflicts

---

## Environment Variables

All backend environment variables are documented in `.env.example`. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token secret |
| `ENCRYPTION_KEY` | ✅ | AES-256 encryption key |
| `FRONTEND_URL` | ✅ | Frontend origin (CORS + invite links) |
| `CORS_ORIGINS` | ❌ | Comma-separated additional CORS origins |
| `RESEND_API_KEY` | ❌ | Email service API key |
| `OPENAI_API_KEY` | ❌ | AI categorization API key |
| `PORT` | ❌ | Server port (default: 3000) |

---

## Infrastructure

### Local Development

```bash
# Start PostgreSQL + Redis
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start backend (Terminal 1)
npx nx serve backend

# Start frontend (Terminal 2)
npx nx serve frontend
```

### Build

```bash
npx nx build frontend
npx nx build backend
```

### Testing

```bash
npx nx test frontend
npx nx test backend
```
