import { Injectable, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../auth/auth.state';
import { ClientEncryptionService } from './encryption.service';
import { GroupKeyService } from './group-key.service';
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
  private store = inject(Store);
  private encryption = inject(ClientEncryptionService);
  private groupKeys = inject(GroupKeyService);

  /** Decrypt a single expense in place (returns a new annotated copy). */
  async decryptExpense<T extends DecryptableExpense>(expense: T): Promise<T> {
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;

    // Not encrypted (e.g. legacy plaintext) — nothing to do.
    if (!looksEncrypted(expense)) {
      return { ...expense, decryption: DecryptionMeta.success() } as T;
    }

    if (!email) {
      return this.fail(expense, { sessionReady: false }, 'no_session');
    }

    // Preserve ciphertext exactly once, so repeated passes are idempotent.
    const cipherTitle = expense.encryptedTitle ?? (expense.title as string);
    const cipherDescription =
      expense.encryptedDescription ?? (expense.description as string | undefined);

    const scope = expense.encryptionScope || 'personal';
    const { key, keyStatus } = await this.resolveKey(expense, user, email);

    if (!key) {
      return this.fail(
        { ...expense, encryptedTitle: cipherTitle, encryptedDescription: cipherDescription },
        { keyStatus, scope, expenseId: expense.id, groupId: expense.groupId },
        keyStatus ?? 'error',
      );
    }

    // Key is ready — attempt the actual decryption.
    try {
      const decrypted = await this.encryption.decryptExpense(
        { title: cipherTitle, description: cipherDescription },
        key,
      );
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
        { ...expense, encryptedTitle: cipherTitle, encryptedDescription: cipherDescription },
        { keyStatus: 'ready', decryptError, scope, expenseId: expense.id, groupId: expense.groupId },
        'decrypt_error',
      );
    }
  }

  /** Decrypt a list, yielding to the browser between batches to avoid jank. */
  async decryptExpenses<T extends DecryptableExpense>(expenses: T[]): Promise<T[]> {
    if (!expenses || expenses.length === 0) {
      return expenses;
    }
    const out: T[] = [];
    for (let i = 0; i < expenses.length; i += DECRYPTION_BATCH_SIZE) {
      const batch = expenses.slice(i, i + DECRYPTION_BATCH_SIZE);
      const decrypted = await Promise.all(batch.map((e) => this.decryptExpense(e)));
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
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;
    if (!email) {
      return { key: null, keyStatus: 'no_session' };
    }
    return this.resolveKey(expense, user, email);
  }

  /** Resolve the decryption key for an expense's scope, with a status. */
  private async resolveKey(
    expense: DecryptableExpense,
    user: { userId?: string } | null,
    email: string,
  ): Promise<{ key: CryptoKey | null; keyStatus: GroupKeyStatus }> {
    const scope = expense.encryptionScope || 'personal';

    if (scope === 'group' && expense.groupId) {
      const result = await this.groupKeys.resolveGroupKey(
        expense.groupId,
        expense.groupKeyVersionId,
      );
      return result.status === 'ready'
        ? { key: result.key, keyStatus: 'ready' }
        : { key: null, keyStatus: result.status };
    }

    if (scope === 'direct_shared') {
      const myWrapped = (expense.wrappedContentKeys || []).find(
        (wk) => wk.userId === user?.userId,
      );
      if (!myWrapped) {
        return { key: null, keyStatus: 'no_access' };
      }
      const masterKey = await this.encryption.loadKeyFromSession(email);
      if (!masterKey) {
        return { key: null, keyStatus: 'no_session' };
      }
      try {
        const key = await this.encryption.unwrapKey(myWrapped.wrappedKey, masterKey);
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
    const masterKey = await this.encryption.loadKeyFromSession(email);
    return masterKey
      ? { key: masterKey, keyStatus: 'ready' }
      : { key: null, keyStatus: 'no_session' };
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
    // Fallback display value: any template that just renders `title` still
    // shows a meaningful message rather than ciphertext or a blank.
    return { ...expense, title: meta.message, description: '', decryption: meta } as T;
  }
}
