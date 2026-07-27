import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { Login } from '../../../../core/auth/auth.state';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import {
  EYE_ICON_PATH,
  EYE_OFF_ICON_PATH,
} from '../../../../core/constants/app.constants';
import { LoginDto } from '@finmate/data-models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SubmitButtonComponent, IconComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  isLoading = false;
  errorMessage = '';

  showPassword = false;

  // Eye / eye-off icon paths (shared with the register page).
  readonly eyeIconPath = EYE_ICON_PATH;
  readonly eyeOffIconPath = EYE_OFF_ICON_PATH;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

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
          this.router.navigate(['/dashboard']);
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
