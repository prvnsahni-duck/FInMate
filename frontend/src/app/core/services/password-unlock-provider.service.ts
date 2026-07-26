import { Injectable, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../auth/auth.state';
import { ClientEncryptionService } from './encryption.service';
import { CryptoSessionManager } from './crypto-session-manager.service';
import { CryptoUnlockProvider } from './crypto-unlock-provider';

/**
 * The only unlock method today. Everything this needs (derive the master
 * key from a password, re-establish the crypto session) already existed in
 * CryptoRecoveryPanelComponent before this phase — moved here unchanged so
 * "password" is one interchangeable provider, not logic baked into the
 * shared panel itself.
 */
@Injectable({ providedIn: 'root' })
export class PasswordUnlockProvider implements CryptoUnlockProvider {
  readonly id = 'password';
  readonly label = 'Password';
  readonly inputType = 'text-secret' as const;

  private encryptionService = inject(ClientEncryptionService);
  private cryptoSession = inject(CryptoSessionManager);
  private store = inject(Store);

  async unlock(credential?: string): Promise<void> {
    if (!credential) {
      throw new Error('Password is required.');
    }
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;
    if (!email) {
      throw new Error('No signed-in user found.');
    }
    await this.encryptionService.deriveAndStoreKey(credential, email);
    await this.cryptoSession.ensureCryptoContext('crypto_recovery_panel');
  }
}
