import { TestBed, ComponentFixture } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockStore: jest.Mocked<Store>;
  let router: Router;

  beforeEach(async () => {
    mockStore = {
      dispatch: jest.fn().mockReturnValue(of({})),
    } as any;

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [{ provide: Store, useValue: mockStore }, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate form fields', () => {
    expect(component.loginForm.valid).toBe(false);

    const emailControl = component.loginForm.controls['email'];
    const passwordControl = component.loginForm.controls['password'];

    emailControl.setValue('');
    passwordControl.setValue('');
    expect(emailControl.hasError('required')).toBe(true);
    expect(passwordControl.hasError('required')).toBe(true);

    emailControl.setValue('invalid-email');
    expect(emailControl.hasError('email')).toBe(true);

    emailControl.setValue('test@example.com');
    passwordControl.setValue('password123');
    expect(component.loginForm.valid).toBe(true);
  });

  it('should default to a hidden password and toggle visibility', () => {
    expect(component.showPassword).toBe(false);
    component.togglePassword();
    expect(component.showPassword).toBe(true);
    component.togglePassword();
    expect(component.showPassword).toBe(false);
  });

  it('should render a hidden password with accessible toggle + password-manager attributes by default', () => {
    fixture.detectChanges();
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="login-password-toggle"]',
    );
    const passwordInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#loginPassword');
    const emailInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#loginEmail');

    expect(passwordInput.getAttribute('type')).toBe('password');
    expect(toggle.getAttribute('type')).toBe('button'); // never submits the form
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(passwordInput.getAttribute('autocomplete')).toBe('current-password');
    expect(emailInput.getAttribute('autocomplete')).toBe('email');
  });

  it('should reveal the password and flip the toggle a11y state when showPassword is set', () => {
    // Set state before the only change-detection pass to reflect the toggled render.
    component.showPassword = true;
    fixture.detectChanges();
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="login-password-toggle"]',
    );
    const passwordInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#loginPassword');

    expect(passwordInput.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('should dispatch Login action and navigate to dashboard on successful onSubmit', () => {
    component.loginForm.controls['email'].setValue('test@example.com');
    component.loginForm.controls['password'].setValue('password123');

    component.onSubmit();

    expect(component.isLoading).toBe(true);
    expect(mockStore.dispatch).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should set error message on failed onSubmit', () => {
    component.loginForm.controls['email'].setValue('test@example.com');
    component.loginForm.controls['password'].setValue('wrong-password');
    mockStore.dispatch.mockReturnValue(
      throwError(() => ({ error: { message: 'Invalid credentials' } })),
    );

    component.onSubmit();

    expect(component.isLoading).toBe(false);
    expect(component.errorMessage).toBe('Invalid credentials');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
