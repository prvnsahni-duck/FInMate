import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { PasswordInputComponent } from '../password-input/password-input.component';
import { CryptoSessionManager } from '../../../core/services/crypto-session-manager.service';
import { Logout } from '../../../core/auth/auth.state';
import { CryptoRecoveryVisibilityService } from '../../../core/services/crypto-recovery-visibility.service';
import {
  CRYPTO_UNLOCK_PROVIDERS,
  CryptoUnlockProvider,
} from '../../../core/services/crypto-unlock-provider';

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
 *
 * If several instances are mounted at once (e.g. this page's own panel plus
 * a modal's, opened on top of it), only the most-recently-mounted one
 * actually renders — see CryptoRecoveryVisibilityService — so a user only
 * ever sees one recovery prompt for one recovery event, not one per surface.
 *
 * The unlock action itself is delegated to whichever CryptoUnlockProvider(s)
 * are registered (today: password only) rather than hard-coded here, so a
 * future method plugs in via DI, not a redesign of this panel.
 */
@Component({
  selector: 'app-crypto-recovery-panel',
  standalone: true,
  imports: [FormsModule, PasswordInputComponent],
  templateUrl: './crypto-recovery-panel.component.html',
})
export class CryptoRecoveryPanelComponent {
  private cryptoSession = inject(CryptoSessionManager);
  private store = inject(Store);
  private visibilityService = inject(CryptoRecoveryVisibilityService);
  private providers = inject(CRYPTO_UNLOCK_PROVIDERS, { optional: true }) ?? [];

  private readonly instanceId = this.visibilityService.register();
  private readonly isTopmostInstance = this.visibilityService.isTopmost(
    this.instanceId,
  );

  readonly state = this.cryptoSession.state;
  readonly fatalReason = this.cryptoSession.fatalReason;
  readonly recoveryBlockedReason = this.cryptoSession.recoveryBlockedReason;

  /**
   * Every registered method, and the one currently selected. There's only
   * ever one today — user-facing method *selection* (e.g. "use PIN
   * instead") is future work, not something this phase needs since only one
   * provider is registered — but the panel already reads this generically
   * rather than assuming which provider it is.
   */
  readonly availableProviders: readonly CryptoUnlockProvider[] = this.providers;
  readonly activeProvider = signal<CryptoUnlockProvider | null>(
    this.providers[0] ?? null,
  );

  readonly credential = signal('');
  readonly isBusy = signal(false);
  readonly actionError = signal<string | null>(null);

  /** Nothing to show once the session is genuinely ready, or another mounted instance is topmost. */
  readonly visible = computed(
    () => this.state() !== 'Ready' && this.isTopmostInstance(),
  );

  /** Transient, non-actionable states — informational only, no buttons. */
  readonly isTransient = computed(
    () => this.state() === 'Loading' || this.state() === 'Recovering',
  );

  /** States where an unlock action can actually help. */
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

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.visibilityService.unregister(this.instanceId);
    });
  }

  async unlock(): Promise<void> {
    const provider = this.activeProvider();
    if (!provider) {
      this.actionError.set('No unlock method is available on this device.');
      return;
    }
    if (provider.inputType === 'text-secret' && !this.credential()) return;

    this.isBusy.set(true);
    this.actionError.set(null);
    try {
      await provider.unlock(
        provider.inputType === 'text-secret' ? this.credential() : undefined,
      );
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
