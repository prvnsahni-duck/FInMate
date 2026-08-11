# `/people` API Response Contracts (Final — Backend Phase 1)

Status: **Implemented & DB-verified (2026-08-11).** Frontend not yet built.
All responses are wrapped in the standard envelope:

```jsonc
{ "success": true, "message": "…", "data": <payload> }
```

Auth: `Authorization: Bearer <jwt>` on every route (`JwtAuthGuard`). The caller
("you") is always `req.user.id`; every amount is signed **from the caller's
perspective**. Registered users only in V1 (pending Contacts don't appear here).

---

## 1. `GET /people?limit={n}` — dashboard / list

`limit` (e.g. `5`) caps the list for the dashboard widget; omit for the full
"View all" list. `data` = `PeopleOverviewResponse`:

```jsonc
{
  "currency": "INR",
  "totalYouAreOwed": 1030,      // Σ of positive nets (across rows)
  "totalYouOwe": 430,           // Σ of |negative nets|
  "people": [
    {
      "counterpartyUserId": "b1c2…",  // route param for the detail page
      "displayName": "Naveen",
      "email": "naveen@example.com",
      "currency": "INR",
      "netBalance": 720,               // > 0 ⇒ they owe you
      "direction": "owes_you"          // "owes_you" | "you_owe" | "settled"
    },
    { "counterpartyUserId": "c3…", "displayName": "Praveen", "email": "…",
      "currency": "INR", "netBalance": -180, "direction": "you_owe" }
  ]
}
```

**How the UI reads it**
- **Current balance + direction**: `netBalance` + `direction`. Render human text
  from `direction`, magnitude from `Math.abs(netBalance)`:
  - `owes_you` → "{displayName} owes you ₹{|net|}"
  - `you_owe` → "You owe {displayName} ₹{|net|}"
  - `settled` → "Settled"
- **Top summary cards**: `totalYouAreOwed` / `totalYouOwe`.
- **Ordering / max-5**: `people` is already sorted by `|netBalance|` desc (settled
  last). For the dashboard call with `limit=5`; for "View all" call without it.
- **Multi-currency**: one row per (person, currency). A person you owe in two
  currencies appears as two rows, each with its own `currency`.

---

## 2. `GET /people/{userId}` — person detail

`data` = `PersonDetailResponse`:

```jsonc
{
  "counterpartyUserId": "b1c2…",
  "displayName": "Naveen",
  "email": "naveen@example.com",

  // Headline = dominant-currency net (largest |net| across currencies)
  "currency": "INR",
  "netBalance": 720,
  "direction": "owes_you",

  // One row per currency; net = groupObligations + directLending + settlements
  "breakdown": [
    {
      "currency": "INR",
      "groupObligations": 500,   // from normal-group expenses (pairwise)
      "directLending": 300,      // from direct lend/borrow
      "settlements": -80,        // returns/settlements (always reduces net)
      "net": 720
    }
  ],

  // Chronological (newest first). Signed from the caller's perspective:
  //   amount > 0 ⇒ increases what they owe you; < 0 ⇒ increases what you owe.
  "history": [
    {
      "id": "settlement:9f…",
      "source": "settlement",          // "group_expense" | "direct" | "settlement"
      "entryType": "settlement",       // present for direct + settlement lines
      "amount": -80,
      "currency": "INR",
      "date": "2026-08-11",
      "note": "UPI"
    },
    {
      "id": "expense:7a…",
      "source": "group_expense",
      "amount": 500,
      "currency": "INR",
      "date": "2026-08-08",
      "groupId": "g-goa…",             // ← source group reference
      "groupName": "Goa Trip",
      "expenseId": "7a…",              // ← source expense reference (open it)
      "title": "<ciphertext>"          // E2EE — decrypt client-side with group key
    },
    {
      "id": "direct:4b…",
      "source": "direct",
      "entryType": "lend",
      "amount": 200,                   // you lent → they owe you
      "currency": "INR",
      "date": "2026-08-04",
      "note": "cash"
    }
  ]
}
```

**How the UI reads it**
- **Header balance + direction**: `netBalance` + `direction` (dominant currency).
  The `[Return]` button prefills `Math.abs(netBalance)` in `currency`.
- **Breakdown panel**: iterate `breakdown` (per currency). The three lines map to
  "Group expenses / Direct lending / Settlements"; `net` is the row total.
- **Transaction history**: iterate `history` (already sorted newest-first). Per
  line:
  - **Amount + direction**: sign of `amount` (`> 0` = they owe you). Show
    `Math.abs(amount)` + a direction label derived from the sign.
  - **Type**: `source` (+ `entryType` for direct/settlement) → badge
    ("Group expense" / "Lent" / "Borrowed" / "Settlement").
  - **Date**: `date` (YYYY-MM-DD).
  - **Note**: `note` when present.
  - **Source group reference**: `groupId` + `groupName` → link to
    `/groups/{groupId}`.
  - **Source expense reference**: `expenseId` → open the original expense.
    `title` is **encrypted**; decrypt with the group key before display (same
    path the group expense list already uses).
  - Direct/settlement lines have **no** group/expense refs (by design) — render
    them as "Direct transaction".

> Identity used in history line `id` (`expense:…` / `direct:…` / `settlement:…`)
> is a stable, source-qualified key suitable for `@for` tracking.

---

## 3. Write endpoints (for the detail-page actions)

| Action | Method & route | Body | Notes |
| --- | --- | --- | --- |
| Add Transaction (Lend/Borrow) | `POST /people/{userId}/transactions` | `{ entryType: "lend"\|"borrow", amount, currency, occurredOn, note? }` | No group selector. Returns the created `DirectLedgerEntry`. |
| Return / Settle | `POST /people/{userId}/settlements` | `{ amount, currency, occurredOn, note? }` | Direction inferred from current net. **Over-settlement rejected** (`SETTLE_OVER_AMOUNT`); nothing outstanding → `SETTLE_NOTHING_OUTSTANDING`. |
| Edit direct entry | `PATCH /people/transactions/{id}` | `{ amount?, occurredOn?, note?, version }` | Version-checked (`CON_VERSION_CONFLICT`). |
| Delete direct entry | `DELETE /people/transactions/{id}` | — | Soft-delete; history preserved; caller must be a party. |

Error bodies follow the existing `ErrorResponse` schema (`{ errorCode, message }`).
After any write, the UI should re-fetch `GET /people/{userId}` (and/or `GET
/people`) to get the recomputed net — balances are always **derived**, never
returned as a stored aggregate from the write endpoints.

---

## 3a. Currency handling (V1 limitation — documented)

Balances are always computed and displayed **per currency** — the system never
sums amounts in different currencies into one number. Consequences:

- Each person row (`/people`) and each person's `breakdown[]` (`/people/:id`)
  carry their own `currency`.
- The dashboard **headline totals** (`totalYouAreOwed` / `totalYouOwe`) report a
  single **dominant** currency (`currency` = the one with the largest
  outstanding activity). They are **not** a mixed-currency sum.
- When relationships span more than one currency, `hasMultipleCurrencies` is
  `true`; the UI shows a caveat ("Totals shown in {currency}; you also have
  balances in other currencies") so non-dominant balances are never silently
  rolled into the headline number.

**Limitation:** if a user has significant balances in several currencies, the
headline totals reflect only the dominant one. Full multi-currency totals (e.g. a
per-currency summary strip) are a future enhancement. This is safe by
construction — no misleading combined figure is ever produced.

## 4. Guarantees the UI can rely on

- `netBalance` sign is the single source of truth for direction; `direction` is a
  convenience label consistent with it.
- `breakdown[currency].net` always equals that currency's slice of `netBalance`
  math: `groupObligations + directLending + settlements`.
- `settlements` in the breakdown is always signed so it **reduces** the
  outstanding balance.
- **Household expenses never appear** in any `/people` payload (DB-verified).
- Group-derived history lines always carry `groupId`, `groupName`, `expenseId`;
  direct lines never do.
- Editing/deleting an expense or a direct entry is reflected on the next fetch
  (balances are recomputed, not cached).
