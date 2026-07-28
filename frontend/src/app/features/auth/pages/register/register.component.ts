import { Component, inject } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { Register } from '../../../../core/auth/auth.state';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';
import { RegisterDto } from '@finmate/data-models';

/**
 * Group-level validator: confirmPassword must equal password.
 * Runs only once confirmPassword has a value so the error doesn't flash
 * before the user has typed anything into the second field.
 */
function passwordsMatchValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (confirm && password !== confirm) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SubmitButtonComponent,
    IconComponent,
    PasswordInputComponent,
  ],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);

  registerForm = this.fb.group(
    {
      displayName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(
            /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/,
          ),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  capsLockOn = false;

  /** Track Caps Lock so we can warn the user before they set a password they can't retype. */
  updateCapsLock(event: KeyboardEvent): void {
    if (typeof event.getModifierState === 'function') {
      this.capsLockOn = event.getModifierState('CapsLock');
    }
  }

  get passwordMismatch(): boolean {
    const confirm = this.registerForm.get('confirmPassword');
    return (
      this.registerForm.hasError('passwordMismatch') &&
      !!confirm &&
      (confirm.touched || confirm.dirty)
    );
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      const value = this.registerForm.getRawValue();
      const payload: RegisterDto = {
        displayName: value.displayName ?? undefined,
        email: value.email ?? '',
        password: value.password ?? '',
      };

      this.store.dispatch(new Register(payload)).subscribe({
        next: () => {
          this.isLoading = false;
          this.successMessage = 'Account created successfully! Please sign in.';
          setTimeout(() => {
            this.router.navigate(['/auth/login']);
          }, 2000);
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage =
            err.error?.message || 'Registration failed. Please try again.';
        },
      });
    }
  }
}
