# 🗺️ FinMate Application Flow (APP_FLOW.md)

## 🔄 User Journey

```
[Landing Page] 
      │
      ├─► [Sign Up / Register] ──► [Onboarding (Profile Settings)]
      │                                   │
      └─► [Sign In / Login] ──────────────┴─► [Dashboard]
                                                 │
      ┌──────────────────┬───────────────────────┼───────────────────┐
      ▼                  ▼                       ▼                   ▼
[Groups List]      [Friends List]       [Saving Goals]        [Settings & Theme]
      │                  │                       │
      ▼                  ▼                       ▼
[Group Detail]     [Friend Debts]        [Add/Update Goal]
  ├─► Ledger
  ├─► Members List
  ├─► Analytics / Charts
  └─► Notes
```

---

## 🧭 Navigation Structure

- **Main Navigation (Desktop Header)**: Profile dropdown, notifications, logout.
- **Sidebar Navigation (Desktop)**: Dashboard, Groups, Friends, Goals, Settings.
- **Mobile Navigation (Bottom Bar)**: Dashboard, Groups, Friends, Goals, Settings.
- **Deep Linking**:
  - `/groups/:id` - Direct access to a specific group ledger.
  - `/groups/:id/join?token=:token` - Group invitation landing page.
  - `/goals` - Saving goals summary dashboard.

---

## 🖥️ Screen Directory

### 1. Dashboard Screen
- **Purpose**: Home viewport displaying a financial overview, personal spending metrics, and actionable alerts.
- **Entry Points**: Auth guard redirect after login, navigation bar clicks.
- **Exit Points**: Sidebar clicks to specific modules.
- **Actions**:
  - Add Personal Expense (triggers modal).
  - Quick-view pending group invitations (Join/Decline actions).
- **Components Used**: `DashboardComponent`, `CreateExpenseModalComponent`, `ConfirmModalComponent`.

### 2. Login / Register Screens
- **Purpose**: Security access portals.
- **Entry Points**: Unauthenticated route guard intercept.
- **Exit Points**: Redirect to Onboarding (if first-time register) or Dashboard (after successful login).
- **Actions**:
  - Submit credentials (email, password).
  - Trigger 2FA TOTP verification challenges if configured.
- **Components Used**: `LoginComponent`, `RegisterComponent`, `SubmitButtonComponent`.

### 3. Groups List Screen
- **Purpose**: Display all active and archived groups the user is a member of.
- **Entry Points**: Sidebar / Bottom nav.
- **Exit Points**: Click group card -> Group Detail Screen.
- **Actions**:
  - Create New Group (triggers modal).
- **Components Used**: `GroupsListComponent`, `CreateGroupModalComponent`.

### 4. Group Detail Screen
- **Purpose**: Unified workspace for a specific group containing ledgers, member roles, analytics, and collaborative notes.
- **Entry Points**: Groups List Screen click, Deep-linked URL.
- **Exit Points**: Back button to Groups List.
- **Tabs**:
  1. **Ledger**: List group expenses with filters. Add Expense, Edit Expense, Void Expense.
  2. **Balances & Settlements**: Shows net balances and simplified debt matching. Propose/Confirm Settlements.
  3. **Household Contributions**: Set monthly target contribution budgets and view expected vs actual progress charts.
  4. **Notes**: Collaborative group-shared notes.
  5. **Members**: Invite new contacts (via multi-identifier staging queue) and manage roles.
- **Components Used**: `GroupDetailComponent`, `CreateExpenseModalComponent`, `AnalyticsChartsComponent`, `ConflictDiffModalComponent`, `GroupMembersComponent`.

### 5. Friends Screen
- **Purpose**: Aggregate list of all friends across all group boundaries showing net positive/negative balances.
- **Entry Points**: Sidebar / Bottom nav.
- **Exit Points**: Click friend -> Friend Debts detail modal.
- **Actions**: View group-by-group breakdown of debts with a specific friend.
- **Components Used**: `FriendsComponent`.

---

## 📦 Module Flows

### Expense Module Flow
```
[Dashboard] / [Group Detail]
      │
      ▼
[Click "Add Expense"]
      │
      ▼
[Fill Details (Amount, Title, Category, Split Type)]
      │
      ▼
[Select Split Participants & Shares]
      │
      ▼
[Confirm/Save] ──► [Client Crypt-Engine (AES-256)]
                          │
                          ▼
                  [Submit encrypted package to API]
                          │
                          ▼
                  [Update local store & Ledger view]
```
