# 💰 FinMate Product Requirement Document (PRD)

## 📌 Product Overview

### Product Vision

FinMate is a comprehensive personal finance and lifestyle companion designed to help individuals, households, and groups track, analyze, and settle expenses seamlessly. By combining private zero-knowledge encryption, collaborative group ledgers, structured savings goals, and secure AI-driven financial insights, FinMate makes everyday money management intuitive, collaborative, and highly secure across both web and mobile platforms.

### Problem Statement

Modern personal finance applications suffer from three critical pain points:

1. **Security & Privacy Concerns**: Users are reluctant to store sensitive transactional details online. Most platforms scan and monetize user financial data.
2. **Poor Group Coordination**: Splitting group costs (e.g., roommate expenses, trips, household budgets) involves manual settlement math, back-and-forth communication, and complex balance calculations.
3. **Siloed Financial Planning**: Personal expenses, group bills, notes, receipts, and saving targets are split across multiple disjointed apps, leading to fragmented financial tracking.

### Target Users

- **Individual Budgeters**: Users who want to log personal transactions, view category summaries, and track savings goals with absolute privacy.
- **Shared Households / Roommates**: Co-habitants managing monthly rent, utilities, and grocery bills with custom contribution agreements.
- **Travelers & Event Organizers**: Friends sharing costs for vacations or social gatherings who need smart debt simplification.

### User Personas

#### Persona 1: Amit (The Privacy-Conscious Saver)

- **Role**: Software Engineer
- **Goals**: Track personal discretionary spending and save for a new laptop while ensuring financial data remains completely private.
- **Pain Point**: Apprehensive about financial tracking apps selling transaction histories.

#### Persona 2: Priya & Raj (The Shared Household)

- **Role**: Young married couple managing a shared apartment
- **Goals**: Coordinate household contributions month-over-month according to dynamic income split percentages, carrying over surpluses or deficits easily.
- **Pain Point**: Constant calculations about who paid for groceries vs. utilities and how much is owed at the end of the month.

### Business Goals

- Build user trust through a Zero-Knowledge architecture where credentials and details are encrypted client-side.
- Achieve viral growth through collaborative group invitiation features (QR codes, invite links, email invites).
- Establish a premium subscription framework (Premium User tier) for advanced features like automated bank sync (future phase) and high-volume file attachments.

### Success Metrics

- **Active User Growth**: Month-over-Month (MoM) growth in active users.
- **Group Retention**: Percentage of created groups that log transactions for more than 2 billing cycles.
- **Performance Compliance**: Sub-1.5s First Contentful Paint (FCP) and Lighthouse scores > 90.

---

## 🛠️ Features

### A. Expense Management (Personal & Group)

- **Purpose**: Provide a central ledger for recording all expenditures.
- **User Value**: Single dashboard for tracking where every rupee goes, with automated division of joint bills.
- **Functional Requirements**:
  - Support creation, read, update, and void operations on expenses.
  - Automatically calculate split shares based on type (`equal`, `fixed`, `percent`, `share`).
  - Encrypt transaction titles and descriptions client-side using AES-256-GCM.
- **Non-Functional Requirements**:
  - Total calculations and split checks must execute under 50ms.
  - Encryption keys must never be transmitted to the server.
- **Acceptance Criteria**:
  - Personal expenses (without groups) aggregate into a monthly summary visible on the user dashboard.
  - Splitting an expense allocates rounding pennies to the payer or alphabetically first UUID.
- **Edge Cases**:
  - Splitting an amount that doesn't divide evenly (e.g. $10.00 between 3 people). Rounding allocation is detailed in the Settlement rules.
- **Dependencies**: User Auth, Database sync.

### B. Shared Group Module

- **Purpose**: Collaborative multi-user ledgers for shared expense tracking.
- **User Value**: Eliminates arguments and manual math for shared trips or living arrangements.
- **Functional Requirements**:
  - Group creation with privacy levels: `private`, `invite_only`, `public_readonly`.
  - Multi-identifier invitations (email, username, phone number).
  - Invite via link and QR code routing to joining page.
  - Custom member monthly target contribution percentages for household groups.
  - Single-toggle settings for Carry-Forward behavior (ON rolls over surplus/deficit; OFF resets to zero).
- **Acceptance Criteria**:
  - Owners and Admins can promote/demote/kick members and revoke pending invitations.
  - Group invite landing page displays the list of existing group members.
- **Edge Cases**:
  - Inviting a user not yet registered: creates a placeholder user in `invited` status.
  - Leaving a group as the sole Owner: blocks action until ownership is transferred.
- **Dependencies**: Expenses Module, RBAC Engine.

### C. Import/Export (CSV/XLSX)

- **Purpose**: Support offline bulk editing and migrations.
- **User Value**: Zero-effort migration from other tools and backup capability.
- **Functional Requirements**:
  - Export full group ledger to CSV or XLSX format.
  - Import CSV/XLSX spreadsheets conforming to the API schema.
  - Process imports atomically inside a single database transaction.
- **Acceptance Criteria**:
  - Exported templates can be re-imported without modification.
  - Validation failures on any row roll back the entire import.
- **Dependencies**: Group Module, File Storage.

### D. Goals & Saving Tracker

- **Purpose**: Help users allocate funds toward saving targets.
- **User Value**: Direct visualization of progress encourages financial discipline.
- **Functional Requirements**:
  - Users can create, edit, pause, and delete saving goals.
  - Encrypt goal titles client-side.
- **Acceptance Criteria**:
  - Goal progress updates dynamically as savings are added or withdrawn.
- **Dependencies**: User Auth.

### E. AI Assistant (Opt-in)

- **Purpose**: Provide intelligent categorization and summarization.
- **User Value**: Natural language query interface to ask questions about spending and get automatic categorization.
- **Functional Requirements**:
  - Sweep metadata headers to exclude IDs before routing prompts to external zero-retention AI providers.
  - Ephemeral processing only: backend never writes plain-text prompt contents to database.
- **Acceptance Criteria**:
  - AI features are completely disabled until user toggles `ai_opt_in = true`.
- **Dependencies**: OpenAI API.

---

## 👥 User Roles & Permissions

- **Guest**: Can view public read-only groups or landing/join pages. No ledger entry privileges.
- **User**: General registered user. Can manage personal expenses, private notes, and saving goals. Can join groups as a Member.
- **Premium User**: Access to high-volume attachments, future bank sync API integrations, and advanced AI forecasting.
- **Admin (Group Scope)**: Manage general group members, moderate group expenses/notes, invite members, and configure settings.
- **Owner (Group Scope)**: Absolute administrative control over a group. Can promote/demote admins, delete/archive the group, and manage billing configurations.

## 🔒 Zero-Knowledge & Security Specifications

### Encryption Boundaries

- **Personal Data**: Encrypted with a User Data Key (UDK) derived from the user's password. The UDK encrypts personal expenses, notes, and saving goals.
- **Shared Data**: Encrypted using a dedicated Group Key (AES-GCM 256-bit). Each group has exactly one Group Key, which is shared among all active members. Shared data (group expenses, group notes, group attachments) is never encrypted using a personal key.
- **Backend Visibility**: The backend never decrypts ciphertexts. All names, titles, descriptions, and notes remain encrypted at all times on the server.
- **Plaintext Data**: Currency, category, total amounts, and split calculation parameters remain plaintext `DECIMAL` to enable backend calculations, reporting, and split settlements.

### Personal Dashboard Aggregation

- **No Duplicate Records**: Group expenses are never duplicated or synchronized into a user's personal ledger.
- **Unified Aggregation**: The backend joins `expense_splits` with `expenses` to fetch the user's relevant shares. The frontend resolves the corresponding Group Key to decrypt the details on the fly.

### Refresh & Key Cache Architecture

- **Temporary Key Cache (Current Release)**: A secure temporary key cache (using memory and IndexedDB) stores the wrapped User Data Key and wrapped Group Keys to prevent password prompts on refresh. This cache is cleared on logout or session expiration.
- **Future Architecture (Biometrics/PIN)**: The temporary cache will be replaced in future releases with an Encrypted IndexedDB Key Vault supporting WebAuthn, Device Trust, and Biometric/PIN unlock.
- **Offline Mode**: Decrypted keys are cached securely to enable offline record decryption.

### Key Lifecycle Operations

- **Group Membership**: When inviting a new user, the existing Group Key is wrapped using the new member's public key. No new group keys are generated on join. If a member leaves, their historical decryption permissions are preserved for the period they were authorized.
- **Group Key Versioning (Option 2)**:
  - Group key lifecycle is versioned using immutable `group_key_versions` history.
  - Exactly one version can be `ACTIVE` per group at any time.
  - Member wrapped keys are stored as per-version records (`member_wrapped_group_keys`) and historical rows are never overwritten.
  - Rotation supersedes the prior active version and creates a new active version with fresh wrapped keys.
- **Group Ownership**: A group owner is blocked from leaving the group until administrative ownership is explicitly transferred.
- **Password Changes**: Changing the account password only requires re-wrapping the UDK. It does **not** trigger re-encryption of expenses, notes, or attachments.
- **Encrypted Attachments (Roadmap)**: File uploads are encrypted client-side using a random File Key, which is then wrapped using the Group Key before uploading the ciphertext to Supabase storage.

---

## 📝 User Stories

- **As a** Household Roommate,
  **I want to** configure my custom monthly target contribution percentage,
  **So that** my spending is compared directly to my expected share in the dashboard bar charts.

- **As a** Group Member,
  **I want to** import an expense list from a CSV file,
  **So that** I don't have to input dozens of transactions manually.

- **As a** Security-Conscious User,
  **I want** my notes and expense descriptions encrypted on my device before uploading,
  **So that** no database breach or administrator can read my private financial information.

- **As a** Trip Planner,
  **I want** the system to automatically calculate the minimum number of settlement payments,
  **So that** we can settle all debts easily without making dozens of transfers.

---

## 🗺️ Product Roadmap

### MVP (Phase 1)

- User Registration, JWT Authentication, and 2FA.
- Personal Expense logging and Category Analytics.
- Groups Module with standard Equal/Fixed/Percentage splits.
- Client-Side Encryption (ZK) for titles, descriptions, and private notes.
- Standard import/export of expense logs (CSV/XLSX).
- Basic smart settlement algorithm (greedy matching).

### Phase 2

- Custom monthly contribution percentages for Household groups.
- Carry-forward setting logic and dashboard comparison progress bars.
- Group-joining via QR links and member invitations staging queue.
- Reusable custom Confirm Modals and Submit Buttons.
- Optimistic Concurrency version locks and conflict resolution diff modals.
- PWA support and offline service worker caching.

### Future Features (Phase 3+)

- Integration of Capacitor for native iOS/Android packaging.
- Automatic Bank Sync APIs (via Plaid/Yodlee).
- Multi-currency conversion rates with real-time API syncing.
- AI-driven spending forecasting models.
