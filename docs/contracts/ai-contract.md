# AI Module Contract

Source: [ai/](../../backend/src/app/ai/) + frontend dashboard chatbot. Audit: [ai-audit.md](../audits/ai-audit.md)

## Responsibilities

- ✔ Proxy a user prompt + context instruction to the LLM provider (`POST /ai/proxy`).
- ✔ Redact UUIDs before egress.
- ✔ Never persist prompts/responses.

## Inputs

- User prompt + aggregate financial context (plaintext amounts by design).

## Outputs

- LLM response text (transient).

## Public APIs

- `ai.controller.ts`: `POST /ai/proxy`.

## Dependencies

- Dashboard analytics (context), external LLM provider.

## Must NEVER

- ❌ Send any user data before a **server-side-enforced, persisted** opt-in check (see AI-001).
- ❌ Forward ZK-protected plaintext (titles/notes) to the provider.
- ❌ Accept an unbounded user-controlled `model` or `systemInstruction` (prompt-injection / cost abuse — see AI-002).
- ❌ Persist prompts, responses, or receipts to the DB.
- ❌ Run without a dedicated rate limit / cost cap (see AI-003).
