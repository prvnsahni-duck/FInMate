import { Injectable, effect, inject } from '@angular/core';
import { CryptoSessionManager } from './crypto-session-manager.service';

/**
 * Resume-after-unlock for encrypted operations, without touching
 * CryptoSessionManager itself. Wraps any operation that might fail because
 * the crypto session isn't Ready: on failure, instead of rejecting
 * immediately, it holds the operation and re-runs it automatically the
 * moment CryptoSessionManager next reports Ready (e.g. the user unlocked
 * via <app-crypto-recovery-panel>, in this tab or another one).
 *
 * This is what makes "the user clicked Save, recovery was needed, unlocked,
 * and the save just completed" possible — the caller only ever sees one
 * promise that resolves once, however many recovery cycles it took.
 *
 * Concurrent callers queueing at the same time are exactly "queue concurrent
 * crypto requests, resume all waiting operations" — they all wait on the
 * same CryptoSessionManager.state, and the same Ready transition drains
 * every one of them together, in the order they queued.
 */
@Injectable({ providedIn: 'root' })
export class CryptoRecoveryQueueService {
  private cryptoSession = inject(CryptoSessionManager);
  private pending: Array<() => void> = [];

  constructor() {
    effect(() => {
      if (this.cryptoSession.isReady() && this.pending.length > 0) {
        this.drain();
      }
    });
  }

  /**
   * Runs `operation` once. If it throws, queueing depends on an *authoritative,
   * freshly-checked* read of the crypto session — not the cached `.state()`
   * signal, which can still be sitting at its default 'NoSession' simply
   * because nothing has exercised it yet in this tab, independent of
   * whether the master key is actually available right now. Calling
   * ensureCryptoContext() here forces a real check at the moment of
   * failure: if it succeeds, the session was never the problem (the
   * original error is something else — e.g. a group-key-specific
   * pending/no_access/rate_limited condition — and is re-thrown
   * unchanged). Only a genuine, current session failure is queued and
   * retried exactly once, automatically, as soon as the session becomes
   * Ready. If the retry fails again, that failure is surfaced as normal —
   * this never retries in a loop.
   */
  async runWithRecovery<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      const sessionIsActuallyOk = await this.cryptoSession
        .ensureCryptoContext('crypto_recovery_queue_check')
        .then(() => true)
        .catch(() => false);
      if (sessionIsActuallyOk) {
        throw err;
      }
      return new Promise<T>((resolve, reject) => {
        this.pending.push(() => {
          operation().then(resolve, reject);
        });
      });
    }
  }

  /** Number of operations currently waiting for recovery — for tests/telemetry. */
  get pendingCount(): number {
    return this.pending.length;
  }

  private drain(): void {
    const toRun = this.pending.splice(0, this.pending.length);
    for (const run of toRun) {
      run();
    }
  }
}
