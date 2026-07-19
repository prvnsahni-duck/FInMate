/**
 * User-facing error message constants for the Zero Knowledge encryption layer.
 *
 * IMPORTANT: All messages shown to the user MUST be non-technical.
 * Technical details should only be logged via console.error for debugging.
 * Each scenario has its own distinct message so the user gets contextual feedback.
 */

/** Replaces encrypted fields (title, description) when decryption fails. */
export const DECRYPTION_FAILED_PLACEHOLDER = 'Unable to display this item';

/** Shown when the ZK key is missing and encryption/decryption cannot proceed. */
export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please log in again.';

/** Shown when creating or updating an expense fails due to a server issue. */
export const SAVE_EXPENSE_FAILED_MESSAGE =
  'We could not save your expense. Please try again.';

/** Shown when loading expenses from the server fails. */
export const LOAD_EXPENSES_FAILED_MESSAGE =
  'We could not load your expenses. Please refresh the page.';

/** Shown when deleting or restoring an expense fails. */
export const DELETE_RESTORE_FAILED_MESSAGE =
  'We could not complete this action. Please try again.';

/** Shown when the secure storage on your device has an issue. */
export const VAULT_ERROR_MESSAGE =
  'There was a problem with your secure session. Please log in again.';

/** Shown when analytics data fails to load. */
export const ANALYTICS_FAILED_MESSAGE =
  'We could not load your analytics. Please try again later.';

/** Shown when file import/export fails. */
export const IMPORT_EXPORT_FAILED_MESSAGE =
  'We could not process your file. Please check the format and try again.';

/** Last resort fallback — only used when no specific message applies. */
export const UNEXPECTED_ERROR_MESSAGE =
  'An unexpected error occurred. Please try again later.';
