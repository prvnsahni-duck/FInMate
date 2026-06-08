
# 💰 FinMate — Personal Finance & Lifestyle Companion

## 🧩 Overview
**FinMate** is a comprehensive web and mobile application designed to manage, analyze, and share personal and group expenses. It also integrates notes, goals, and AI insights to make financial management intuitive, collaborative, and intelligent.

---


I've reviewed the suggestions against your current spec. Here's my assessment:

**Critical Gaps to Address (in priority order):**

1. **Data Model & ERD** — Required before backend development starts
2. **API Contracts** — Essential to prevent integration rework
3. **RBAC Matrix** — Authorization rules are vague; define role/permission pairs explicitly
4. **Settlement Algorithm** — Core feature is undefined; needs pseudo-code or formula
5. **Encryption Boundary Table** — Clarify what's encrypted vs. what the AI can access (zero-knowledge conflict)
6. **Real-time Conflict Resolution** — Define versioning/locking strategy for shared edits
7. **Error Model & Validation Standards** — Standardize error responses across API
8. **Import/Export Schemas** — CSV/XLSX format specs are missing

**Medium Priority:**
- Backup/RTO/RPO requirements
- Cost/dependency constraints (OpenAI, Supabase, Sentry limits)
- Offline key-management details

**Fair Concerns:**
- 200KB bundle target may be tight given scope; document MVP boundary
- "One-click setup" needs detailed scripting plan
- Zero-knowledge + AI analysis needs reconciliation

**Recommendation:**
Add a new section **"System Design Details"** after "Architecture & Tech Stack" covering:
- Domain Model (entities, relationships)
- RBAC Matrix (roles × permissions)
- Encryption Classification (per-data rules)
- API Error Taxonomy
- Settlement Logic (pseudocode)

Then add **"Operational Requirements"** section (RTO/RPO, backups, incident response).

Should I draft the replacement markdown for these sections?


| Layer | Technology | Notes |
|-------|-------------|-------|
| **Frontend** | Angular 19 (Standalone Components) | Modular, scalable, SSR-ready |
| **Backend** | NestJS + Fastify | High-performance REST API, WebSockets |
| **Database** | PostgreSQL 16 + pgcrypto | ACID compliance, encrypted storage |
| **Cache Layer** | Redis 7.x | Session store, rate limiting, caching |
| **State Management** | NGXS + RxJS | Predictable state, optimized selectors |
| **Deployment** | Docker + Docker Compose | One-click local & cloud deployment |
| **AI Integration** | OpenAI API (GPT-4) | Smart insights & chatbot |
| **Auth** | JWT + Argon2 + 2FA | Secure session, encryption, RBAC |
| **Storage** | Supabase Storage | Encrypted files, CDN delivery |
| **CDN** | Cloudflare (Free) | Global edge caching, DDoS protection |
| **Offline Support** | PWA + Service Workers + IndexedDB | Offline-first, encrypted local storage |
| **Performance Monitor** | Lighthouse CI + Web Vitals | Continuous performance tracking |

---

## 🧠 Core Features

### A. Expense Management
- Add/edit/delete categorized expenses.
- Monthly and yearly analytics.
- Group-based shared expense tracking.
- Balance carry-forward and debt simplification.
- Multi-user expense contribution tracking.

### B. Shared Group Module
- Create or join expense groups (public/private).
- Add members via invite or link.
- Shared ledger with smart settlement.
- Export/Import (CSV, XLSX) support.
- Collaborative notes inside groups.

### C. Notes & Content Integration
- Personal and shared notes.
- Import social media posts (Instagram, etc.).
- AI summarization and tagging.

### D. Goal & Saving Tracker
- Define financial goals (e.g., “Trip to Goa”).
- Track savings progress.
- Set reminders and targets.

### E. AI Assistant
- Smart insights and analysis.
- Automatic expense categorization.
- Summarization and reminders.

### F. Settings & Controls
- Enable/disable collaboration.
- Manage import/export permissions.
- Sync preferences.
- Theme selection.

---

## ⚙️ Technical Requirements

### 🎯 Performance Standards
- **First Contentful Paint (FCP):** < 1.5s
- **Time to Interactive (TTI):** < 3.0s
- **Lighthouse Score:** > 90 (all categories)
- **Bundle Size:** < 200KB (initial load, gzipped)
- **API Response Time:** < 200ms (p95)
- **Database Query Time:** < 50ms (indexed queries)

### 🏗️ Architecture Requirements
- Reusable UI components with OnPush change detection.
- Proper cleanup of observables (takeUntil pattern).
- Centralized error handling and logging.
- Environment configuration per stage.
- State persistence via encrypted IndexedDB.
- Lazy loading for all feature modules.
- Virtual scrolling for large lists.
- Image optimization (WebP, lazy loading, responsive).
- Tree-shaking enabled for minimal bundles.
- CI/CD pipeline for Web, iOS, and Android (via Capacitor).

---

## 🧱 System Design Details

### 1. Domain Model
- Define core entities for users, profiles, expenses, groups, settlements, notes, goals, and attachments.
- Capture ownership, membership, and sharing boundaries for each entity.
- Document lifecycle rules before backend schema work starts.

### 2. RBAC Matrix
- Define explicit role/permission pairs for personal, shared, and admin contexts.
- List actions such as create, view, edit, delete, invite, export, and settle.
- Clarify which actions are allowed offline and which require sync.

### 3. Encryption Boundary Table
- Mark which fields are encrypted client-side, server-side, or left plaintext.
- Identify which data can be sent to AI services and which must remain zero-knowledge.
- Resolve conflicts between AI features and privacy guarantees.

### 4. API Error Taxonomy
- Standardize validation, auth, conflict, not-found, and server-error responses.
- Define a shared response shape for all REST endpoints.
- Include retry guidance for recoverable failures.

### 5. Settlement Logic
- Specify how group balances are calculated from contributions and shared costs.
- Define debt simplification rules and rounding behavior.
- Keep the algorithm deterministic so clients and backend agree on the same result.

## 📦 Deployment & Infrastructure

**Single Boot Setup (`npm run setup`):**
1. Initialize DB schema.  
2. Seed configuration.  
3. Start backend & frontend.  

**Environment Files:**
- `dev.env`
- `staging.env`
- `prod.env`

**Monitoring Tools:**
- Sentry / Elastic APM

## 🧰 Operational Requirements

- **Backups:** encrypted automated backups with restore testing.
- **Recovery Targets:** define RTO/RPO for personal data and shared groups.
- **Incident Response:** logging, alert routing, and user-facing status updates.
- **Dependency Constraints:** capture limits for OpenAI, Supabase, and monitoring tools.
- **Cost Controls:** document any usage caps needed for MVP operation.

---

## 🔐 Security & Privacy

### 🛡️ Security Architecture
- **End-to-end encryption** (AES-256-GCM).
- **Database encryption** (PostgreSQL pgcrypto, encrypted columns).
- **Password hashing** (Argon2 - memory-hard algorithm).
- **2FA/MFA support** (TOTP - Google Authenticator).
- **JWT authentication** (15min expiry + refresh tokens).
- **File attachment security** (ClamAV virus scanning, encrypted storage).
- **Client-side encryption** before upload/storage.
- **Zero-knowledge architecture** (server can't read user data).
- **Rate limiting** (Redis-based throttling).
- **Security headers** (Helmet.js, CSP, HSTS).
- **Input validation** (class-validator, DOMPurify).
- **SQL injection prevention** (parameterized queries, ORM).
- **XSS/CSRF protection** (built-in NestJS guards).
- **Audit logging** (all financial operations tracked).
- **Session management** (device tracking, remote logout).

### 🔒 Privacy Compliance
- No tracking/ads.
- GDPR and Indian IT Act compliant.
- User-controlled data export/delete.
- Anonymous analytics (no PII).
- Minimal data collection.
- Privacy by design.

---

## 💡 Future Enhancements

- AI-driven spending forecasts.
- Bank API integration.
- Family goal planning.
- Subscription tracker.
- Expense reminder notifications.

---

## 🧩 Pros and Cons

| Pros | Cons |
|------|------|
| Scalable, modular design | Slightly complex setup |
| Hybrid web & mobile app | PWA optimization required |
| AI-driven features | AI tuning effort |
| Offline-first design | Initial dev cycle longer |

---

## 🧾 Developer Documentation

**Include:**
- Folder structure & naming conventions.
- API contracts (Swagger/OpenAPI).
- DFD & ERD diagrams.
- Setup & deployment guide.

---

## ⚡ Performance Optimization Strategy

### 🚀 Frontend Optimization
1. **Angular 19 Features**
   - Standalone components (reduced bundle size)
   - OnPush change detection (fewer renders)
   - Signal-based reactivity (better performance)
   - Deferred loading (@defer) for below-fold content
   - Built-in hydration for SSR

2. **Bundle Optimization**
   - Tree-shaking + dead code elimination
   - Code splitting by routes
   - Lazy loading for all feature modules
   - Dynamic imports for heavy libraries
   - Target bundle: < 200KB initial (gzipped)

3. **Rendering Performance**
   - Virtual scrolling (CDK) for large lists
   - trackBy functions for ngFor loops
   - Memoization for expensive computations
   - Web Workers for heavy calculations
   - Avoid unnecessary re-renders

4. **Asset Optimization**
   - WebP images with fallbacks
   - Responsive images (srcset)
   - Lazy loading images (native + IntersectionObserver)
   - SVG icons (instead of icon fonts)
   - Compress images (TinyPNG/Squoosh)
   - CDN delivery (Cloudflare)

5. **Network Optimization**
   - HTTP/2 server push
   - Resource hints (preload, prefetch, preconnect)
   - Service Worker caching strategies
   - Compression (Brotli > Gzip)
   - API response caching

### ⚙️ Backend Optimization
1. **NestJS + Fastify**
   - Fastify (2x faster than Express)
   - Connection pooling (PostgreSQL)
   - Redis caching layer
   - Compression middleware (Brotli)

2. **Database Optimization**
   - Proper indexing (B-tree, GiST)
   - Query optimization (EXPLAIN ANALYZE)
   - Connection pooling (pgBouncer)
   - Read replicas for analytics
   - Materialized views for reports
   - Pagination (cursor-based)

3. **Caching Strategy**
   - **L1:** In-memory cache (Node.js)
   - **L2:** Redis (shared cache)
   - **L3:** CDN edge cache (Cloudflare)
   - Cache invalidation patterns
   - TTL-based expiry

4. **API Optimization**
   - GraphQL (optional - reduce over-fetching)
   - Batch API requests
   - Field filtering (sparse fieldsets)
   - ETags for cache validation
   - Rate limiting (Redis)

### 📊 Monitoring & Analytics
- **Lighthouse CI** - Automated performance testing
- **Web Vitals** - Core metrics (LCP, FID, CLS)
- **Sentry** - Error tracking + performance monitoring
- **Winston** - Structured logging
- **PostgreSQL pg_stat_statements** - Query performance
- **Redis Monitor** - Cache hit rates
- **Custom metrics** - Business-specific KPIs

### 🎯 Performance Targets
| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint | < 1.5s | Lighthouse |
| Time to Interactive | < 3.0s | Lighthouse |
| Largest Contentful Paint | < 2.5s | Web Vitals |
| Cumulative Layout Shift | < 0.1 | Web Vitals |
| First Input Delay | < 100ms | Web Vitals |
| Bundle Size (initial) | < 200KB | webpack-bundle-analyzer |
| API Response Time (p95) | < 200ms | Sentry |
| Database Query Time | < 50ms | pg_stat_statements |
| Lighthouse Score | > 90 | Lighthouse CI |

---

## 📘 Development Notes

### 🎓 Best Practices
- Use **latest stable versions** of all dependencies
- Avoid memory leaks (unsubscribe observables, cleanup listeners)
- Follow **SOLID principles** and clean code
- Write **unit tests** (80%+ coverage target)
- **E2E tests** for critical user flows
- **Performance budgets** enforced in CI/CD
- **Security audits** (npm audit, Snyk)
- **Accessibility** (WCAG 2.1 AA compliance)

### 🔗 Integration Goals
- Seamless OpenAI integration for smart insights
- Real-time collaboration (WebSockets)
- Offline-first architecture (PWA)
- Cross-platform (Web, iOS, Android)

### 🚀 Deployment Strategy
- One unified boot process (`npm run setup`)
- Docker + Docker Compose for consistency
- Environment-based configuration
- Health checks and graceful shutdown
- Zero-downtime deployments
- Automated backups (encrypted)

---

## 📚 Documentation Structure
- **README.md** - Quick start guide
- **ARCHITECTURE.md** - System design and diagrams
- **API.md** - API documentation (Swagger/OpenAPI)
- **SECURITY.md** - Security architecture and best practices
- **PERFORMANCE.md** - Optimization techniques and benchmarks
- **Progress Log (this file)** - Dated project decisions and execution record
- **CONVERSATIONS.md** - Archive of important decisions and discussions
- **DEVELOPMENT_NOTES.md** - Technical learnings and insights
- **CHANGELOG.md** - Version history and release notes
- **CONTRIBUTING.md** - Contribution guidelines
- **DATABASE.md** - Schema, migrations, and query optimization

---

## 🗂️ Progress Log

### Entry Template
- **Date:** YYYY-MM-DD
- **Summary:** 1-2 lines on what was done
- **Changes Made:**
   - Item 1
   - Item 2
- **Artifacts Updated:**
   - File/Module/Issue references
- **Decisions:**
   - Decision and rationale
- **Next Actions:**
   - Immediate next step

### 2026-06-08
- **Summary:** Established Linear-first project coordination approach and consolidated the active planning record format.
- **Changes Made:**
   - Standardized project operating model to one team + one project (FinMate MVP) with epic grouping and dependency-driven execution.
   - Defined that ongoing progress and detail should be maintained in this specification file as the long-term record.
- **Artifacts Updated:**
   - TICKET_BACKLOG.md
   - FinMate_Project_Specification.md
- **Decisions:**
   - Keep tracking lightweight by using one Linear project during MVP planning.
   - Use this section for date-stamped progress entries instead of splitting history across multiple planning files.
- **Next Actions:**
   - Add one new dated entry at the end of this section whenever meaningful project work is completed.

---

**Version:** 2.0 (Enhanced with Security & Performance)  
**Author:** Prvn Sahni  
**Last Updated:** June 8, 2026  
**Status:** Planning & Architecture Phase
