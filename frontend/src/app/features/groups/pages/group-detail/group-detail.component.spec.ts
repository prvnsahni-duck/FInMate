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

import { RecurringExpensesService } from '../../services/recurring-expenses.service';

describe('GroupDetailComponent', () => {
  let component: GroupDetailComponent;
  let fixture: ComponentFixture<GroupDetailComponent>;
  let mockGroupsService: jest.Mocked<GroupsService>;
  let mockExpensesService: jest.Mocked<ExpensesService>;
  let mockRecurringExpensesService: any;
  let mockActivatedRoute: any;

  const mockGroup = {
    id: 'group-1',
    name: 'Household Suite',
    description: 'Shared household space',
    currency: 'USD',
    groupType: 'household',
    carryForwardEnabled: true,
    visibility: 'private',
    version: 1
  };

  const mockMembers: GroupMember[] = [
    {
      id: 'member-owner',
      joinStatus: 'active',
      role: 'owner',
      user: { id: 'user-owner', email: 'owner@household.com', displayName: 'Owner User' }
    } as any,
    {
      id: 'member-admin',
      joinStatus: 'active',
      role: 'admin',
      user: { id: 'user-admin', email: 'admin@household.com', displayName: 'Admin User' }
    } as any,
    {
      id: 'member-contributor',
      joinStatus: 'active',
      role: 'member',
      user: { id: 'user-contributor', email: 'contributor@household.com', displayName: 'Contributor User' }
    } as any,
    {
      id: 'member-viewer',
      joinStatus: 'active',
      role: 'viewer',
      user: { id: 'user-viewer', email: 'viewer@household.com', displayName: 'Viewer User' }
    } as any
  ];

  beforeEach(async () => {
    // Mock window.alert to prevent JSDOM errors
    jest.spyOn(window, 'alert').mockImplementation(() => {});

    mockGroupsService = {
      getGroup: jest.fn().mockReturnValue(of(mockGroup)),
      getMembers: jest.fn().mockReturnValue(of(mockMembers)),
      getBalances: jest.fn().mockReturnValue(of({ balances: [], suggestedSettlements: [] })),
      getHistoryLogs: jest.fn().mockReturnValue(of({ data: [] })),
      getDeletedExpenses: jest.fn().mockReturnValue(of({ data: [] })),
      getCarryForward: jest.fn().mockReturnValue(of([])),
      getContributions: jest.fn().mockReturnValue(of([
        { memberId: 'member-owner', displayName: 'Owner User', percentage: 50 },
        { memberId: 'member-admin', displayName: 'Admin User', percentage: 50 }
      ])),
      updateContributions: jest.fn().mockReturnValue(of({})),
      updateMember: jest.fn().mockReturnValue(of({})),
      removeMember: jest.fn().mockReturnValue(of({}))
    } as any;

    mockExpensesService = {
      getExpenses: jest.fn().mockReturnValue(of({ data: [], meta: { totalItems: 0 } }))
    } as any;

    mockRecurringExpensesService = {
      getRecurringExpenses: jest.fn().mockReturnValue(of([])),
      createRecurringExpense: jest.fn().mockReturnValue(of({})),
      updateRecurringExpense: jest.fn().mockReturnValue(of({})),
      deleteRecurringExpense: jest.fn().mockReturnValue(of(null))
    };

    mockActivatedRoute = {
      paramMap: of(convertToParamMap({ id: 'group-1' }))
    };

    await TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        { provide: GroupsService, useValue: mockGroupsService },
        { provide: ExpensesService, useValue: mockExpensesService },
        { provide: RecurringExpensesService, useValue: mockRecurringExpensesService },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute } // Listed LAST to override provideRouter
      ]
    }).overrideComponent(GroupDetailComponent, {
      set: {
        imports: [CurrencyPipe, DatePipe, FormsModule],
        schemas: [NO_ERRORS_SCHEMA]
      }
    }).compileComponents();

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
      { memberId: 'm3', displayName: 'User 3', amount: 3, percentage: 0 }
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

    const contributor = mockMembers.find(m => m.role === 'member')!;
    const owner = mockMembers.find(m => m.role === 'owner')!;
    const otherAdmin = mockMembers.find(m => m.role === 'admin')!;

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
    const contributor = mockMembers.find(m => m.role === 'member')!;
    const mockEvent = { target: { value: 'admin' } };

    component.updateMemberRole(contributor, mockEvent);

    expect(mockGroupsService.updateMember).toHaveBeenCalledWith('group-1', contributor.id, { role: 'admin' });
  });

  it('should call removeMember when removeOrRevokeMember is confirmed', () => {
    fixture.detectChanges();
    const contributor = mockMembers.find(m => m.role === 'member')!;
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    component.removeOrRevokeMember(contributor);

    expect(mockGroupsService.removeMember).toHaveBeenCalledWith('group-1', contributor.id);
  });
});
