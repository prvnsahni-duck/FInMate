import { TestBed, ComponentFixture } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockStore: jest.Mocked<Store>;
  let router: Router;

  beforeEach(async () => {
    mockStore = {
      dispatch: jest.fn().mockReturnValue(of({}))
    } as any;

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, ReactiveFormsModule],
      providers: [
        { provide: Store, useValue: mockStore },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate form fields', () => {
    expect(component.registerForm.valid).toBe(false);

    const nameControl = component.registerForm.controls['displayName'];
    const emailControl = component.registerForm.controls['email'];
    const passwordControl = component.registerForm.controls['password'];

    nameControl.setValue('');
    emailControl.setValue('');
    passwordControl.setValue('');
    expect(nameControl.hasError('required')).toBe(true);
    expect(emailControl.hasError('required')).toBe(true);
    expect(passwordControl.hasError('required')).toBe(true);

    emailControl.setValue('invalid-email');
    expect(emailControl.hasError('email')).toBe(true);

    passwordControl.setValue('short');
    expect(passwordControl.hasError('minlength')).toBe(true);

    passwordControl.setValue('nopasswordpattern');
    expect(passwordControl.hasError('pattern')).toBe(true);

    nameControl.setValue('John Doe');
    emailControl.setValue('john@example.com');
    passwordControl.setValue('SecurePassword123!'); // Meets pattern: lower, upper, digit, special char, length >= 8
    expect(component.registerForm.valid).toBe(true);
  });

  it('should dispatch Register action and show success message on successful onSubmit', () => {
    jest.useFakeTimers();
    component.registerForm.controls['displayName'].setValue('John Doe');
    component.registerForm.controls['email'].setValue('john@example.com');
    component.registerForm.controls['password'].setValue('SecurePassword123!');

    component.onSubmit();

    expect(component.isLoading).toBe(false);
    expect(mockStore.dispatch).toHaveBeenCalled();
    expect(component.successMessage).toBe('Account created successfully! Please sign in.');

    jest.advanceTimersByTime(2000);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    jest.useRealTimers();
  });

  it('should set error message on failed onSubmit', () => {
    component.registerForm.controls['displayName'].setValue('John Doe');
    component.registerForm.controls['email'].setValue('john@example.com');
    component.registerForm.controls['password'].setValue('SecurePassword123!');
    mockStore.dispatch.mockReturnValue(throwError(() => ({ error: { message: 'Email already exists' } })));

    component.onSubmit();

    expect(component.isLoading).toBe(false);
    expect(component.errorMessage).toBe('Email already exists');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
