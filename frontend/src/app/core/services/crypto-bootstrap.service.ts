import { Injectable, inject } from '@angular/core';
import { Store, Actions, ofActionSuccessful } from '@ngxs/store';
import { AuthState, Login } from '../auth/auth.state';
import { GroupKeyService } from './group-key.service';
import { ClientEncryptionService } from './encryption.service';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class CryptoBootstrapService {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private groupKeyService = inject(GroupKeyService);
  private encryptionService = inject(ClientEncryptionService);
  private bootstrappedUserEmail: string | null = null;

  constructor() {
    // 1. Handle app initialization / page refresh (if already logged in)
    this.store
      .select(AuthState.getUser)
      .pipe(filter((user) => !!user && !!user.email))
      .subscribe((user) => {
        if (user && user.email && this.bootstrappedUserEmail !== user.email) {
          this.bootstrapUserKeys(user.email);
        }
      });

    // 2. Handle new login completions
    this.actions$.pipe(ofActionSuccessful(Login)).subscribe(() => {
      const user = this.store.selectSnapshot(AuthState.getUser);
      if (user && user.email) {
        this.bootstrapUserKeys(user.email);
      }
    });
  }

  private async bootstrapUserKeys(email: string) {
    this.bootstrappedUserEmail = email;
    try {
      console.debug(
        '[CryptoBootstrap] Ensuring user asymmetric keys exist for:',
        email,
      );
      // Wait for master key to load or be derived
      const masterKey = await this.encryptionService.loadKeyFromSession(email);
      if (!masterKey) {
        console.debug(
          '[CryptoBootstrap] Master key not derived/stored yet. Skipping bootstrap.',
        );
        this.bootstrappedUserEmail = null;
        return;
      }
      await this.groupKeyService.getMyAsymmetricKeys();
      console.debug('[CryptoBootstrap] Asymmetric keys verified successfully.');
    } catch (err) {
      console.error(
        '[CryptoBootstrap] Failed to bootstrap asymmetric keys:',
        err,
      );
      this.bootstrappedUserEmail = null; // Reset to allow retry on next event
    }
  }
}
