/**
 * Decryption state machine for group / shared expense titles.
 *
 * A single, centrally-classified representation of *why* an encrypted item can
 * or cannot currently be shown. This replaces the previous single generic
 * placeholder so the UI can give the user contextual, honest feedback and so
 * the app can decide whether automatic recovery is possible.
 *
 *   loading ─▶ waiting_for_keys ─▶ decrypting ─▶ success
 *                                             ├▶ recoverable  (auto-retries)
 *                                             ├▶ permanent    (no recovery)
 *                                             └▶ unexpected   (bug / unknown)
 */
export type DecryptionState =
  | 'loading'
  | 'waiting_for_keys'
  | 'decrypting'
  | 'success'
  | 'recoverable'
  | 'permanent'
  | 'unexpected';

/**
 * Coarse handling bucket for a state. Drives retry behaviour:
 * `temporary` and `recoverable` are retried automatically; `permanent` and
 * `unexpected` are terminal.
 */
export type DecryptionCategory =
  | 'ok'
  | 'temporary'
  | 'recoverable'
  | 'permanent'
  | 'unexpected';

export interface ExpenseDecryptionMeta {
  state: DecryptionState;
  category: DecryptionCategory;
  /** Non-technical, user-facing explanation. */
  message: string;
}

/**
 * User-facing messages. Each scenario is distinct so the user understands what
 * actually happened. Technical detail stays in console logs only.
 */
export const DECRYPTION_MESSAGES = {
  loading: 'Loading…',
  waitingForKeys: 'Waiting for group encryption keys…',
  retrying: 'Retrying decryption…',
  noAccess: 'You no longer have access to this expense.',
  keyUnavailable:
    'Unable to decrypt this expense because the required encryption key is unavailable.',
  corrupted: 'This expense cannot currently be decrypted.',
  session: 'Waiting for your secure session…',
  unexpected:
    'This expense could not be decrypted due to an unexpected error.',
} as const;

/** Factory helpers keep state + category + message consistent in one place. */
export const DecryptionMeta = {
  loading: (): ExpenseDecryptionMeta => ({
    state: 'loading',
    category: 'temporary',
    message: DECRYPTION_MESSAGES.loading,
  }),
  success: (): ExpenseDecryptionMeta => ({
    state: 'success',
    category: 'ok',
    message: '',
  }),
  waitingForKeys: (): ExpenseDecryptionMeta => ({
    state: 'waiting_for_keys',
    category: 'temporary',
    message: DECRYPTION_MESSAGES.waitingForKeys,
  }),
  decrypting: (): ExpenseDecryptionMeta => ({
    state: 'decrypting',
    category: 'recoverable',
    message: DECRYPTION_MESSAGES.retrying,
  }),
  rateLimited: (): ExpenseDecryptionMeta => ({
    state: 'recoverable',
    category: 'recoverable',
    message: DECRYPTION_MESSAGES.retrying,
  }),
  session: (): ExpenseDecryptionMeta => ({
    state: 'recoverable',
    category: 'recoverable',
    message: DECRYPTION_MESSAGES.session,
  }),
  noAccess: (): ExpenseDecryptionMeta => ({
    state: 'permanent',
    category: 'permanent',
    message: DECRYPTION_MESSAGES.noAccess,
  }),
  keyUnavailable: (): ExpenseDecryptionMeta => ({
    state: 'permanent',
    category: 'permanent',
    message: DECRYPTION_MESSAGES.keyUnavailable,
  }),
  corrupted: (): ExpenseDecryptionMeta => ({
    state: 'permanent',
    category: 'permanent',
    message: DECRYPTION_MESSAGES.corrupted,
  }),
  unexpected: (): ExpenseDecryptionMeta => ({
    state: 'unexpected',
    category: 'unexpected',
    message: DECRYPTION_MESSAGES.unexpected,
  }),
};

/** Whether an item in this state should be retried automatically. */
export function isRetryable(meta: ExpenseDecryptionMeta | undefined): boolean {
  return meta?.category === 'temporary' || meta?.category === 'recoverable';
}

/** Whether an item has reached a terminal (non-recoverable) state. */
export function isTerminal(meta: ExpenseDecryptionMeta | undefined): boolean {
  return meta?.category === 'permanent' || meta?.category === 'unexpected';
}

// ─── Central error classification ──────────────────────────────────────────

/**
 * Classified reason a group data key could not be resolved. Produced by
 * `GroupKeyService.resolveGroupKey` (the single source of truth for key
 * availability) and consumed by the classifier below.
 */
export type GroupKeyStatus =
  | 'ready'
  | 'pending' // not provisioned yet — temporary, auto-recoverable
  | 'no_access' // membership revoked — permanent
  | 'rate_limited' // 429 — recoverable
  | 'no_session' // master key / session not ready — recoverable
  | 'error'; // unexpected

/**
 * Everything the classifier needs to decide *why* an item cannot be shown.
 * Passing structured context (rather than only "decrypt() threw") is what lets
 * a single function distinguish waiting-for-keys vs no-access vs corrupted.
 */
export interface DecryptionErrorContext {
  /** Result of resolving the decryption key, when a key was needed. */
  keyStatus?: GroupKeyStatus;
  /** False when the user session / master key is not yet available. */
  sessionReady?: boolean;
  /** Exception thrown by the actual AES-GCM decrypt / format parsing, if any. */
  decryptError?: unknown;
  /** Diagnostic-only fields (never shown to the user). */
  scope?: string;
  expenseId?: string;
  groupId?: string;
}

function messageOf(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message || error.name || '';
  if (typeof error === 'string') return error;
  return String((error as { message?: unknown })?.message ?? '');
}

/** Malformed metadata: the stored value isn't a valid `iv:ciphertext` string. */
function isMalformedCiphertext(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    msg.includes('Invalid ciphertext format') ||
    msg.includes('Invalid wrapped key format') ||
    msg.includes('Wrapped key string cannot be empty')
  );
}

/**
 * AES-GCM authentication-tag failure: wrong key or corrupted payload. Web
 * Crypto surfaces this as a DOMException named `OperationError`.
 */
function isAuthTagFailure(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'OperationError';
  }
  const name = (error as { name?: string })?.name;
  return name === 'OperationError';
}

/**
 * THE single classifier. Every decryption pipeline funnels its outcome through
 * here, so the mapping from low-level signal → user-facing state lives in one
 * place instead of being scattered across services and components.
 */
export function classifyDecryptionError(
  ctx: DecryptionErrorContext,
): ExpenseDecryptionMeta {
  // 1. Session must exist before anything can be decrypted.
  if (ctx.sessionReady === false) {
    return DecryptionMeta.session();
  }

  // 2. Key-availability signals — we may not even have attempted decryption.
  switch (ctx.keyStatus) {
    case 'pending':
      return DecryptionMeta.waitingForKeys();
    case 'no_access':
      return DecryptionMeta.noAccess();
    case 'rate_limited':
      return DecryptionMeta.rateLimited();
    case 'no_session':
      return DecryptionMeta.session();
    case 'error':
      return DecryptionMeta.unexpected();
    case 'ready':
    case undefined:
      break; // key was available (or not needed) — inspect the decrypt error
  }

  // 3. A decrypt was attempted with a valid key but failed.
  if (ctx.decryptError) {
    if (isMalformedCiphertext(ctx.decryptError)) {
      return DecryptionMeta.corrupted();
    }
    if (isAuthTagFailure(ctx.decryptError)) {
      // Right version was requested yet the tag failed → key genuinely can't
      // open this payload (wrong/rotated key or corruption). Not recoverable.
      return DecryptionMeta.keyUnavailable();
    }
    return DecryptionMeta.unexpected();
  }

  // 4. No key and no error reported — treat as still waiting.
  return DecryptionMeta.waitingForKeys();
}

// ─── Retry policy ────────────────────────────────────────────────────────

/** Hard ceiling on automatic decrypt attempts — prevents retry storms. */
export const MAX_DECRYPTION_ATTEMPTS = 4;

/** Backoff (ms) between automatic retries; last value repeats if exceeded. */
export const DECRYPTION_RETRY_BACKOFF_MS = [1500, 3000, 6000];

/**
 * Single retry-policy decision. An item is retried only while it is in a
 * temporary/recoverable state AND the attempt budget is not exhausted.
 */
export function shouldRetry(
  meta: ExpenseDecryptionMeta | undefined,
  attempts: number,
  max: number = MAX_DECRYPTION_ATTEMPTS,
): boolean {
  return isRetryable(meta) && attempts < max;
}

/** Backoff delay for the given (zero-based) attempt number. */
export function retryDelayMs(attempt: number): number {
  const idx = Math.min(attempt, DECRYPTION_RETRY_BACKOFF_MS.length - 1);
  return DECRYPTION_RETRY_BACKOFF_MS[idx];
}

// ─── Structured logging ────────────────────────────────────────────────────

/**
 * Single structured logging entry point for decryption problems. Keeps a
 * consistent, greppable shape and a natural place to later forward to a
 * telemetry sink. Never logs plaintext or key material.
 */
export function logDecryptionFailure(
  reason: string,
  context: Record<string, unknown> = {},
): void {
  console.error('[decryption]', reason, {
    ...context,
    // Guard against accidentally logging sensitive values.
    title: undefined,
    description: undefined,
    plaintext: undefined,
    key: undefined,
  });
}
