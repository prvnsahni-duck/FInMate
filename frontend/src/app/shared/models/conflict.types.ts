/**
 * Shape of the 412 CON_VERSION_CONFLICT error response from the API.
 */
export interface ConflictErrorResponse {
  statusCode: 412;
  timestamp: string;
  path: string;
  errorCode: 'CON_VERSION_CONFLICT';
  message: string;
  retryable: boolean;
  details?: Array<{ field: string; issue: string }>;
}

/**
 * Snapshot of local vs. server state passed into the diff modal.
 * T is the resource shape (e.g. Expense, Note, Goal).
 */
export interface ConflictContext<T extends Record<string, unknown>> {
  /** The resource identifier extracted from the failing request URL. */
  resourceUrl: string;
  /** Fields the user was locally editing (keys modified in the PATCH body). */
  localPayload: Partial<T>;
  /** Latest server state fetched after the 412 was received. */
  serverState: T;
  /** The base snapshot version the local edit was built on. */
  localVersion: number;
  /** Names of the fields that overlap between local and server edits. */
  overlappingFields: string[];
}

/**
 * Discriminated union describing how the user chose to resolve the conflict.
 */
export type ConflictResolution<T extends Record<string, unknown>> =
  | { strategy: 'keep-mine';   mergedPayload: Partial<T>; newVersion: number }
  | { strategy: 'keep-theirs'; mergedPayload: Partial<T>; newVersion: number }
  | { strategy: 'manual';      mergedPayload: Partial<T>; newVersion: number }
  | { strategy: 'cancelled' };
