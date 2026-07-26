import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { webcrypto } from 'node:crypto';
import { GroupMembersComponent } from './group-members.component';
import { GroupsService } from '../../services/groups.service';
import { FriendsService } from '../../../friends/services/friends.service';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';
import { GroupMember } from '@finmate/data-models';

/**
 * runWithRecovery's catch does an authoritative ensureCryptoContext() check
 * that is itself several microtask ticks deep — flush generously rather than
 * guessing the exact count (see crypto-recovery-queue.service.spec.ts).
 */
async function flushMicrotasks(times = 15): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

// generateSecureInviteLink()/sendBulkInvites() check for
// window.crypto.subtle before touching group-key logic; jsdom doesn't
// implement SubtleCrypto, so polyfill it (same pattern as
// encryption.service.spec.ts).
if (typeof globalThis !== 'undefined' && !globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
  });
} else if (
  typeof globalThis !== 'undefined' &&
  globalThis.crypto &&
  !globalThis.crypto.subtle
) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
    writable: true,
  });
}

/**
 * Focused on this consolidation's change only (isSessionBlocked /
 * <app-crypto-recovery-panel> wiring) — GroupMembersComponent had no
 * existing test file (tracked gap, docs/releases/BETA_BACKLOG.md); a full
 * test suite for its invite/QR/role-management behavior is a separate,
 * larger undertaking out of scope here.
 */
describe('GroupMembersComponent — crypto recovery wiring', () => {
  let fixture: ComponentFixture<GroupMembersComponent>;
  let component: GroupMembersComponent;
  let mockGroupKeyService: any;
  let mockEncryptionService: any;

  const mockMembers: GroupMember[] = [
    {
      id: 'member-1',
      joinStatus: 'active',
      role: 'owner',
      user: { id: 'user-1', email: 'owner@example.com' },
    } as any,
  ];

  beforeEach(async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    mockGroupKeyService = {
      getGroupDataKey: jest.fn().mockResolvedValue(null),
      getMyAsymmetricKeys: jest.fn().mockResolvedValue({}),
      resolveGroupKey: jest
        .fn()
        .mockResolvedValue({ status: 'ready', key: {} }),
      createAndStoreGroupKey: jest.fn().mockResolvedValue({}),
    };

    mockEncryptionService = {
      // CryptoRecoveryQueueService's runWithRecovery() now does its own
      // ensureCryptoContext() check on every failure (via CryptoSessionManager,
      // which calls this), independent of GroupKeyService's classification
      // these tests exercise below. Without a resolved key here, that check
      // would always fail and every queued operation would wait forever for
      // a Ready transition that never comes, timing out every test in this
      // file rather than exercising the no_session/pending scenarios below.
      loadKeyFromSession: jest.fn().mockResolvedValue({}),
      generateDataKey: jest.fn().mockResolvedValue({}),
      wrapKey: jest.fn().mockResolvedValue('wrapped'),
      decrypt: jest.fn().mockResolvedValue(''),
    };

    await TestBed.configureTestingModule({
      imports: [GroupMembersComponent, HttpClientTestingModule],
      providers: [
        {
          provide: GroupsService,
          useValue: { updateMember: jest.fn(), removeMember: jest.fn() },
        },
        {
          provide: FriendsService,
          useValue: { searchUsers: jest.fn().mockReturnValue(of([])) },
        },
        { provide: ClientEncryptionService, useValue: mockEncryptionService },
        { provide: GroupKeyService, useValue: mockGroupKeyService },
        {
          provide: Store,
          useValue: {
            selectSnapshot: jest
              .fn()
              .mockReturnValue({ email: 'owner@example.com' }),
            dispatch: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupMembersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('members', mockMembers);
    fixture.componentRef.setInput('groupId', 'group-1');
    fixture.componentRef.setInput('isOwnerOrAdmin', true);
  });

  function panelEl(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="crypto-recovery-panel"]',
    );
  }

  it('sendBulkInvites: sets isSessionBlocked and shows the shared panel when the cause is no_session, without an inviteError string — and queues rather than failing, ready to auto-resume once unlocked', async () => {
    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'no_session',
    });
    // A real no_session classification from GroupKeyService means the master
    // key genuinely isn't available — mock CryptoSessionManager's own check
    // to agree, so runWithRecovery queues (rather than treating this as an
    // unrelated failure with a session that's actually fine).
    mockEncryptionService.loadKeyFromSession.mockResolvedValue(null);
    component.stageUser({
      name: 'Jane',
      identifier: 'jane@example.com',
      role: 'member',
      isRegisteredUser: false,
    });

    // Don't await to completion — a genuine session block queues and pauses
    // the whole invite send until unlock, it doesn't reject. Full
    // resume-then-complete behavior (including the HTTP round-trip this
    // would go on to make) is exercised generically in
    // crypto-recovery-queue.service.spec.ts; this test only covers the
    // isSessionBlocked/panel wiring at the moment of the pause.
    void component.sendBulkInvites();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.isSessionBlocked()).toBe(true);
    expect(component.inviteError).toBe('');
    expect(panelEl()).not.toBeNull();
    expect(component.isInviting).toBe(true);
  });

  it('sendBulkInvites: a non-session block (e.g. pending, non-owner) still uses the existing inviteError message, not the panel', async () => {
    fixture.componentRef.setInput('isOwnerOrAdmin', false);
    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'pending',
    });
    component.stageUser({
      name: 'Jane',
      identifier: 'jane@example.com',
      role: 'member',
      isRegisteredUser: false,
    });

    await component.sendBulkInvites();
    fixture.detectChanges();

    expect(component.isSessionBlocked()).toBe(false);
    expect(component.inviteError).toContain('Group key not available');
    expect(panelEl()).toBeNull();
  });

  it('generateSecureInviteLink: sets isSessionBlocked on no_session, shows the panel, and stays paused (not failed) rather than returning immediately', async () => {
    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'no_session',
    });
    mockEncryptionService.loadKeyFromSession.mockResolvedValue(null);

    void component.generateSecureInviteLink();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.isSessionBlocked()).toBe(true);
    expect(panelEl()).not.toBeNull();
    // Still busy/paused, not failed — isGeneratingLink only clears once the
    // queued attempt resumes and the operation's own finally runs (covered
    // generically by crypto-recovery-queue.service.spec.ts).
    expect(component.isGeneratingLink).toBe(true);
  });

  it('ensureGroupKey resets isSessionBlocked on a fresh attempt that succeeds', async () => {
    // Calls the private method directly (rather than through
    // sendBulkInvites/generateSecureInviteLink) to isolate this specific
    // reset behavior from the rest of the invite-sending flow, which makes
    // further, unrelated HTTP calls once the key resolves.
    mockGroupKeyService.resolveGroupKey.mockResolvedValueOnce({
      status: 'no_session',
    });
    await (component as any).ensureGroupKey();
    expect(component.isSessionBlocked()).toBe(true);

    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'ready',
      key: {},
    });
    await (component as any).ensureGroupKey();

    expect(component.isSessionBlocked()).toBe(false);
  });
});
