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

  it('sendBulkInvites: sets isSessionBlocked and shows the shared panel when the cause is no_session, without an inviteError string', async () => {
    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'no_session',
    });
    component.stageUser({
      name: 'Jane',
      identifier: 'jane@example.com',
      role: 'member',
      isRegisteredUser: false,
    });

    await component.sendBulkInvites();
    fixture.detectChanges();

    expect(component.isSessionBlocked()).toBe(true);
    expect(component.inviteError).toBe('');
    expect(panelEl()).not.toBeNull();
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

  it('generateSecureInviteLink: sets isSessionBlocked on no_session and returns without throwing', async () => {
    mockGroupKeyService.resolveGroupKey.mockResolvedValue({
      status: 'no_session',
    });

    await component.generateSecureInviteLink();
    fixture.detectChanges();

    expect(component.isSessionBlocked()).toBe(true);
    expect(panelEl()).not.toBeNull();
    expect(component.isGeneratingLink).toBe(false);
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
