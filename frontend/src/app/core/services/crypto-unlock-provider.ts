import { InjectionToken } from '@angular/core';

/**
 * Extension point for CryptoRecoveryPanelComponent's unlock action.
 *
 * Today exactly one provider is registered (PasswordUnlockProvider). Adding
 * a future method — PIN, biometric/WebAuthn, a platform-bound trusted-device
 * key — means implementing this interface and registering it as another
 * multi-provider (see app.config.ts), not redesigning the panel: the panel
 * already renders based on `inputType`/`label` rather than assuming
 * "password" anywhere in its own logic.
 *
 * `unlock(credential)` must leave the crypto session Ready on success (i.e.
 * it's responsible for calling CryptoSessionManager.ensureCryptoContext()
 * itself once its own recovery step succeeds) — the panel only surfaces
 * errors and busy state, it doesn't know how any given method works.
 */
export interface CryptoUnlockProvider {
  /** Stable identifier, e.g. 'password', 'pin', 'biometric'. */
  readonly id: string;

  /** Display label for this method, e.g. "Password". */
  readonly label: string;

  /**
   * What kind of input this method needs from the user:
   * - 'text-secret': a typed credential (password, PIN) passed to unlock().
   * - 'trigger-only': no typed input — unlock() is invoked directly from a
   *   button (e.g. a biometric/WebAuthn prompt handled entirely by the
   *   platform).
   */
  readonly inputType: 'text-secret' | 'trigger-only';

  /**
   * Performs this method's recovery step. `credential` is the typed value
   * for 'text-secret' providers; undefined for 'trigger-only' ones.
   * Throws on failure; the panel surfaces a generic error message either way
   * (this layer never learns *why* a credential was wrong, to avoid
   * building a password-guessing oracle into the UI).
   */
  unlock(credential?: string): Promise<void>;
}

/**
 * Multi-provider token. CryptoRecoveryPanelComponent injects the full list;
 * today it's always exactly one, but the panel doesn't assume that.
 */
export const CRYPTO_UNLOCK_PROVIDERS = new InjectionToken<
  CryptoUnlockProvider[]
>('CRYPTO_UNLOCK_PROVIDERS');
