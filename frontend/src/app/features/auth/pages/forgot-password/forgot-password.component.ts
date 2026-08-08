import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';

/**
 * Forgot-password request page. Submits the email to the server, which sends a
 * reset link if the account exists. The UI always shows the same generic
 * confirmation regardless of outcome, so it never reveals whether an address is
 * registered (anti-enumeration).
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SubmitButtonComponent],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal('');

  forgotForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit(): void {
    if (this.forgotForm.invalid) {
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');

    const email = this.forgotForm.getRawValue().email ?? '';
    this.authService.requestPasswordReset(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.submitted.set(true);
      },
      error: () => {
        // Even on an unexpected error, avoid leaking anything actionable.
        this.isLoading.set(false);
        this.submitted.set(true);
      },
    });
  }
}
