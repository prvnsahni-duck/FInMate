# Email / Notifications Contract

Source: [email/](../../backend/src/app/email/) · Audit: [notifications-audit.md](../audits/notifications-audit.md)

## Responsibilities (what exists)

- ✔ Send group-invite emails via Resend (falls back to console mock if unconfigured).

## Dead code / roadmap (do not assume working)

- 📋 `sendVerificationEmail`, `sendPasswordResetEmail` exist but are never called (no routes) — ties to AUTH-002.
- 📋 In-app notifications, push (Capacitor), WebSocket sync alerts, BullMQ queue — none implemented.

## Inputs

- Recipient(s), group name, inviter name, invite URL (+ `#inviteKeyHash` fragment).

## Outputs

- Sent email (or console log in mock mode).

## Dependencies

- Groups (invite trigger), Resend HTTP API.

## Must NEVER

- ❌ Include ZK-protected content (expense titles/notes) in any email payload.
- ❌ Send email from an unthrottled endpoint (see NOTIF-001).
- ❌ Put key material anywhere but the URL hash fragment.
- ❌ Fail silently in production when the provider is unconfigured without surfacing it.
