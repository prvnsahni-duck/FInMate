# Zero-Knowledge Group Key Flow

FinMate uses a Zero-Knowledge (ZK) encryption system to ensure that all personal and group financial data (expense titles, descriptions, attachments) remains private and undecryptable by the server. Only authorized members of a group hold the keys required to decrypt shared ledger items.

---

## Key Types & Flows

### Flow A: Personal Encryption (Symmetric)

- **Target**: Personal expenses (not part of any group).
- **Key**: User's master key, derived client-side from their password and email via PBKDF2.
- **Wrapping**: Content keys are wrapped symmetrically using the user's master key and stored on the server.
- **Decryption**: Direct symmetric unwrap using the active session key.

### Flow B: Direct Invitation (Asymmetric - Canonical Flow)

- **Target**: Registered users invited to a group.
- **Key**: Group symmetric key (AES-256-GCM), wrapped using the recipient's public wrapping key (RSA-OAEP 2048-bit).
- **RSA Key Bootstrapping**: A dedicated `CryptoBootstrapService` runs automatically when the app initializes or whenever a user logs in. It ensures that every registered user has an active RSA public/private keypair and registers the public key on the server.
- **Wrapping**:
  - The inviter fetches the recipient's public wrapping key from `/users/:userId/public-key`.
  - The inviter encrypts/wraps the group key using this public key.
  - The inviter uploads the wrapped key to `/groups/:groupId/members` with `wrappingMethod: "RSA-OAEP"`.
- **Joining & Decryption**:
  - The recipient accepts the invite.
  - The recipient's browser fetches the wrapped key from `/groups/:groupId/keys/me`.
  - The recipient unwraps it using their asymmetric private wrapping key (stored locally and unlocked by their master key).
  - The recipient re-wraps the group key symmetrically using their master key, posts this symmetric version to `/groups/:groupId/keys`, and caches the raw group key in IndexedDB.

### Flow C: Link Invitation (Temporary Invite Key - TIK - Legacy Compatibility)

- **Target**: Unregistered users invited via a secure link where public wrapping keys cannot be resolved.
- **Key**: Group symmetric key (AES-256-GCM), wrapped with a one-time Temporary Invite Key (TIK, AES-GCM 256-bit).
- **Wrapping**:
  - The inviter generates a random TIK, wraps the group key with it, and uploads the wrapped group key and TIK hash to `/groups/:groupId/members` with `wrappingMethod: "AES-KW"`.
  - The inviter generates a link containing the invite token and the raw TIK in the hash fragment: `/groups/join/:token#TIK`.
- **Joining & Decryption**:
  - The recipient clicks the link. The browser extracts the TIK from the hash fragment, joins the group, and receives the TIK-wrapped group key.
  - The browser decrypts the group key using the TIK.
  - The browser re-wraps the group key symmetrically with the user's master key, uploads the self-wrapped symmetric key to `/groups/:groupId/keys`, and stores the key in IndexedDB.
    _Note: This flow is kept for backwards compatibility only. Standard key sharing is done via Flow B (RSA-OAEP)._

---

## Key Provisioning Lifecycle

```mermaid
sequenceDiagram
    participant Owner/Admin as Admin Browser
    participant Server as NestJS Backend
    participant Member as Member Browser

    Note over Owner/Admin: Generates Group Key (GKey)
    Owner/Admin->>Server: Uploads GKey (wrapped with Admin Master Key)
    Note over Member: Registers & generates RSA keypair
    Member->>Server: Uploads RSA Public Key
    Owner/Admin->>Server: Queries /groups/:id/keys/missing
    Server-->>Owner/Admin: Returns missing member user IDs
    Note over Owner/Admin: Fetches member RSA public key
    Owner/Admin->>Server: Uploads GKey (wrapped with Member RSA Public Key)
    Note over Member: Member enters group detail page
    Member->>Server: Fetches GKey from /groups/:id/keys/me
    Note over Member: Unwraps GKey using private RSA key
    Note over Member: Re-wraps GKey using Member Master Key
    Member->>Server: Uploads GKey (wrapped with Member Master Key)
    Note over Member: Caches GKey in IndexedDB
```

---

---

## Cache Precedence & Hierarchy

To provide high performance, offline functionality, and seamless decryption across routing, group keys are cached and loaded using a strict three-tier precedence model:

1. **Memory Cache (Tier 1):** Checked first. In-memory storage inside `GroupKeyService` and `ClientEncryptionService` returns the `CryptoKey` handle instantly (sub-millisecond) for active views.
2. **IndexedDB Vault (Tier 2):** Checked if the memory cache misses. The service loads the unwrapped `CryptoKey` (stored securely with `extractable: false`) from IndexedDB, caches it to memory, and returns it.
3. **Backend (Tier 3):** Checked if local caches miss. The client fetches the wrapped key from the backend (`GET /groups/:groupId/keys/me`). The wrapped key is decrypted client-side (using the user's master key or private wrapping key), written to both memory and IndexedDB caches, and the key-missing banner is automatically cleared.

---

## Recovery & Self-Healing

To keep keys updated and handle cases where members are invited while offline or before their public keys are generated:

1. **Self-Healing on Admin Load**:
   Whenever an owner or admin of a group loads the Group Detail page, the application automatically runs a background task (`checkAndProvisionMissingKeys`):
   - Queries the backend for members who lack a wrapped group key.
   - Fetches their public wrapping keys, encrypts the group key for them, and uploads the wrapped keys to the server.
2. **Manual Key Refresh**:
   If a member loads the group page and their key is not yet provisioned, the UI displays a warning banner. Clicking the **Refresh Group Key** button clears local session key caches and re-fetches the key status from the server to check if an admin has provisioned it since their last load.

---

## Troubleshooting Guide

### Issue: Banners show "Encryption key missing for this group"

- **Cause**: The group key has not been wrapped for your account yet (common if you were added to the group while the admin was offline).
- **Solution**:
  1. Ask the group owner or any admin to log in and open the Group Detail page.
  2. Once they do, click the **Check for Key** button on your warning banner to synchronize.

### Issue: Expenses show "Expense unavailable" with a lock icon

- **Cause**: Decryption failed. This happens if the local group key is missing, or if the expense was encrypted with a different key version that you don't possess.
- **Solution**:
  1. Verify your password by unlocking the vault if prompted.
  2. Trigger **Refresh Group Key** to ensure you have the latest active group key version.
  3. If key rotation has occurred, ensure an admin has visited the page to provision the rotated keys for your account.
