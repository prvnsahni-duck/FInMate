import { Injectable, inject } from '@angular/core';
import { ClientEncryptionService } from './encryption.service';
import { CryptoSessionManager } from './crypto-session-manager.service';
import {
  ExpenseDecryptionMeta,
  DecryptionMeta,
  GroupKeyStatus,
  classifyDecryptionError,
  logDecryptionFailure,
} from '../models/decryption-state';

/**
 * Shape of an expense as it flows through decryption. The ciphertext is
 * preserved in `encryptedTitle` / `encryptedDescription` so a failed item can
 * be retried later (once keys arrive) with no server round-trip.
 */
export interface DecryptableExpense {
  id?: string;
  title?: string | null;
  description?: string | null;
  encryptedTitle?: string | null;
  encryptedDescription?: string | null;
  encryptionScope?: 'personal' | 'group' | 'direct_shared';
  groupId?: string;
  groupKeyVersionId?: string;
  wrappedContentKeys?: Array<{ userId: string; wrappedKey: string }>;
  decryption?: ExpenseDecryptionMeta;
}

const DECRYPTION_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function looksEncrypted(expense: DecryptableExpense): boolean {
  const cipher = expense.encryptedTitle ?? expense.title;
  return (
    expense.encryptionScope === 'group' ||
    expense.encryptionScope === 'direct_shared' ||
    (expense.encryptionScope === 'personal' &&
      typeof cipher === 'string' &&
      cipher.includes(':')) ||
    (typeof cipher === 'string' && cipher.includes(':'))
  );
}

/**
 * The single decryption pipeline for expense titles/descriptions.
 *
 * Every flow (group ledger, dashboard, create/update/restore, recurring)
 * decrypts through here. Responsibilities:
 *   - resolve the correct key for the expense's scope,
 *   - preserve ciphertext so items can be retried,
 *   - funnel every failure through the central classifier, and
 *   - annotate each expense with a `decryption` state.
 *
 * It performs NO retrying or provisioning itself — that orchestration lives in
 * `ExpenseDecryptCoordinator`. This keeps the pipeline pure and idempotent:
 * calling it again on an already-processed list re-attempts from the preserved
 * ciphertext.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseDecryptionService {
  private encryption = inject(ClientEncryptionService);
  private cryptoSession = inject(CryptoSessionManager);

  /** Decrypt a single expense in place (returns a new annotated copy). */
  async decryptExpense<T extends DecryptableExpense>(expense: T): Promise<T> {
    // Not encrypted (e.g. legacy plaintext) — nothing to do.
    if (!looksEncrypted(expense)) {
      return { ...expense, decryption: DecryptionMeta.success() } as T;
    }

    let context: Awaited<
      ReturnType<CryptoSessionManager['ensureCryptoContext']>
    >;
    try {
      context = await this.cryptoSession.ensureCryptoContext('expense_decrypt');
    } catch {
      return this.fail(expense, { sessionReady: false }, 'no_session');
    }

    // Preserve ciphertext exactly once, so repeated passes are idempotent.
    const cipherTitle = expense.encryptedTitle ?? (expense.title as string);
    const cipherDescription =
      expense.encryptedDescription ??
      (expense.description as string | undefined);

    const scope = expense.encryptionScope || 'personal';
    // Key resolution can reject (transient session/network error, group-key
    // lookup failure). Guard it so a failure is classified and annotated like
    // any other — never thrown. An unguarded throw here rejects the whole
    // decryptExpenses() batch, which surfaces as a failed save (the server
    // already persisted the record) or an empty list, rather than a per-item
    // placeholder the coordinator can retry.
    let key: CryptoKey | null;
    let keyStatus: GroupKeyStatus | undefined;
    try {
      ({ key, keyStatus } = await this.resolveKey(expense, context));
    } catch (keyError) {
      return this.fail(
        {
          ...expense,
          encryptedTitle: cipherTitle,
          encryptedDescription: cipherDescription,
        },
        {
          scope,
          expenseId: expense.id,
          groupId: expense.groupId,
          decryptError: keyError,
        },
        'error',
      );
    }

    if (!key) {
      return this.fail(
        {
          ...expense,
          encryptedTitle: cipherTitle,
          encryptedDescription: cipherDescription,
        },
        { keyStatus, scope, expenseId: expense.id, groupId: expense.groupId },
        keyStatus ?? 'error',
      );
    }

    // Key is ready — attempt the actual decryption.
    try {
      this.cryptoSession.assertCurrentEpoch(context.epoch);
      const decrypted = await this.encryption.decryptExpense(
        { title: cipherTitle, description: cipherDescription },
        key,
      );
      this.cryptoSession.assertCurrentEpoch(context.epoch);
      return {
        ...expense,
        title: decrypted.title,
        description: decrypted.description,
        encryptedTitle: cipherTitle,
        encryptedDescription: cipherDescription,
        decryption: DecryptionMeta.success(),
      } as T;
    } catch (decryptError) {
      return this.fail(
        {
          ...expense,
          encryptedTitle: cipherTitle,
          encryptedDescription: cipherDescription,
        },
        {
          keyStatus: 'ready',
          decryptError,
          scope,
          expenseId: expense.id,
          groupId: expense.groupId,
        },
        'decrypt_error',
      );
    }
  }

  /** Decrypt a list, yielding to the browser between batches to avoid jank. */
  async decryptExpenses<T extends DecryptableExpense>(
    expenses: T[],
  ): Promise<T[]> {
    if (!expenses || expenses.length === 0) {
      return expenses;
    }
    const out: T[] = [];
    for (let i = 0; i < expenses.length; i += DECRYPTION_BATCH_SIZE) {
      const batch = expenses.slice(i, i + DECRYPTION_BATCH_SIZE);
      const decrypted = await Promise.all(
        batch.map((e) => this.decryptExpense(e)),
      );
      out.push(...decrypted);
      if (i + DECRYPTION_BATCH_SIZE < expenses.length) {
        await yieldToBrowser();
      }
    }
    return out;
  }

  /**
   * Public: resolve the scope key for an expense (group / direct_shared /
   * personal) with a classified status. Shared with non-title flows such as
   * attachment download so they don't re-implement key resolution.
   */
  async resolveExpenseKey(
    expense: DecryptableExpense,
  ): Promise<{ key: CryptoKey | null; keyStatus: GroupKeyStatus }> {
    try {
      const context = await this.cryptoSession.ensureCryptoContext(
        'expense_key_resolve',
      );
      return this.resolveKey(expense, context);
    } catch {
      return { key: null, keyStatus: 'no_session' };
    }
  }

  /** Resolve the decryption key for an expense's scope, with a status. */
  private async resolveKey(
    expense: DecryptableExpense,
    context: Awaited<ReturnType<CryptoSessionManager['ensureCryptoContext']>>,
  ): Promise<{ key: CryptoKey | null; keyStatus: GroupKeyStatus }> {
    const scope = expense.encryptionScope || 'personal';

    if (scope === 'group' && expense.groupId) {
      const result = await this.cryptoSession.ensureGroupKey(
        expense.groupId,
        'read',
        expense.groupKeyVersionId,
      );
      return result.status === 'ready'
        ? { key: result.key, keyStatus: 'ready' }
        : { key: null, keyStatus: result.status };
    }

    if (scope === 'direct_shared') {
      const myWrapped = (expense.wrappedContentKeys || []).find(
        (wk) => wk.userId === context.user.userId,
      );
      if (!myWrapped) {
        return { key: null, keyStatus: 'no_access' };
      }
      const masterKey = context.masterKey;
      try {
        const key = await this.encryption.unwrapKey(
          myWrapped.wrappedKey,
          masterKey,
        );
        return { key, keyStatus: 'ready' };
      } catch (e) {
        logDecryptionFailure('direct_shared_unwrap_failed', {
          expenseId: expense.id,
          error: e,
        });
        return { key: null, keyStatus: 'error' };
      }
    }

    // personal
    return { key: context.masterKey, keyStatus: 'ready' };
  }

  /** Classify a failure, log it once, and annotate the expense. */
  private fail<T extends DecryptableExpense>(
    expense: T,
    ctx: Parameters<typeof classifyDecryptionError>[0],
    reason: string,
  ): T {
    const meta = classifyDecryptionError(ctx);
    logDecryptionFailure(reason, {
      expenseId: ctx.expenseId,
      groupId: ctx.groupId,
      scope: ctx.scope,
      keyStatus: ctx.keyStatus,
      state: meta.state,
      error: ctx.decryptError,
    });
    // NOT wired to cryptoSession.markFatal(): `category === 'permanent'` here
    // covers keyUnavailable() (an auth-tag failure), which is the expected,
    // routine signature of a record encrypted under a since-rotated group key
    // (KI-1) — not evidence of tampering. It fires today, per-item, for
    // ordinary old records. CryptoSessionManager.transition() makes Fatal
    // sticky app-wide (only NoSession/logout escapes it), so treating this as
    // fatal would brick every user's session on the first rotated-key record
    // they load. A real tamper/integrity signal (e.g. key-lineage/version
    // downgrade detection) needs to exist and be distinguished from routine
    // key unavailability before anything here calls markFatal().
    // Fallback display value: any template that just renders `title` still
    // shows a meaningful message rather than ciphertext or a blank.
    return {
      ...expense,
      title: meta.message,
      description: '',
      decryption: meta,
    } as T;
  }
}
