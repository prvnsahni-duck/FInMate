import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { ExpenseDecryptionService, DecryptableExpense } from './expense-decryption.service';
import { GroupKeyService } from './group-key.service';
import {
  isRetryable,
  isTerminal,
  shouldRetry,
  retryDelayMs,
  logDecryptionFailure,
} from '../models/decryption-state';

export type CoordinatorPhase = 'idle' | 'loading' | 'recovering' | 'settled';

export interface DecryptionSummary {
  total: number;
  success: number;
  waiting: number; // temporary / recoverable — still resolving
  permanent: number; // no access / corrupted — will not recover
  unexpected: number;
  /** True once nothing is left in a retryable state. */
  settled: boolean;
}

export interface CoordinatorConfig {
  groupId: string;
  /** Caller's role in the group (owner/admin can mint & provision keys). */
  role: string;
  /** Current list to decrypt (ciphertext preserved on each item). */
  getExpenses: () => DecryptableExpense[];
  /** Publish the freshly decrypted list back to the view. */
  publish: (expenses: DecryptableExpense[]) => void;
}

/**
 * Owns the group-expense decryption lifecycle end to end:
 *
 *   loading → (key provisioning / self-heal) → decrypt → retry → success
 *
 * A component hands it the raw (encrypted) list and a publish callback; the
 * coordinator runs the single decryption pipeline, and — while any item is in a
 * temporary/recoverable state and the attempt budget allows — performs key
 * recovery (asymmetric key load, group-key resolve, owner/admin provisioning)
 * and re-decrypts from the preserved ciphertext with backoff. No component
 * implements retry or provisioning logic anymore.
 *
 * Only one session runs at a time; starting a new one cancels the previous, so
 * navigating between groups or re-fetching never leaves overlapping retry loops.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseDecryptCoordinator {
  private decryptor = inject(ExpenseDecryptionService);
  private groupKeys = inject(GroupKeyService);
  private store = inject(Store);

  /** Monotonic token; any loop whose token is stale must exit. */
  private session = 0;

  readonly phase = signal<CoordinatorPhase>('idle');
  readonly summary = signal<DecryptionSummary>({
    total: 0,
    success: 0,
    waiting: 0,
    permanent: 0,
    unexpected: 0,
    settled: true,
  });

  /** True while any item is still expected to resolve (drives "waiting" UI). */
  readonly isResolving = computed(
    () => this.phase() !== 'idle' && !this.summary().settled,
  );

  /**
   * Start (or restart) decryption + recovery for a group's current list.
   * Fire-and-forget; state is exposed via `phase` / `summary` signals.
   */
  start(config: CoordinatorConfig): void {
    const token = ++this.session;
    void this.run(config, token);
  }

  /** Cancel any in-flight session (e.g. on component destroy / navigation). */
  stop(): void {
    this.session++;
    this.phase.set('idle');
  }

  /**
   * Proactively ensure key material exists for a group, independent of any
   * expense list — used when opening a group so an owner/admin provisions
   * members' keys even before the first expense is decrypted.
   */
  async provision(groupId: string, role: string): Promise<void> {
    await this.recoverKeys({ groupId, role } as CoordinatorConfig, this.session);
  }

  private isCurrent(token: number): boolean {
    return token === this.session;
  }

  private async run(config: CoordinatorConfig, token: number): Promise<void> {
    this.phase.set('loading');
    let attempt = 0;

    // First pass: decrypt whatever we can immediately.
    await this.decryptPass(config, token);
    if (!this.isCurrent(token)) return;

    // Retry loop: recover keys, then re-decrypt, until settled or budget spent.
    while (this.isCurrent(token) && this.hasRetryable(config.getExpenses())) {
      const worst = this.worstRetryableMeta(config.getExpenses());
      if (!shouldRetry(worst, attempt)) {
        break;
      }

      this.phase.set('recovering');
      await this.recoverKeys(config, token);
      if (!this.isCurrent(token)) return;

      await this.sleep(retryDelayMs(attempt));
      if (!this.isCurrent(token)) return;

      await this.decryptPass(config, token);
      attempt++;
    }

    if (this.isCurrent(token)) {
      this.phase.set('settled');
    }
  }

  /** One decryption pass over the current list; publishes + updates summary. */
  private async decryptPass(config: CoordinatorConfig, token: number): Promise<void> {
    const source = config.getExpenses();
    const decrypted = await this.decryptor.decryptExpenses(source);
    if (!this.isCurrent(token)) return;
    config.publish(decrypted);
    this.summary.set(this.summarize(decrypted));
  }

  /**
   * Best-effort key recovery. Loads the caller's asymmetric keys, resolves the
   * group key, mints it if the caller is an owner/admin and none exists, and
   * provisions any members missing a wrapped key. All failures are logged and
   * swallowed — the next decrypt pass reflects whatever became available.
   */
  private async recoverKeys(config: CoordinatorConfig, token: number): Promise<void> {
    const { groupId, role } = config;
    try {
      await this.groupKeys.getMyAsymmetricKeys();
      if (!this.isCurrent(token)) return;

      const result = await this.groupKeys.resolveGroupKey(groupId);
      const canManageKeys = role === 'owner' || role === 'admin';

      if (result.status === 'pending' && canManageKeys) {
        // No key resolvable and we're allowed to manage keys → mint one.
        await this.groupKeys.createAndStoreGroupKey(groupId);
      }

      if (canManageKeys) {
        // Wrap the key for any members who don't have it yet.
        await this.groupKeys.checkAndProvisionMissingKeys(groupId);
      }
    } catch (error) {
      logDecryptionFailure('key_recovery_failed', { groupId, role, error });
    }
  }

  private hasRetryable(list: DecryptableExpense[]): boolean {
    return list.some((e) => isRetryable(e.decryption));
  }

  /** Pick the most-retryable meta so `shouldRetry` governs the whole batch. */
  private worstRetryableMeta(list: DecryptableExpense[]) {
    return list.map((e) => e.decryption).find((m) => isRetryable(m));
  }

  private summarize(list: DecryptableExpense[]): DecryptionSummary {
    let success = 0;
    let waiting = 0;
    let permanent = 0;
    let unexpected = 0;
    for (const e of list) {
      const meta = e.decryption;
      if (!meta || meta.state === 'success') success++;
      else if (isRetryable(meta)) waiting++;
      else if (meta.category === 'unexpected') unexpected++;
      else if (isTerminal(meta)) permanent++;
    }
    return {
      total: list.length,
      success,
      waiting,
      permanent,
      unexpected,
      settled: waiting === 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
