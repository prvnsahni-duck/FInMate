import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { CryptoRecoveryPanelComponent } from './crypto-recovery-panel.component';
import { CryptoSessionManager } from '../../../core/services/crypto-session-manager.service';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { GroupKeyService } from '../../../core/services/group-key.service';
import { Logout } from '../../../core/auth/auth.state';
import {
  CRYPTO_UNLOCK_PROVIDERS,
  CryptoUnlockProvider,
} from '../../../core/services/crypto-unlock-provider';
import { CryptoRecoveryVisibilityService } from '../../../core/services/crypto-recovery-visibility.service';

describe('CryptoRecoveryPanelComponent', () => {
  let fixture: ComponentFixture<CryptoRecoveryPanelComponent>;
  let component: CryptoRecoveryPanelComponent;
  let cryptoSession: CryptoSessionManager;
  let mockStore: { selectSnapshot: jest.Mock; dispatch: jest.Mock };
  let mockEncryption: {
    loadKeyFromSession: jest.Mock;
    deriveAndStoreKey: jest.Mock;
  };
  let mockGroupKeys: { resolveGroupKey: jest.Mock; clearCache: jest.Mock };
  let mockPasswordProvider: CryptoUnlockProvider;

  beforeEach(() => {
    mockStore = {
      selectSnapshot: jest
        .fn()
        .mockImplementation(() => ({ email: 'test@example.com' })),
      dispatch: jest.fn(),
    };
    mockEncryption = {
      loadKeyFromSession: jest.fn().mockResolvedValue(null),
      deriveAndStoreKey: jest.fn().mockResolvedValue({ persisted: true }),
    };
    mockGroupKeys = {
      resolveGroupKey: jest.fn().mockResolvedValue({ status: 'ready' }),
      clearCache: jest.fn(),
    };
    mockPasswordProvider = {
      id: 'password',
      label: 'Password',
      inputType: 'text-secret',
      unlock: jest.fn().mockImplementation(async (credential?: string) => {
        // Mirrors PasswordUnlockProvider's real contract for these tests.
        await mockEncryption.deriveAndStoreKey(credential, 'test@example.com');
        await cryptoSession.ensureCryptoContext();
      }),
    };

    TestBed.configureTestingModule({
      imports: [CryptoRecoveryPanelComponent],
      providers: [
        CryptoSessionManager,
        CryptoRecoveryVisibilityService,
        { provide: Store, useValue: mockStore },
        { provide: ClientEncryptionService, useValue: mockEncryption },
        { provide: GroupKeyService, useValue: mockGroupKeys },
        {
          provide: CRYPTO_UNLOCK_PROVIDERS,
          useValue: mockPasswordProvider,
          multi: true,
        },
      ],
    });

    cryptoSession = TestBed.inject(CryptoSessionManager);
    fixture = TestBed.createComponent(CryptoRecoveryPanelComponent);
    component = fixture.componentInstance;
  });

  function panelEl(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="crypto-recovery-panel"]',
    );
  }

  it('renders nothing when the session is Ready', async () => {
    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();
    fixture.detectChanges();

    expect(panelEl()).toBeNull();
  });

  it('renders the unlock prompt for NoSession with a headline that does not imply the user was logged out', async () => {
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    fixture.detectChanges();

    const el = panelEl();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-crypto-recovery-state')).toBe('NoSession');
    expect(el?.textContent).toContain('Unlock encrypted data');
    expect(el?.textContent).toContain('still signed in');
    expect(el?.textContent?.toLowerCase()).not.toContain('logged out');
  });

  it('shows a transient, action-free indicator for Loading/Recovering states', () => {
    (cryptoSession as any).transition('Recovering');
    fixture.detectChanges();

    const el = panelEl();
    expect(el?.getAttribute('data-crypto-recovery-state')).toBe('transient');
    expect(el?.getAttribute('role')).toBe('status');
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="crypto-recovery-unlock-button"]',
      ),
    ).toBeNull();
  });

  it('unlock() delegates to the active CryptoUnlockProvider instead of calling encryption services directly', async () => {
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    fixture.detectChanges();

    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    component.credential.set('correct horse battery staple');
    await component.unlock();

    expect(mockPasswordProvider.unlock).toHaveBeenCalledWith(
      'correct horse battery staple',
    );
    expect(cryptoSession.state()).toBe('Ready');
    expect(component.credential()).toBe('');
  });

  it('renders the provider label rather than a hard-coded "password" string', async () => {
    mockPasswordProvider.label = 'Custom Secret';
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('input[aria-label="Custom Secret"]'),
    ).not.toBeNull();
  });

  it('retry() re-attempts ensureCryptoContext without requiring a credential', async () => {
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    mockEncryption.loadKeyFromSession.mockResolvedValue({});

    await component.retry();

    expect(cryptoSession.state()).toBe('Ready');
  });

  it('signOut() dispatches the Logout action', () => {
    component.signOut();

    expect(mockStore.dispatch).toHaveBeenCalledWith(expect.any(Logout));
  });

  it('shows a Retry action only for RecoveringBlocked, not for a fresh NoSession', async () => {
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="crypto-recovery-retry-button"]',
      ),
    ).toBeNull();

    (cryptoSession as any).transition('RecoveringBlocked');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="crypto-recovery-retry-button"]',
      ),
    ).not.toBeNull();
  });

  it('Fatal state offers Sign Out but not an unlock credential input', () => {
    cryptoSession.markFatal('decrypt_integrity_failure');
    fixture.detectChanges();

    const el = panelEl();
    expect(el?.getAttribute('data-crypto-recovery-state')).toBe('Fatal');
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="crypto-recovery-unlock-button"]',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="crypto-recovery-signout-button"]',
      ),
    ).not.toBeNull();
  });

  it('uses role="alert" for states needing attention and role="status" for transient states', async () => {
    await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
    fixture.detectChanges();
    expect(panelEl()?.getAttribute('role')).toBe('alert');

    (cryptoSession as any).transition('Loading');
    fixture.detectChanges();
    expect(panelEl()?.getAttribute('role')).toBe('status');
  });

  describe('single-panel visibility across multiple mounted instances', () => {
    it('suppresses an earlier-mounted instance once a second one mounts on top of it (e.g. a modal)', async () => {
      await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
      fixture.detectChanges();
      expect(panelEl()).not.toBeNull(); // the only instance so far

      const fixture2 = TestBed.createComponent(CryptoRecoveryPanelComponent);
      fixture2.detectChanges();
      fixture.detectChanges();

      // The first (page-level) instance suppresses itself...
      expect(panelEl()).toBeNull();
      // ...while the second (modal-level) instance is the one showing.
      expect(
        fixture2.nativeElement.querySelector(
          '[data-testid="crypto-recovery-panel"]',
        ),
      ).not.toBeNull();
    });

    it('the underlying instance reappears once the topmost one is destroyed (modal closed)', async () => {
      await expect(cryptoSession.ensureCryptoContext()).rejects.toThrow();
      fixture.detectChanges();

      const fixture2 = TestBed.createComponent(CryptoRecoveryPanelComponent);
      fixture2.detectChanges();
      fixture.detectChanges();
      expect(panelEl()).toBeNull();

      fixture2.destroy();
      fixture.detectChanges();

      expect(panelEl()).not.toBeNull();
    });
  });
});
