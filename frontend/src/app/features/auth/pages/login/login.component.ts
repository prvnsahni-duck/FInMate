import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { Login } from '../../../../core/auth/auth.state';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';
import { LoginDto } from '@finmate/data-models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SubmitButtonComponent,
    PasswordInputComponent,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /**
   * Resolve where to go after login: the guard-supplied returnUrl when it is a
   * safe internal path, otherwise the dashboard. Rejecting `/auth/*` and
   * absolute URLs avoids open-redirects and bouncing back to Login.
   */
  private resolveReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (
      returnUrl &&
      returnUrl.startsWith('/') &&
      !returnUrl.startsWith('//') &&
      !returnUrl.startsWith('/auth')
    ) {
      return returnUrl;
    }
    return '/dashboard';
  }

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  isLoading = false;
  errorMessage = '';

  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      const value = this.loginForm.getRawValue();
      const payload: LoginDto = {
        email: value.email ?? '',
        password: value.password ?? '',
      };

      this.store.dispatch(new Login(payload)).subscribe({
        next: () => {
          // replaceUrl so the Back button cannot return to the Login screen.
          this.router.navigate([this.resolveReturnUrl()], { replaceUrl: true });
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage =
            err.error?.message || 'Login failed. Please try again.';
        },
      });
    }
  }
}
