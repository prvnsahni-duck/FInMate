import { Component, OnInit, inject, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';
import { normalizeRecoveryCode } from '../../../../core/services/recovery-code.util';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';

type ResetView = 'loading' | 'ready' | 'blocked' | 'invalid';

/**
 * Password reset via emailed token (zero-knowledge). The recovery code unwraps
 * the user's private wrapping key, which is then re-wrapped under the new
 * password's master key so encrypted data survives the reset. The server only
 * ever receives the re-wrapped ciphertext — never the recovery code, the
 * password-derived key, or any plaintext key material.
 *
 * When the account has no recovery key, reset is blocked with guidance: without
 * it there is no way to preserve encrypted data, and we never silently discard it.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SubmitButtonComponent,
    PasswordInputComponent,
  ],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private encryption = inject(ClientEncryptionService);

  readonly view = signal<ResetView>('loading');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  private token = '';
  private email = '';
  private recoveryWrappedKey = '';

  resetForm = this.fb.group(
    {
      recoveryCode: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [ResetPasswordComponent.passwordsMatch] },
  );

  private static passwordsMatch(
    group: AbstractControl,
  ): ValidationErrors | null {
    const pw = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.view.set('invalid');
      return;
    }

    this.authService.getResetContext(this.token).subscribe({
      next: (data) => {
        this.email = data.email;
        if (!data.hasRecoveryKey || !data.recoveryWrappedKey) {
          this.view.set('blocked');
          return;
        }
        this.recoveryWrappedKey = data.recoveryWrappedKey;
        this.view.set('ready');
      },
      error: () => {
        this.view.set('invalid');
      },
    });
  }

  async onSubmit(): Promise<void> {
    if (this.resetForm.invalid || this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const { recoveryCode, newPassword } = this.resetForm.getRawValue();

    let encryptedPrivateWrappingKey: string;
    try {
      // 1. Derive the recovery key from the code and unwrap the private key.
      //    A wrong code fails the AES-GCM auth tag here (caught below).
      const recoveryKey = await this.encryption.deriveMasterKey(
        normalizeRecoveryCode(recoveryCode ?? ''),
        this.email,
      );
      const privateKeyJwkStr = await this.encryption.decrypt(
        this.recoveryWrappedKey,
        recoveryKey,
      );

      // 2. Re-wrap the private key under the new password's master key.
      //    Use deriveMasterKey (not deriveAndStoreKey) — no session exists yet;
      //    the vault is populated on the subsequent login.
      const newMasterKey = await this.encryption.deriveMasterKey(
        newPassword ?? '',
        this.email,
      );
      encryptedPrivateWrappingKey = await this.encryption.encrypt(
        privateKeyJwkStr,
        newMasterKey,
      );
    } catch {
      this.isSubmitting.set(false);
      this.errorMessage.set(
        "That recovery code didn't match. Check it and try again.",
      );
      return;
    }

    this.authService
      .resetPassword({
        token: this.token,
        newPassword: newPassword ?? '',
        encryptedPrivateWrappingKey,
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/auth/login'], {
            replaceUrl: true,
            queryParams: { reset: 'success' },
          });
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            err?.error?.message ||
              'Could not reset your password. The link may have expired — request a new one.',
          );
        },
      });
  }
}
