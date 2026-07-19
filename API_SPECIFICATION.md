# 🔌 API Specification Contract (API_SPECIFICATION.md)

## 🌐 Global API Conventions

### 1. Base URL & Path-based Versioning

All API endpoints are versioned and prefixes are defined as:

```http
https://api.finmate.com/api/v1
```

### 2. Global Headers

- `Content-Type: application/json`
- `Authorization: Bearer <JWT_ACCESS_TOKEN>` (for protected endpoints)
- `X-MFA-Code: <6-digit-totp>` (required for high-security action endpoints)

### 3. API Error Payload

For any error responses (HTTP status code >= 400), the backend returns:

```json
{
  "statusCode": 400,
  "timestamp": "2026-06-20T22:42:00.000Z",
  "path": "/api/v1/expenses",
  "errorCode": "VAL_INVALID_INPUT",
  "message": "Input validation failed",
  "details": [
    {
      "field": "amountTotal",
      "issue": "must be a positive decimal number"
    }
  ],
  "retryable": false
}
```

---

## 📂 Endpoint Specifications

### 🔐 0. E2EE Key & Invite Management

#### A. Lookup User Public Wrapping Key

- **Method**: `GET`
- **Route**: `/users/lookup?identifier=<email|username>`
- **Auth Required**: Yes
- **Success Response (`200 OK`)**:

```json
{
  "userId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
  "publicWrappingKey": "{\"kty\":\"RSA\",...}",
  "displayName": "Alex Miller",
  "email": "user@example.com"
}
```

#### B. Save My Wrapping Keys

- **Method**: `POST`
- **Route**: `/users/me/keys`
- **Auth Required**: Yes
- **Request Body**:

```json
{
  "publicWrappingKey": "{\"kty\":\"RSA\",...}",
  "encryptedPrivateWrappingKey": "iv_base64:ciphertext_base64"
}
```

#### C. Get My Wrapping Keys

- **Method**: `GET`
- **Route**: `/users/me/keys`
- **Auth Required**: Yes

#### D. Get User Public Wrapping Key

- **Method**: `GET`
- **Route**: `/users/{id}/public-key`
- **Auth Required**: Yes

#### E. Create Secure Group Invite Link

- **Method**: `POST`
- **Route**: `/groups/{id}/invites`
- **Auth Required**: Yes (owner/admin)
- **Request Body**:

```json
{
  "wrappedGroupKey": "iv_base64:ciphertext_base64"
}
```

#### F. Resolve Invite Link Metadata

- **Method**: `GET`
- **Route**: `/invite-links/{inviteToken}`
- **Auth Required**: Yes
- **Notes**: Expired invite tokens return `404 Invalid or expired invitation link`.

#### G. Join Group By Invite Token

- **Method**: `POST`
- **Route**: `/groups/join/{inviteToken}`
- **Auth Required**: Yes
- **Success Response (`200 OK`)**:

```json
{
  "member": {
    "id": "membership-uuid",
    "role": "member",
    "joinStatus": "active"
  },
  "groupId": "group-uuid",
  "wrappedGroupKey": "iv_base64:ciphertext_base64",
  "groupKeyVersionId": "group-key-version-uuid",
  "groupKeyVersion": 1
}
```

#### H. Provision Wrapped Group Keys

- **Method**: `POST`
- **Route**: `/groups/{id}/keys`
- **Auth Required**: Yes
- **Request Body**:

```json
{
  "keys": [{ "userId": "user-uuid", "wrappedKey": "iv_base64:ciphertext_base64" }]
}
```

#### I. Get My Wrapped Group Key

- **Method**: `GET`
- **Route**: `/groups/{id}/keys/me`
- **Auth Required**: Yes
- **Success Response (`200 OK`)**:

```json
{
  "groupId": "group-uuid",
  "userId": "user-uuid",
  "groupKeyVersionId": "group-key-version-uuid",
  "groupKeyVersion": 1,
  "wrappedKey": "iv_base64:ciphertext_base64"
}
```

#### J. Get Missing Group Key Members

- **Method**: `GET`
- **Route**: `/groups/{id}/keys/missing`
- **Auth Required**: Yes (owner/admin)

#### K. Rotate Group Key (Versioned)

- **Method**: `POST`
- **Route**: `/groups/{id}/keys/rotate`
- **Auth Required**: Yes (owner/admin)
- **Request Body**:

```json
{
  "reason": "member-device-compromised",
  "keys": [{ "userId": "user-uuid", "wrappedKey": "iv_base64:ciphertext_base64" }]
}
```

- **Success Response (`200 OK`)**:

```json
{
  "groupId": "group-uuid",
  "groupKeyVersionId": "group-key-version-uuid",
  "groupKeyVersion": 2,
  "status": "ACTIVE"
}
```

#### L. Invite Member Payload Additions

- `POST /groups/{id}/members` now supports optional:
  - `wrappedGroupKey`
  - `inviteKeyHash`

### 🔐 1. Authentication Module

#### A. Register User

- **Method**: `POST`
- **Route**: `/auth/register`
- **Auth Required**: No
- **Request Body**:

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "displayName": "Alex Miller"
}
```

- **Validation**:
  - `email` must be a valid email string.
  - `password` must be at least 8 characters long, containing 1 number and 1 special symbol.
- **Success Response (`201 Created`)**:

```json
{
  "id": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
  "email": "user@example.com",
  "displayName": "Alex Miller",
  "status": "active",
  "createdAt": "2026-06-20T22:42:00.000Z",
  "updatedAt": "2026-06-20T22:42:00.000Z"
}
```

#### B. Login User

- **Method**: `POST`
- **Route**: `/auth/login`
- **Auth Required**: No
- **Request Body**:

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "deviceId": "client-browser-guid"
}
```

- **Success Response (`200 OK`)**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...",
  "user": {
    "id": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
    "email": "user@example.com",
    "displayName": "Alex Miller"
  }
}
```

#### C. Refresh Access Token

- **Method**: `POST`
- **Route**: `/auth/refresh`
- **Auth Required**: No
- **Request Body**:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey..."
}
```

- **Success Response (`200 OK`)**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey..."
}
```

---

### 💵 2. Expenses Module

#### A. Create Expense

- **Method**: `POST`
- **Route**: `/expenses`
- **Auth Required**: Yes (Bearer Token)
- **Request Body**:

```json
{
  "title": "ENCRYPTED_BASE64_CIPHERTEXT",
  "description": "ENCRYPTED_BASE64_CIPHERTEXT",
  "amountTotal": 120.5,
  "currency": "USD",
  "category": "Food",
  "paidByUserId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
  "groupId": "2ab72e81-b20f-488f-a9cb-b2f5cf111818",
  "expenseDate": "2026-06-20",
  "splits": [
    {
      "participantUserId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
      "splitType": "equal",
      "shareValue": 1.0
    },
    {
      "participantUserId": "bfa899a8-e1a1-432d-9831-43229b1aa921",
      "splitType": "equal",
      "shareValue": 1.0
    }
  ]
}
```

- **Success Response (`201 Created`)**:

```json
{
  "id": "f5e929b9-d2b3-4f9e-990a-f0c33a923df2",
  "title": "ENCRYPTED_BASE64_CIPHERTEXT",
  "description": "ENCRYPTED_BASE64_CIPHERTEXT",
  "amountTotal": 120.5,
  "currency": "USD",
  "category": "Food",
  "paidByUserId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
  "groupId": "2ab72e81-b20f-488f-a9cb-b2f5cf111818",
  "expenseDate": "2026-06-20",
  "version": 1,
  "splits": [
    {
      "id": "782ab11a-ee4c-4e89-9832-fa11cbe2d321",
      "amountOwed": 60.25,
      "participantUserId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61"
    },
    {
      "id": "e99ad220-410a-4fb4-811c-fe998da2b34e",
      "amountOwed": 60.25,
      "participantUserId": "bfa899a8-e1a1-432d-9831-43229b1aa921"
    }
  ]
}
```

#### B. Update Expense (Supports Concurrency Control)

- **Method**: `PATCH`
- **Route**: `/expenses/{id}`
- **Auth Required**: Yes
- **Request Body**:

```json
{
  "title": "ENCRYPTED_BASE64_NEW_TITLE",
  "amountTotal": 130.0,
  "version": 1
}
```

- **Success Response (`200 OK`)**: Updated expense object payload with `version: 2`.
- **Error Response (`412 Precondition Failed`)**: Mismatched version code.

```json
{
  "statusCode": 412,
  "errorCode": "CON_VERSION_CONFLICT",
  "message": "Resource version conflict. The expense has been modified by another user.",
  "retryable": true
}
```

---

### 🤝 3. Settlements Module

#### A. Calculate Group Balances

- **Method**: `GET`
- **Route**: `/groups/{groupId}/settlements/balances`
- **Auth Required**: Yes
- **Success Response (`200 OK`)**:

```json
{
  "balances": [
    {
      "userId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
      "displayName": "Alex Miller",
      "netBalance": 60.25,
      "currency": "USD"
    },
    {
      "userId": "bfa899a8-e1a1-432d-9831-43229b1aa921",
      "displayName": "Bob Friend",
      "netBalance": -60.25,
      "currency": "USD"
    }
  ],
  "suggestedSettlements": [
    {
      "fromUserId": "bfa899a8-e1a1-432d-9831-43229b1aa921",
      "toUserId": "e44d3202-b2a6-42d4-bb06-b33df1fb3e61",
      "amount": 60.25,
      "currency": "USD"
    }
  ]
}
```

#### B. Confirm Settlement (Creditor Only)

- **Method**: `PATCH`
- **Route**: `/groups/{groupId}/settlements/{id}`
- **Auth Required**: Yes
- **Request Body**:

```json
{
  "status": "confirmed",
  "settledOn": "2026-06-20",
  "version": 1
}
```

- **Success Response (`200 OK`)**: Updated settlement object.
- **Validation**: Enforce that the authenticated user matching `req.user.id` must be the creditor (`toUserId`).
