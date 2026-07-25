import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../auth/auth.state';
import { ClientEncryptionService } from './encryption.service';
import { GroupKeyService, GroupKeyResult } from './group-key.service';

export type CryptoSessionState =
  | 'NoSession'
  | 'Loading'
  | 'Ready'
  | 'Recovering'
  | 'RecoveringBlocked'
  | 'Fatal';

export interface CryptoContext {
  user: NonNullable<ReturnType<typeof AuthState.getUser>>;
  email: string;
  masterKey: CryptoKey;
  epoch: number;
}

export interface RecoveryScope {
  userId?: string;
  groupId?: string;
  operationType: string;
  failureClass: string;
  keyVersion?: string;
}

interface RecoveryEntry {
  attempts: number;
  updatedAt: number;
}

interface CryptoBroadcastEvent {
  type:
    | 'crypto-session-ready'
    | 'crypto-session-ended'
    | 'recovery-started'
    | 'recovery-completed'
    | 'recovery-blocked';
  epoch: number;
  reason?: string;
  reasonClass?: string;
}

export class CryptoSessionEndedError extends Error {
  constructor() {
    super('Crypto session ended before the operation completed');
    this.name = 'CryptoSessionEndedError';
  }
}

const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_SILENT_RECOVERY_ATTEMPTS = 2;

@Injectable({ providedIn: 'root' })
export class CryptoSessionManager {
  private store = inject(Store);
  private encryption = inject(ClientEncryptionService);
  private groupKeys = inject(GroupKeyService);

  private stateSignal = signal<CryptoSessionState>('NoSession');
  private epochSignal = signal(0);
  private fatalReasonSignal = signal<string | null>(null);
  private recoveryBlockedReasonSignal = signal<string | null>(null);
  private recoveryAttempts = new Map<string, RecoveryEntry>();
  private inFlightRecoveries = new Map<string, Promise<CryptoSessionState>>();
  private channel: BroadcastChannel | null = this.createBroadcastChannel();

  readonly state = this.stateSignal.asReadonly();
  readonly epoch = this.epochSignal.asReadonly();
  readonly isReady = computed(() => this.stateSignal() === 'Ready');
  readonly fatalReason = this.fatalReasonSignal.asReadonly();
  readonly recoveryBlockedReason =
    this.recoveryBlockedReasonSignal.asReadonly();

  async ensureCryptoContext(operationType = 'crypto'): Promise<CryptoContext> {
    const epoch = this.epochSignal();
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;

    if (!user || !email) {
      this.transition('NoSession');
      throw new Error('No crypto session is available');
    }

    this.transition(this.stateSignal() === 'Ready' ? 'Ready' : 'Loading');

    const masterKey = await this.encryption.loadKeyFromSession(email);
    this.assertCurrentEpoch(epoch);

    if (!masterKey) {
      await this.handleRecoverableFailure({
        userId: user.userId,
        operationType,
        failureClass: 'no_master_key',
      });
      throw new Error('Secure session is not ready');
    }

    this.fatalReasonSignal.set(null);
    this.recoveryBlockedReasonSignal.set(null);
    this.transition('Ready');
    this.broadcast({ type: 'crypto-session-ready', epoch });

    return { user, email, masterKey, epoch };
  }

  async ensureGroupKey(
    groupId: string,
    purpose: 'read' | 'write',
    groupKeyVersionId?: string,
  ): Promise<GroupKeyResult> {
    const ctx = await this.ensureCryptoContext(`group_key_${purpose}`);
    const result =
      purpose === 'write'
        ? await this.resolveWriteGroupKey(groupId)
        : await this.groupKeys.resolveGroupKey(groupId, groupKeyVersionId);

    this.assertCurrentEpoch(ctx.epoch);

    if (result.status !== 'ready') {
      await this.handleRecoverableFailure({
        userId: ctx.user.userId,
        groupId,
        operationType: `group_key_${purpose}`,
        failureClass: result.status,
        keyVersion: groupKeyVersionId,
      });
    }

    return result;
  }

  /**
   * getGroupKeyForEncryption() is a cache-optimized fast path that collapses
   * every failure reason to `null` — it can't distinguish "key genuinely not
   * minted yet" from "no_access"/"no_session"/"rate_limited"/"error". On the
   * fast path's failure we fall back to resolveGroupKey() to recover the real
   * classified status, so recovery/escalation and caller-facing messages stay
   * accurate instead of collapsing everything to a generic 'pending'.
   */
  private async resolveWriteGroupKey(groupId: string): Promise<GroupKeyResult> {
    const ready = await this.groupKeys.getGroupKeyForEncryption(groupId);
    if (ready) {
      return { status: 'ready', key: ready.key, versionId: ready.versionId };
    }
    return this.groupKeys.resolveGroupKey(groupId);
  }

  assertCurrentEpoch(epoch: number): void {
    if (epoch !== this.epochSignal()) {
      throw new CryptoSessionEndedError();
    }
  }

  beginLogout(): void {
    const nextEpoch = this.epochSignal() + 1;
    this.epochSignal.set(nextEpoch);
    this.inFlightRecoveries.clear();
    this.recoveryAttempts.clear();
    this.fatalReasonSignal.set(null);
    this.recoveryBlockedReasonSignal.set(null);
    this.transition('NoSession');
    this.broadcast({ type: 'crypto-session-ended', epoch: nextEpoch });
  }

  markFatal(reason: string): void {
    this.fatalReasonSignal.set(reason);
    this.transition('Fatal');
  }

  async handleRecoverableFailure(
    scope: RecoveryScope,
  ): Promise<CryptoSessionState> {
    if (this.stateSignal() === 'Fatal') {
      return 'Fatal';
    }

    const key = this.scopeKey(scope);
    const now = Date.now();
    const current = this.recoveryAttempts.get(key);
    const attempts =
      current && now - current.updatedAt <= RECOVERY_WINDOW_MS
        ? current.attempts + 1
        : 1;

    this.recoveryAttempts.set(key, { attempts, updatedAt: now });

    if (attempts > MAX_SILENT_RECOVERY_ATTEMPTS) {
      const reason = `${scope.operationType}:${scope.failureClass}`;
      this.recoveryBlockedReasonSignal.set(reason);
      this.transition('RecoveringBlocked');
      this.broadcast({
        type: 'recovery-blocked',
        epoch: this.epochSignal(),
        reasonClass: scope.failureClass,
      });
      return 'RecoveringBlocked';
    }

    const recoveryKey = `${this.epochSignal()}:${key}`;
    const existing = this.inFlightRecoveries.get(recoveryKey);
    if (existing) {
      return existing;
    }

    const recovery = this.runIdempotentRecovery(scope, recoveryKey);
    this.inFlightRecoveries.set(recoveryKey, recovery);
    try {
      return await recovery;
    } finally {
      this.inFlightRecoveries.delete(recoveryKey);
    }
  }

  private async runIdempotentRecovery(
    scope: RecoveryScope,
    recoveryKey: string,
  ): Promise<CryptoSessionState> {
    const epoch = this.epochSignal();
    this.transition('Recovering');
    this.broadcast({
      type: 'recovery-started',
      epoch,
      reason: `${scope.operationType}:${scope.failureClass}`,
    });

    await Promise.resolve();

    if (!recoveryKey.startsWith(`${this.epochSignal()}:`)) {
      return this.stateSignal();
    }

    if (scope.failureClass === 'no_master_key') {
      this.transition('NoSession');
      return 'NoSession';
    }

    return this.stateSignal();
  }

  private transition(next: CryptoSessionState): void {
    const current = this.stateSignal();
    if (current === 'Fatal' && next !== 'NoSession') {
      return;
    }
    this.stateSignal.set(next);
  }

  private scopeKey(scope: RecoveryScope): string {
    return [
      scope.userId ?? 'anonymous',
      scope.groupId ?? 'global',
      scope.operationType,
      scope.failureClass,
      scope.keyVersion ?? 'active',
      this.epochSignal(),
    ].join('|');
  }

  private createBroadcastChannel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') {
      return null;
    }

    const channel = new BroadcastChannel('finmate-crypto-session');
    channel.onmessage = (event: MessageEvent<CryptoBroadcastEvent>) => {
      this.handleBroadcast(event.data);
    };
    return channel;
  }

  private broadcast(event: CryptoBroadcastEvent): void {
    this.channel?.postMessage(event);
  }

  private handleBroadcast(event: CryptoBroadcastEvent): void {
    if (!event || event.epoch < this.epochSignal()) {
      return;
    }

    if (event.type === 'crypto-session-ended') {
      this.epochSignal.set(event.epoch);
      this.groupKeys.clearCache();
      this.transition('NoSession');
      return;
    }

    if (event.epoch > this.epochSignal()) {
      return;
    }

    if (event.type === 'recovery-blocked') {
      this.recoveryBlockedReasonSignal.set(event.reasonClass ?? null);
      this.transition('RecoveringBlocked');
    }
  }
}
