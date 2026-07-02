import { Pipe, PipeTransform, inject } from '@angular/core';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { AuthState } from '../../../core/auth/auth.state';
import { SESSION_EXPIRED_MESSAGE } from '../../../core/constants/crypto.constants';
import { Store } from '@ngxs/store';

@Pipe({
  name: 'decrypt',
  pure: false,
})
export class DecryptPipe implements PipeTransform {
  private encryptionService = inject(ClientEncryptionService);
  private store = inject(Store);
  private keyPromise: Promise<CryptoKey | null> | null = null;

  private async getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      const user = this.store.selectSnapshot(AuthState.getUser);
      const email = user?.email;
      if (!email) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      this.keyPromise = this.encryptionService.loadKeyFromSession(email);
    }
    const key = await this.keyPromise;
    if (!key) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    return key;
  }

  async transform(ciphertext: string | null | undefined): Promise<string> {
    if (!ciphertext) {
      return '';
    }
    try {
      const key = await this.getKey();
      return await this.encryptionService.decrypt(ciphertext, key);
    } catch {
      // Return placeholder on failure
      return '••••••••••';
    }
  }
}
