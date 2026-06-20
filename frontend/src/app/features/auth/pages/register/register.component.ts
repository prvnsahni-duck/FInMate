import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { Register } from '../../../../core/auth/auth.state';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { RegisterDto } from '@finmate/data-models';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SubmitButtonComponent],
  templateUrl: './register.component.html'
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);

  registerForm = this.fb.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [
      Validators.required, 
      Validators.minLength(8),
      Validators.pattern(/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
    ]]
  });

  isLoading = false;
  errorMessage = '';
  successMessage = '';

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
          this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
        }
      });
    }
  }
}
