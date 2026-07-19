import { TestBed, ComponentFixture } from '@angular/core/testing';
import { GroupDetailComponent } from './group-detail.component';
import { GroupsService } from '../../services/groups.service';
import { ExpensesService } from '../../services/expenses.service';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { GroupMember } from '@finmate/data-models';
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';

import { RecurringExpensesService } from '../../services/recurring-expenses.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { signal } from '@angular/core';

describe('GroupDetailComponent', () => {
  let component: GroupDetailComponent;
  let fixture: ComponentFixture<GroupDetailComponent>;
  let mockGroupsService: jest.Mocked<GroupsService>;
  let mockExpensesService: jest.Mocked<ExpensesService>;
  let mockRecurringExpensesService: any;
  let mockActivatedRoute: any;
  let mockGroupKeyService: any;
  let mockEncryptionService: any;
  let mockStore: { selectSnapshot: jest.Mock };

  const mockGroup = {
    id: 'group-1',
    name: 'Household Suite',
    description: 'Shared household space',
    currency: 'USD',
    groupType: 'household',
    carryForwardEnabled: true,
    visibility: 'private',
    version: 1,
  };

  const mockMembers: GroupMember[] = [
    {
      id: 'member-owner',
      joinStatus: 'active',
      role: 'owner',
      user: {
        id: 'user-owner',
        email: 'owner@household.com',
        displayName: 'Owner User',
      },
    } as any,
    {
      id: 'member-admin',
      joinStatus: 'active',
      role: 'admin',
      user: {
        id: 'user-admin',
        email: 'admin@household.com',
        displayName: 'Admin User',
      },
    } as any,
    {
      id: 'member-contributor',
      joinStatus: 'active',
      role: 'member',
      user: {
        id: 'user-contributor',
        email: 'contributor@household.com',
        displayName: 'Contributor User',
      },
    } as any,
    {
      id: 'member-viewer',
      joinStatus: 'active',
      role: 'viewer',
      user: {
        id: 'user-viewer',
        email: 'viewer@household.com',
        displayName: 'Viewer User',
      },
    } as any,
  ];

  beforeEach(async () => {
    // Mock window.alert to prevent JSDOM errors
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    mockGroupsService = {
      getGroup: jest.fn().mockReturnValue(of(mockGroup)),
      getMembers: jest.fn().mockReturnValue(of(mockMembers)),
      getBalances: jest
        .fn()
        .mockReturnValue(of({ balances: [], suggestedSettlements: [] })),
      getHistoryLogs: jest.fn().mockReturnValue(of({ data: [] })),
      getDeletedExpenses: jest.fn().mockReturnValue(of({ data: [] })),
      getCarryForward: jest.fn().mockReturnValue(of([])),
      getContributions: jest.fn().mockReturnValue(
        of([
          {
            memberId: 'member-owner',
            displayName: 'Owner User',
            percentage: 50,
          },
          {
            memberId: 'member-admin',
            displayName: 'Admin User',
            percentage: 50,
          },
        ]),
      ),
      updateContributions: jest.fn().mockReturnValue(of({})),
      updateMember: jest.fn().mockReturnValue(of({})),
      removeMember: jest.fn().mockReturnValue(of({})),
    } as any;

    mockExpensesService = {
      getExpenses: jest
        .fn()
        .mockReturnValue(of({ data: [], meta: { totalItems: 0 } })),
    } as any;

    mockRecurringExpensesService = {
      getRecurringExpenses: jest.fn().mockReturnValue(of([])),
      createRecurringExpense: jest.fn().mockReturnValue(of({})),
      updateRecurringExpense: jest.fn().mockReturnValue(of({})),
      deleteRecurringExpense: jest.fn().mockReturnValue(of(null)),
    };

    mockActivatedRoute = {
      paramMap: of(convertToParamMap({ id: 'group-1' })),
      queryParams: of({}),
      snapshot: {
        queryParams: {},
      },
    };

    mockGroupKeyService = {
      getMyAsymmetricKeys: jest.fn().mockResolvedValue({}),
      getGroupDataKey: jest.fn().mockResolvedValue({}),
      createGroupKey: jest.fn().mockResolvedValue({}),
      createAndStoreGroupKey: jest.fn().mockResolvedValue({}),
      resolveGroupKey: jest
        .fn()
        .mockResolvedValue({ status: 'ready', key: {} }),
      checkAndProvisionMissingKeys: jest.fn().mockResolvedValue({}),
      invalidateGroupKey: jest.fn(),
      // Provide Signal-compatible objects used by the component/template
      rateLimitError: signal<string | null>(null),
      requiresKeyProvisioning: signal<boolean>(false),
    };

    mockEncryptionService = {
      loadKeyFromSession: jest.fn().mockResolvedValue(null),
      deriveAndStoreKey: jest.fn().mockResolvedValue(undefined),
      unwrapKey: jest.fn().mockResolvedValue({}),
      decrypt: jest.fn().mockResolvedValue('file.txt'),
      decryptBytes: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    };

    mockStore = {
      selectSnapshot: jest.fn().mockImplementation(() => ({
        email: 'owner@household.com',
      })),
    };

    await TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        { provide: GroupsService, useValue: mockGroupsService },
        { provide: ExpensesService, useValue: mockExpensesService },
        {
          provide: RecurringExpensesService,
          useValue: mockRecurringExpensesService,
        },
        { provide: GroupKeyService, useValue: mockGroupKeyService },
        { provide: ClientEncryptionService, useValue: mockEncryptionService },
        { provide: Store, useValue: mockStore },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute }, // Listed LAST to override provideRouter
      ],
    })
      .overrideComponent(GroupDetailComponent, {
        set: {
          imports: [CurrencyPipe, DatePipe, FormsModule],
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GroupDetailComponent);
    component = fixture.componentInstance;

    // Default currentUserId spy
    jest.spyOn(component, 'getCurrentUserId').mockReturnValue('user-owner');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load group details and related settings on init', () => {
    fixture.detectChanges(); // triggers ngOnInit

    expect(mockGroupsService.getGroup).toHaveBeenCalledWith('group-1');
    expect(mockGroupsService.getMembers).toHaveBeenCalledWith('group-1');
    expect(component.group()).toEqual(mockGroup);
    expect(component.members().length).toBe(4);
    expect(component.isOwnerOrAdmin()).toBe(true);
  });

  it('should handle toggle of contribution mode', () => {
    fixture.detectChanges();
    expect(component.contributionMode).toBe('amount');

    component.setContributionMode('percentage');
    expect(component.contributionMode).toBe('percentage');
  });

  it('should distribute remaining percentage to the member with max amount in amount mode', () => {
    fixture.detectChanges();
    component.contributionsList = [
      { memberId: 'm1', displayName: 'User 1', amount: 3, percentage: 0 },
      { memberId: 'm2', displayName: 'User 2', amount: 3, percentage: 0 },
      { memberId: 'm3', displayName: 'User 3', amount: 3, percentage: 0 },
    ];

    // 3 / 9 = 33.333... %
    // Rounding makes: 33.33%, 33.33%, 33.33% = 99.99%.
    // Difference is 0.01%, which should go to the member with max amount.
    // In our tie-breaker logic, the first member with max amount receives it.
    component.calculatePercentagesFromAmounts();

    expect(component.getContributionsSum()).toBe(100);
    // Let's verify how the remainder is distributed
    const p1 = component.contributionsList[0].percentage;
    const p2 = component.contributionsList[1].percentage;
    const p3 = component.contributionsList[2].percentage;

    expect(p1 + p2 + p3).toBe(100);
    expect(p1).toBe(33.34); // Got the +0.01% remainder
    expect(p2).toBe(33.33);
    expect(p3).toBe(33.33);
  });

  it('should correctly evaluate role-changing capabilities', () => {
    jest.spyOn(component, 'getCurrentUserId').mockReturnValue('user-admin');
    fixture.detectChanges(); // sets currentUserId, caller role is admin

    const contributor = mockMembers.find((m) => m.role === 'member')!;
    const owner = mockMembers.find((m) => m.role === 'owner')!;
    const otherAdmin = mockMembers.find((m) => m.role === 'admin')!;

    expect(component.canChangeRole(contributor)).toBe(true);
    expect(component.canChangeRole(owner)).toBe(true);
    expect(component.canChangeRole(otherAdmin)).toBe(true);

    // Switch caller to owner (set currentUserId signal directly)
    component.currentUserId.set('user-owner');
    jest.spyOn(component, 'getCallerRole').mockReturnValue('owner');
    expect(component.canChangeRole(otherAdmin)).toBe(true);
  });

  it('should call updateMember when updateMemberRole is called', () => {
    fixture.detectChanges();
    const contributor = mockMembers.find((m) => m.role === 'member')!;

    // `updateMemberRole` accepts `Event | string`; pass a string to avoid Event typing issues in unit tests
    component.updateMemberRole(contributor, 'admin');

    expect(mockGroupsService.updateMember).toHaveBeenCalledWith(
      'group-1',
      contributor.id,
      { role: 'admin' },
    );
  });

  it('should call removeMember when removeOrRevokeMember is confirmed', () => {
    fixture.detectChanges();
    const contributor = mockMembers.find((m) => m.role === 'member')!;
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    component.removeOrRevokeMember(contributor);

    expect(mockGroupsService.removeMember).toHaveBeenCalledWith(
      'group-1',
      contributor.id,
    );
  });

  it('should call initializeGroupKeysAndSelfHeal on members load', () => {
    const selfHealSpy = jest
      .spyOn(component, 'initializeGroupKeysAndSelfHeal')
      .mockResolvedValue();
    fixture.detectChanges(); // ngOnInit -> fetchMembers
    expect(selfHealSpy).toHaveBeenCalledWith('group-1');
  });

  describe('archiveGroup (Delete Group)', () => {
    beforeEach(() => {
      fixture.detectChanges();
      // Ensure owner is current user
      jest.spyOn(component, 'getCurrentUserId').mockReturnValue('user-owner');
    });

    it('isOwner() returns true when current user is the owner', () => {
      expect(component.isOwner()).toBe(true);
    });

    it('isOwner() returns false when current user is an admin', () => {
      jest.spyOn(component, 'getCurrentUserId').mockReturnValue('user-admin');
      component.currentUserId.set('user-admin');
      expect(component.isOwner()).toBe(false);
    });

    it('openArchiveDialog() resets state and opens the dialog', () => {
      component.archiveConfirmName.set('stale');
      component.archiveReason.set('old reason');
      component.archiveError.set('old error');

      component.openArchiveDialog();

      expect(component.isArchiveDialogOpen()).toBe(true);
      expect(component.archiveConfirmName()).toBe('');
      expect(component.archiveReason()).toBe('');
      expect(component.archiveError()).toBe('');
    });

    it('closeArchiveDialog() closes and resets state', () => {
      component.isArchiveDialogOpen.set(true);
      component.archiveConfirmName.set('some name');

      component.closeArchiveDialog();

      expect(component.isArchiveDialogOpen()).toBe(false);
      expect(component.archiveConfirmName()).toBe('');
    });

    it('archiveNameMatches() is false when typed name does not match group name', () => {
      component.archiveConfirmName.set('Wrong Name');
      expect(component.archiveNameMatches()).toBe(false);
    });

    it('archiveNameMatches() is true when typed name exactly matches group name', () => {
      component.archiveConfirmName.set(mockGroup.name);
      expect(component.archiveNameMatches()).toBe(true);
    });

    it('confirmArchiveGroup() does nothing if names do not match', () => {
      (mockGroupsService as any).archiveGroup = jest
        .fn()
        .mockReturnValue(of({}));
      component.archiveConfirmName.set('wrong');

      component.confirmArchiveGroup();

      expect((mockGroupsService as any).archiveGroup).not.toHaveBeenCalled();
    });

    it('confirmArchiveGroup() calls archiveGroup and navigates to /groups on success', () => {
      const archivedGroup = { ...mockGroup, isArchived: true };
      (mockGroupsService as any).archiveGroup = jest
        .fn()
        .mockReturnValue(of(archivedGroup));
      component.archiveConfirmName.set(mockGroup.name);
      component.archiveReason.set('no longer needed');

      const routerSpy = jest
        .spyOn(component['router'], 'navigate')
        .mockResolvedValue(true);

      component.confirmArchiveGroup();

      expect((mockGroupsService as any).archiveGroup).toHaveBeenCalledWith(
        mockGroup.id,
        'no longer needed',
      );
      expect(routerSpy).toHaveBeenCalledWith(['/groups']);
    });

    it('confirmArchiveGroup() sets archiveError on failure', () => {
      const { throwError } = require('rxjs');
      (mockGroupsService as any).archiveGroup = jest
        .fn()
        .mockReturnValue(
          throwError(() => ({ error: { message: 'Server error' } })),
        );
      component.archiveConfirmName.set(mockGroup.name);

      component.confirmArchiveGroup();

      expect(component.archiveError()).toBe('Server error');
      expect(component.isArchiving()).toBe(false);
    });
  });
});
