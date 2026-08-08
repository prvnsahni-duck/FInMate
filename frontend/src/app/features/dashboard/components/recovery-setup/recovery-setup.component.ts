import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../../core/auth/auth.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { generateRecoveryCode } from '../../../../core/services/recovery-code.util';

type Phase = 'loading' | 'view' | 'reveal' | 'saving';

/**
 * Account-recovery setup: generates a recovery code, wraps the user's private
 * wrapping key under it (zero-knowledge), and stores the resulting blob so the
 * forgot-password flow can restore encrypted data. The plaintext code is shown
 * exactly once, here — it is never sent to the server and cannot be recovered
 * later, so the user must save it before confirming.
 */
@Component({
  selector: 'app-recovery-setup',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './recovery-setup.component.html',
})
export class RecoverySetupComponent implements OnInit {
  private authService = inject(AuthService);
  private groupKeyService = inject(GroupKeyService);

  readonly phase = signal<Phase>('loading');
  readonly hasRecoveryKey = signal(false);
  readonly createdAt = signal<string | null>(null);
  readonly generatedCode = signal('');
  readonly copied = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    this.loadStatus();
  }

  private loadStatus(): void {
    this.authService.getRecoveryKeyStatus().subscribe({
      next: (res) => {
        this.hasRecoveryKey.set(res.hasRecoveryKey);
        this.createdAt.set(res.recoveryKeyCreatedAt);
        this.phase.set('view');
      },
      error: () => {
        // Non-blocking: still allow setup even if status couldn't be read.
        this.phase.set('view');
      },
    });
  }

  /** Generates a fresh code and reveals it for the user to save. */
  startSetup(): void {
    this.error.set('');
    this.copied.set(false);
    this.generatedCode.set(generateRecoveryCode());
    this.phase.set('reveal');
  }

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.generatedCode());
      this.copied.set(true);
    } catch {
      // Clipboard may be unavailable; the code is still visible to copy manually.
    }
  }

  cancel(): void {
    this.generatedCode.set('');
    this.copied.set(false);
    this.error.set('');
    this.phase.set('view');
  }

  /**
   * Wraps the private key under the just-shown code and persists the blob.
   * Requires an unlocked crypto session (master key in memory/vault).
   */
  async confirmSaved(): Promise<void> {
    this.error.set('');
    this.phase.set('saving');
    try {
      const blob = await this.groupKeyService.generateRecoveryBlob(
        this.generatedCode(),
      );
      this.authService.setRecoveryKey(blob).subscribe({
        next: () => {
          this.generatedCode.set('');
          this.copied.set(false);
          this.hasRecoveryKey.set(true);
          this.createdAt.set(new Date().toISOString());
          this.phase.set('view');
        },
        error: (err) => {
          this.phase.set('reveal');
          this.error.set(
            err?.error?.message ||
              'Could not save your recovery code. Please try again.',
          );
        },
      });
    } catch (e: unknown) {
      this.phase.set('reveal');
      this.error.set(
        e instanceof Error && e.message.includes('Master')
          ? 'Your encryption session is locked. Unlock it, then try again.'
          : 'Could not protect your keys with a recovery code. Please try again.',
      );
    }
  }
}
