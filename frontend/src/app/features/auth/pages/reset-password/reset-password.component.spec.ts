import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockAuthService: {
    getResetContext: jest.Mock;
    resetPassword: jest.Mock;
  };
  let mockEncryption: {
    deriveMasterKey: jest.Mock;
    decrypt: jest.Mock;
    encrypt: jest.Mock;
  };
  let mockRouter: { navigate: jest.Mock };
  let token: string | null;

  const fakeKey = 'derived-key' as unknown as CryptoKey;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ClientEncryptionService, useValue: mockEncryption },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: () => token } },
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    token = 'reset-token';
    mockAuthService = {
      getResetContext: jest.fn(),
      resetPassword: jest.fn().mockReturnValue(of({})),
    };
    mockEncryption = {
      deriveMasterKey: jest.fn().mockResolvedValue(fakeKey),
      decrypt: jest.fn().mockResolvedValue('private-key-jwk'),
      encrypt: jest.fn().mockResolvedValue('rewrapped-blob'),
    };
    mockRouter = { navigate: jest.fn() };
  });

  it('shows the reset form when the account has a recovery key', async () => {
    mockAuthService.getResetContext.mockReturnValue(
      of({
        email: 'user@example.com',
        hasRecoveryKey: true,
        recoveryWrappedKey: 'recovery-blob',
      }),
    );
    await setup();
    component.ngOnInit();

    expect(mockAuthService.getResetContext).toHaveBeenCalledWith('reset-token');
    expect(component.view()).toBe('ready');
  });

  it('blocks reset when the account has no recovery key', async () => {
    mockAuthService.getResetContext.mockReturnValue(
      of({
        email: 'user@example.com',
        hasRecoveryKey: false,
        recoveryWrappedKey: null,
      }),
    );
    await setup();
    component.ngOnInit();

    expect(component.view()).toBe('blocked');
  });

  it('shows the invalid state for a missing token (no request made)', async () => {
    token = null;
    await setup();
    component.ngOnInit();

    expect(component.view()).toBe('invalid');
    expect(mockAuthService.getResetContext).not.toHaveBeenCalled();
  });

  it('shows the invalid state when the token is expired/rejected', async () => {
    mockAuthService.getResetContext.mockReturnValue(
      throwError(() => new Error('invalid')),
    );
    await setup();
    component.ngOnInit();

    expect(component.view()).toBe('invalid');
  });

  it('surfaces a friendly error and does not submit when the recovery code is wrong', async () => {
    mockAuthService.getResetContext.mockReturnValue(
      of({
        email: 'user@example.com',
        hasRecoveryKey: true,
        recoveryWrappedKey: 'recovery-blob',
      }),
    );
    // Wrong code → unwrap fails the AES-GCM auth tag.
    mockEncryption.decrypt.mockRejectedValue(new Error('bad tag'));
    await setup();
    component.ngOnInit();

    component.resetForm.setValue({
      recoveryCode: 'WRONG-CODE-HERE-XXXXX',
      newPassword: 'newpassword1',
      confirmPassword: 'newpassword1',
    });

    await component.onSubmit();

    expect(mockAuthService.resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain("recovery code didn't match");
    expect(component.isSubmitting()).toBe(false);
  });

  it('re-wraps the private key and navigates to login on a successful reset', async () => {
    mockAuthService.getResetContext.mockReturnValue(
      of({
        email: 'user@example.com',
        hasRecoveryKey: true,
        recoveryWrappedKey: 'recovery-blob',
      }),
    );
    await setup();
    component.ngOnInit();

    component.resetForm.setValue({
      recoveryCode: 'A1B2C-3D4E5-F6G7H-8J9K0',
      newPassword: 'newpassword1',
      confirmPassword: 'newpassword1',
    });

    await component.onSubmit();

    // Unwrap with the recovery key, then re-wrap under the new master key.
    expect(mockEncryption.decrypt).toHaveBeenCalledWith(
      'recovery-blob',
      fakeKey,
    );
    expect(mockEncryption.encrypt).toHaveBeenCalledWith(
      'private-key-jwk',
      fakeKey,
    );
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith({
      token: 'reset-token',
      newPassword: 'newpassword1',
      encryptedPrivateWrappingKey: 'rewrapped-blob',
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/auth/login'],
      expect.objectContaining({ queryParams: { reset: 'success' } }),
    );
  });
});
