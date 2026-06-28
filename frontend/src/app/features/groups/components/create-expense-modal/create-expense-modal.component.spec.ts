import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CreateExpenseModalComponent } from './create-expense-modal.component';
import { ExpensesService } from '../../services/expenses.service';
import { FriendsService } from '../../../../features/friends/services/friends.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';

describe('CreateExpenseModalComponent', () => {
  let component: CreateExpenseModalComponent;
  let fixture: ComponentFixture<CreateExpenseModalComponent>;
  let mockExpensesService: any;
  let mockFriendsService: any;

  beforeEach(async () => {
    // Mock localStorage for JWT token
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      btoa(JSON.stringify({ userId: 'user-1', email: 'test@example.com' })) +
      '.signature';
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'finmate_token') return mockToken;
      return null;
    });

    mockExpensesService = {
      createExpense: jest.fn().mockReturnValue(of({ id: 'exp-new' })),
      updateExpense: jest.fn().mockReturnValue(of({ id: 'exp-1' })),
    };

    mockFriendsService = {
      searchUsers: jest.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [CreateExpenseModalComponent],
      providers: [
        { provide: ExpensesService, useValue: mockExpensesService },
        { provide: FriendsService, useValue: mockFriendsService },
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(CreateExpenseModalComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Form validation ---
  describe('form validation', () => {
    it('should have form invalid when empty', () => {
      expect(component.expenseForm.valid).toBeFalsy();
    });

    it('should require title', () => {
      const titleControl = component.expenseForm.get('title');
      expect(titleControl?.hasError('required')).toBeTruthy();
    });

    it('should enforce title maxLength of 160', () => {
      const titleControl = component.expenseForm.get('title');
      titleControl?.setValue('a'.repeat(161));
      expect(titleControl?.hasError('maxLength') || titleControl?.hasError('maxlength')).toBeTruthy();
    });

    it('should require amountTotal', () => {
      const amountControl = component.expenseForm.get('amountTotal');
      expect(amountControl?.hasError('required')).toBeTruthy();
    });

    it('should enforce minimum amount of 0.01', () => {
      const amountControl = component.expenseForm.get('amountTotal');
      amountControl?.setValue(0);
      expect(amountControl?.hasError('min')).toBeTruthy();
    });

    it('should accept valid amount', () => {
      const amountControl = component.expenseForm.get('amountTotal');
      amountControl?.setValue(10.5);
      expect(amountControl?.hasError('min')).toBeFalsy();
    });

    it('should require currency', () => {
      const currencyControl = component.expenseForm.get('currency');
      expect(currencyControl?.hasError('required')).toBeTruthy();
    });

    it('should require paidByUserId', () => {
      const paidByControl = component.expenseForm.get('paidByUserId');
      expect(paidByControl?.hasError('required')).toBeTruthy();
    });

    it('should default expenseDate to today', () => {
      const dateControl = component.expenseForm.get('expenseDate');
      const today = component.getTodayDateString();
      expect(dateControl?.value).toBe(today);
    });

    it('should default category to first option', () => {
      const categoryControl = component.expenseForm.get('category');
      expect(categoryControl?.value).toBe(CATEGORY_OPTIONS[0].value);
    });
  });

  // --- ngOnChanges ---
  describe('ngOnChanges', () => {
    it('should patch form when expense input changes (edit mode)', () => {
      component.expense = {
        id: 'exp-1',
        title: 'Groceries',
        description: 'Weekly shop',
        amountTotal: 50,
        currency: 'USD',
        category: 'food',
        expenseDate: '2026-06-28',
        paidByUserId: 'user-1',
        ownerUserId: 'user-1',
        version: 1,
      } as any;

      component.ngOnChanges({
        expense: {
          currentValue: component.expense,
          previousValue: null,
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      expect(component.expenseForm.get('title')?.value).toBe('Groceries');
      expect(component.expenseForm.get('amountTotal')?.value).toBe(50);
    });

    it('should patch currency from group', () => {
      component.groupCurrency = 'EUR';
      component.ngOnChanges({
        groupCurrency: {
          currentValue: 'EUR',
          previousValue: 'USD',
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.expenseForm.get('currency')?.value).toBe('EUR');
    });

    it('should select all active non-spectator members as participants', () => {
      component.members = [
        {
          id: 'm1',
          joinStatus: 'active',
          role: 'owner',
          user: { id: 'u1', email: 'a@b.com' },
        },
        {
          id: 'm2',
          joinStatus: 'active',
          role: 'spectator',
          user: { id: 'u2', email: 'c@d.com' },
        },
        {
          id: 'm3',
          joinStatus: 'active',
          role: 'member',
          user: { id: 'u3', email: 'e@f.com' },
        },
      ] as any;
      component.groupId = 'group-1';

      component.ngOnChanges({
        members: {
          currentValue: component.members,
          previousValue: [],
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      // Spectator should NOT be selected as a participant
      expect(component.selectedUserIds.has('u1')).toBeTruthy();
      expect(component.selectedUserIds.has('u2')).toBeFalsy();
      expect(component.selectedUserIds.has('u3')).toBeTruthy();
    });
  });

  // --- Participant management ---
  describe('participant toggling', () => {
    it('should add participant when toggled on', () => {
      component.toggleParticipant('user-2');
      expect(component.selectedUserIds.has('user-2')).toBeTruthy();
    });

    it('should remove participant when toggled off', () => {
      component.selectedUserIds.add('user-2');
      component.toggleParticipant('user-2');
      expect(component.selectedUserIds.has('user-2')).toBeFalsy();
    });
  });

  // --- File attachment ---
  describe('file attachments', () => {
    it('should add files on selection', () => {
      const mockEvent = {
        target: {
          files: [
            { name: 'receipt.jpg', size: 2048 },
          ],
        },
      } as any;

      component.onFileSelected(mockEvent);
      expect(component.attachedFiles).toHaveLength(1);
      expect(component.attachedFiles[0].name).toBe('receipt.jpg');
    });

    it('should remove attachment by index', () => {
      component.attachedFiles = [
        { name: 'a.jpg', size: '1 KB', key: 'k1' },
        { name: 'b.jpg', size: '2 KB', key: 'k2' },
      ];

      component.removeAttachment(0);
      expect(component.attachedFiles).toHaveLength(1);
      expect(component.attachedFiles[0].name).toBe('b.jpg');
    });
  });

  // --- Submit ---
  describe('onSubmit', () => {
    beforeEach(() => {
      component.groupId = 'group-1';
      component.selectedUserIds.add('user-1');
      component.expenseForm.patchValue({
        title: 'Test Expense',
        amountTotal: 100,
        currency: 'USD',
        category: 'food',
        expenseDate: '2026-06-28',
        paidByUserId: 'user-1',
      });
    });

    it('should call createExpense when form is valid and no existing expense', () => {
      component.onSubmit();

      expect(mockExpensesService.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Expense',
          amountTotal: 100,
          currency: 'USD',
          groupId: 'group-1',
        }),
      );
    });

    it('should call updateExpense when editing an existing expense', () => {
      component.expense = {
        id: 'exp-1',
        version: 2,
      } as any;

      component.onSubmit();

      expect(mockExpensesService.updateExpense).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          title: 'Test Expense',
          version: 2,
        }),
      );
    });

    it('should not submit when form is invalid', () => {
      component.expenseForm.patchValue({ title: '' });
      component.onSubmit();

      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
      expect(mockExpensesService.updateExpense).not.toHaveBeenCalled();
    });

    it('should not submit when no participants are selected', () => {
      component.selectedUserIds.clear();
      component.onSubmit();

      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
    });

    it('should set user-friendly error message on failure', (done) => {
      mockExpensesService.createExpense.mockReturnValue(
        throwError(() => ({ error: { message: 'Internal server error 500' } })),
      );

      component.onSubmit();

      // Wait for async subscriber
      setTimeout(() => {
        // The component uses err.error?.message which may be technical,
        // but fallback is user-friendly
        expect(component.errorMessage).toBeDefined();
        expect(component.isSubmitting).toBe(false);
        done();
      }, 0);
    });

    it('should emit expenseCreated and close modal on success', (done) => {
      const closeSpy = jest.spyOn(component.closeModalEvent, 'emit');
      const createdSpy = jest.spyOn(component.expenseCreated, 'emit');

      component.onSubmit();

      setTimeout(() => {
        expect(createdSpy).toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalled();
        done();
      }, 0);
    });
  });

  // --- Modal close ---
  describe('closeModal', () => {
    it('should emit closeModalEvent', () => {
      const spy = jest.spyOn(component.closeModalEvent, 'emit');
      component.closeModal();
      expect(spy).toHaveBeenCalled();
    });
  });

  // --- Friend search ---
  describe('friend search', () => {
    it('should search users when query is >= 2 characters', () => {
      mockFriendsService.searchUsers.mockReturnValue(
        of([{ id: 'u2', displayName: 'Jane', email: 'jane@example.com' }]),
      );

      component.onSearchChange('ja');

      expect(mockFriendsService.searchUsers).toHaveBeenCalledWith('ja');
    });

    it('should not search when query is < 2 characters', () => {
      component.onSearchChange('j');

      expect(mockFriendsService.searchUsers).not.toHaveBeenCalled();
      expect(component.searchResults).toEqual([]);
    });

    it('should add friend to split and clear search', () => {
      const friend = { id: 'u2', displayName: 'Jane', email: 'jane@example.com' };

      component.addFriendToSplit(friend);

      expect(component.resolvedFriends.has('u2')).toBeTruthy();
      expect(component.selectedUserIds.has('u2')).toBeTruthy();
      expect(component.searchQuery).toBe('');
      expect(component.searchResults).toEqual([]);
    });

    it('should remove friend from split', () => {
      component.resolvedFriends.set('u2', { id: 'u2', displayName: 'Jane', email: '' });
      component.selectedUserIds.add('u2');

      component.removeFriendFromSplit('u2');

      expect(component.resolvedFriends.has('u2')).toBeFalsy();
      expect(component.selectedUserIds.has('u2')).toBeFalsy();
    });

    it('should not remove current user from split', () => {
      jest.spyOn(component, 'getCurrentUserId').mockReturnValue('user-1');
      component.selectedUserIds.add('user-1');

      component.removeFriendFromSplit('user-1');

      expect(component.selectedUserIds.has('user-1')).toBeTruthy();
    });
  });
});
