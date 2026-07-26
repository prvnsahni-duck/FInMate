import { Component, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { CryptoSessionManager } from '../../../core/services/crypto-session-manager.service';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { AuthState, Logout } from '../../../core/auth/auth.state';

/**
 * The single, app-wide crypto recovery experience. Every encrypted feature
 * (Group Detail, Create Expense, Group Members invite, and any future
 * encrypted screen) renders this component instead of inventing its own
 * password prompt. It is entirely self-contained — drop it in anywhere and
 * it reacts to CryptoSessionManager's existing session state (NoSession /
 * Loading / Recovering / RecoveringBlocked / Ready / Fatal) with no inputs
 * required and no new crypto state introduced.
 *
 * Scope: this panel is about the *master key / crypto session* being
 * unavailable — not about a specific group's key being unshared/pending,
 * which is a different, per-group concern with its own existing messaging
 * (see create-expense-modal's scopeKeyMessage for 'pending'/'no_access').
 */
@Component({
  selector: 'app-crypto-recovery-panel',
  standalone: true,
  imports: [],
  templateUrl: './crypto-recovery-panel.component.html',
})
export class CryptoRecoveryPanelComponent {
  private cryptoSession = inject(CryptoSessionManager);
  private encryptionService = inject(ClientEncryptionService);
  private store = inject(Store);

  readonly state = this.cryptoSession.state;
  readonly fatalReason = this.cryptoSession.fatalReason;
  readonly recoveryBlockedReason = this.cryptoSession.recoveryBlockedReason;

  /**
   * Only one unlock method exists today. Kept as an explicit discriminator
   * — rather than the template hard-coding "password" throughout — so a
   * future method (PIN, biometric/WebAuthn) is a new case added here and in
   * the template's method-specific block, not a redesign of this panel.
   */
  readonly unlockMethod = signal<'password'>('password');

  readonly credential = signal('');
  readonly isBusy = signal(false);
  readonly actionError = signal<string | null>(null);

  /** Nothing to show once the session is genuinely ready. */
  readonly visible = computed(() => this.state() !== 'Ready');

  /** Transient, non-actionable states — informational only, no buttons. */
  readonly isTransient = computed(
    () => this.state() === 'Loading' || this.state() === 'Recovering',
  );

  /** States where entering a credential can actually help. */
  readonly needsCredential = computed(
    () => this.state() === 'NoSession' || this.state() === 'RecoveringBlocked',
  );

  readonly isFatal = computed(() => this.state() === 'Fatal');

  readonly headline = computed(() => {
    switch (this.state()) {
      case 'Loading':
        return 'Restoring your session…';
      case 'Recovering':
        return 'Restoring access…';
      case 'RecoveringBlocked':
      case 'NoSession':
        return 'Unlock encrypted data';
      case 'Fatal':
        return 'Encrypted data needs your attention';
      default:
        return '';
    }
  });

  readonly description = computed(() => {
    switch (this.state()) {
      case 'Loading':
        return 'Checking this device for your encryption keys.';
      case 'Recovering':
        return 'Trying to restore access automatically — this only takes a moment.';
      case 'RecoveringBlocked':
        return 'Your account is still signed in, but this device needs your password to restore your encryption keys before encrypted information can be viewed. We tried automatically a couple of times without success.';
      case 'NoSession':
        return 'Your account is still signed in, but this device needs to restore your encryption keys before encrypted information can be viewed.';
      case 'Fatal':
        return "Something about this session's encrypted data couldn't be verified. Signing out and back in starts a fresh, verified session.";
      default:
        return '';
    }
  });

  async unlock(): Promise<void> {
    const password = this.credential();
    if (!password) return;

    this.isBusy.set(true);
    this.actionError.set(null);
    try {
      const user = this.store.selectSnapshot(AuthState.getUser);
      const email = user?.email;
      if (!email) {
        throw new Error('No signed-in user found.');
      }
      await this.encryptionService.deriveAndStoreKey(password, email);
      await this.cryptoSession.ensureCryptoContext('crypto_recovery_panel');
      this.credential.set('');
    } catch {
      this.actionError.set("Couldn't restore your session. Please try again.");
    } finally {
      this.isBusy.set(false);
    }
  }

  async retry(): Promise<void> {
    this.isBusy.set(true);
    this.actionError.set(null);
    try {
      await this.cryptoSession.ensureCryptoContext(
        'crypto_recovery_panel_retry',
      );
    } catch {
      this.actionError.set('Still unable to restore your session.');
    } finally {
      this.isBusy.set(false);
    }
  }

  signOut(): void {
    this.store.dispatch(new Logout());
  }
}
