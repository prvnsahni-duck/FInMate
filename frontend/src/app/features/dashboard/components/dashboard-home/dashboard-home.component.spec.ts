import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardHomeComponent } from './dashboard-home.component';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('DashboardHomeComponent', () => {
  let component: DashboardHomeComponent;
  let fixture: ComponentFixture<DashboardHomeComponent>;

  const mockProfile = {
    monthlyIncome: 5000,
    monthlyBudget: 2000,
    defaultCurrency: 'USD'
  };

  const mockExpenses = [
    { id: 'exp-1', title: 'Groceries', amountTotal: 150, category: 'Food & Drinks', expenseDate: new Date() }
  ];

  const mockInvitations = [
    { membershipId: 'invite-1', name: 'Household Group', ownerName: 'Alice' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardHomeComponent],
      schemas: [NO_ERRORS_SCHEMA]
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
    expect(compiled.querySelector('h1')?.textContent).toContain('Welcome back, John');
  });

  it('should emit openExpenseModalEvent on log expense click', () => {
    fixture.detectChanges();
    const emitSpy = jest.spyOn(component.openExpenseModalEvent, 'emit');
    
    const logExpenseBtn = fixture.nativeElement.querySelector('button');
    logExpenseBtn.click();
    
    expect(emitSpy).toHaveBeenCalledWith({});
  });

  it('should emit acceptInvitationEvent on accept click', () => {
    fixture.detectChanges();
    const emitSpy = jest.spyOn(component.acceptInvitationEvent, 'emit');
    
    // Find the accept button inside the invitation block
    // Decline button is index 0 inside invitations, Accept is index 1
    const buttons = fixture.nativeElement.querySelectorAll('button');
    // Button 0: Log Expense, Button 1: Configure limits, Button 2: Decline, Button 3: Accept
    const acceptBtn = buttons[3] as HTMLButtonElement;
    expect(acceptBtn.textContent?.trim()).toBe('Accept');
    
    acceptBtn.click();
    expect(emitSpy).toHaveBeenCalledWith(mockInvitations[0]);
  });
});
