import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardProfileComponent } from './dashboard-profile.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { of, throwError } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';

describe('DashboardProfileComponent', () => {
  let component: DashboardProfileComponent;
  let fixture: ComponentFixture<DashboardProfileComponent>;
  let mockAuthService: { updateProfile: jest.Mock };

  const mockProfile = {
    id: 'profile-1',
    timezone: 'America/New_York',
    locale: 'en-US',
    defaultCurrency: 'USD',
    monthlyIncome: 5000,
    monthlyBudget: 2000,
    avatarUrl: null,
  };

  beforeEach(async () => {
    mockAuthService = {
      updateProfile: jest.fn().mockReturnValue(
        of({ user: { displayName: 'Alice' }, profile: mockProfile }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardProfileComponent],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(DashboardProfileComponent, {
        set: { imports: [FormsModule], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DashboardProfileComponent);
    component = fixture.componentInstance;
    component.userName = 'John';
    component.userDisplayName = 'John';
    component.userEmail = 'john@example.com';
    component.userProfile = mockProfile as any;
    component.personalExpensesCount = 5;
    component.incomePercentage = 10;
    // Manually sync edit state since ngOnChanges only fires via template bindings
    component.syncEditState();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display profile details correctly', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('5 logged');
    expect(compiled.textContent).toContain('10% spent');
  });

  describe('syncEditState', () => {
    it('should initialise edit fields from inputs', () => {
      // syncEditState() is called in beforeEach after setting inputs
      expect(component.editDisplayName).toBe('John');
      expect(component.editTimezone).toBe('America/New_York');
      expect(component.editLocale).toBe('en-US');
    });

    it('should use userDisplayName over userName when both provided', () => {
      component.userDisplayName = 'Alice Override';
      component.syncEditState();
      expect(component.editDisplayName).toBe('Alice Override');
    });
  });

  describe('displayInitial', () => {
    it('returns first char of displayName uppercased', () => {
      component.userDisplayName = 'alice';
      expect(component.displayInitial).toBe('A');
    });

    it('falls back to userName then email', () => {
      component.userDisplayName = '';
      component.userName = 'bob';
      expect(component.displayInitial).toBe('B');
    });
  });

  describe('saveProfile', () => {
    beforeEach(() => fixture.detectChanges());

    it('calls authService.updateProfile with trimmed displayName, timezone, locale', () => {
      component.editDisplayName = '  Alice  ';
      component.editTimezone = 'Europe/London';
      component.editLocale = 'en-GB';

      component.saveProfile();

      expect(mockAuthService.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Alice',
          timezone: 'Europe/London',
          locale: 'en-GB',
        }),
      );
    });

    it('sets profileSaveError and does not call service when name is empty', () => {
      component.editDisplayName = '   ';
      component.saveProfile();
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
      expect(component.profileSaveError).toBeTruthy();
    });

    it('sets profileSaveError when displayName exceeds 120 chars', () => {
      component.editDisplayName = 'a'.repeat(121);
      component.saveProfile();
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
      expect(component.profileSaveError).toContain('120');
    });

    it('emits profileUpdated and sets success message on success', () => {
      const emitSpy = jest.spyOn(component.profileUpdated, 'emit');
      component.editDisplayName = 'Alice';

      component.saveProfile();

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ user: { displayName: 'Alice' } }),
      );
      expect(component.profileSaveSuccess).toContain('successfully');
      expect(component.isSavingProfile).toBe(false);
    });

    it('sets profileSaveError on API failure', () => {
      mockAuthService.updateProfile.mockReturnValue(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      component.editDisplayName = 'Alice';

      component.saveProfile();

      expect(component.profileSaveError).toBe('Server error');
      expect(component.isSavingProfile).toBe(false);
    });

    it('includes pendingAvatarDataUrl in the DTO when set', () => {
      component.editDisplayName = 'Alice';
      component.pendingAvatarDataUrl = 'data:image/png;base64,abc';

      component.saveProfile();

      expect(mockAuthService.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: 'data:image/png;base64,abc' }),
      );
    });

    it('does not include avatarUrl in DTO when no pending change', () => {
      component.editDisplayName = 'Alice';
      component.pendingAvatarDataUrl = null;

      component.saveProfile();

      const dto = mockAuthService.updateProfile.mock.calls[0][0];
      expect('avatarUrl' in dto).toBe(false);
    });
  });

  describe('removeAvatar', () => {
    it('clears avatarPreviewUrl and sets pendingAvatarDataUrl to empty string', () => {
      component.avatarPreviewUrl = 'data:image/png;base64,abc';
      component.pendingAvatarDataUrl = 'data:image/png;base64,abc';

      component.removeAvatar();

      expect(component.avatarPreviewUrl).toBeNull();
      expect(component.pendingAvatarDataUrl).toBe('');
    });
  });

  describe('onAvatarSelected', () => {
    it('sets avatarSizeWarning when file exceeds 500KB', () => {
      const largeFile = new File(['x'.repeat(600 * 1024)], 'big.png', {
        type: 'image/png',
      });
      const event = { target: { files: [largeFile] } } as any;

      component.onAvatarSelected(event);

      expect(component.avatarSizeWarning).toContain('500');
      expect(component.pendingAvatarDataUrl).toBeNull();
    });
  });

  describe('AI toggle persistence', () => {
    it('component does not touch aiOptIn — handled by parent (Settings tab)', () => {
      expect('aiOptIn' in component).toBe(false);
    });
  });
});
