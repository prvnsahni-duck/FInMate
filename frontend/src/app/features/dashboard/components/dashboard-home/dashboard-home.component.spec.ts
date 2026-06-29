import { NGXS_OPTIONS, Store } from '@ngxs/store';
import { ZK_DB_NAME } from '../../../../core/services/zk-key-vault.service';
import { ZkKeyVaultService } from '../../../../core/services/zk-key-vault.service';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardHomeComponent } from './dashboard-home.component';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('DashboardHomeComponent', () => {
  let component: DashboardHomeComponent;
  let fixture: ComponentFixture<DashboardHomeComponent>;

  const mockProfile = {
    monthlyIncome: 5000,
    monthlyBudget: 2000,
    defaultCurrency: 'USD',
  };

  const mockExpenses = [
    {
      id: 'exp-1',
      title: 'Groceries',
      amountTotal: 150,
      category: 'Food & Drinks',
      expenseDate: new Date(),
    },
  ];

  const mockInvitations = [
    { membershipId: 'invite-1', name: 'Household Group', ownerName: 'Alice' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { selectSnapshot: jest.fn().mockReturnValue({ email: 'test@example.com' }) } },
        { provide: NGXS_OPTIONS, useValue: {} },
        { provide: ZK_DB_NAME, useValue: 'finmate_zk_vault_test_' + Math.random() },
        ZkKeyVaultService,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardHomeComponent);
    component = fixture.componentInstance;

    // Set default input values
    component.userName = 'John';
    component.totalBalance = 150;
    component.monthlyExpenses = 150;
    component.activeGroupsCount = 1;
    component.personalExpenses = mockExpenses;
    component.pendingInvitations = mockInvitations;
    component.userProfile = mockProfile;
    component.incomePercentage = 3;
    component.budgetPercentage = 8;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the greeting and username', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Welcome back, John',
    );
  });

  it('should emit openExpenseModalEvent on log expense click', () => {
    fixture.detectChanges();
    const emitSpy = jest.spyOn(component.openExpenseModalEvent, 'emit');

    const logExpenseBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find(btn => (btn as HTMLButtonElement).textContent?.includes('Log Expense')) as HTMLButtonElement;
    logExpenseBtn.click();

    expect(emitSpy).toHaveBeenCalledWith({});
  });

  it('should emit acceptInvitationEvent on accept click', () => {
    fixture.detectChanges();
    const emitSpy = jest.spyOn(component.acceptInvitationEvent, 'emit');

    // Find the accept button specifically by text
    const acceptBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find(btn => (btn as HTMLButtonElement).textContent?.trim() === 'Accept') as HTMLButtonElement;
    expect(acceptBtn).toBeTruthy();
    expect(acceptBtn.textContent?.trim()).toBe('Accept');

    acceptBtn.click();
    expect(emitSpy).toHaveBeenCalledWith(mockInvitations[0]);
  });
});
