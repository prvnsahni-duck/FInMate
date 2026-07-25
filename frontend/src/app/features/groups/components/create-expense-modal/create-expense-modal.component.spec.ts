import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CreateExpenseModalComponent } from './create-expense-modal.component';
import { ExpensesService } from '../../services/expenses.service';
import { FriendsService } from '../../../../features/friends/services/friends.service';
import { of, throwError } from 'rxjs';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';

describe('CreateExpenseModalComponent', () => {
  let component: CreateExpenseModalComponent;
  let fixture: ComponentFixture<CreateExpenseModalComponent>;
  let mockExpensesService: any;
  let mockFriendsService: any;
  let mockGroupKeyService: any;
  let mockStore: any;
  let mockEncryptionService: any;

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

    const mockCryptoKey = {} as CryptoKey;
    mockGroupKeyService = {
      getGroupDataKey: jest.fn().mockResolvedValue(mockCryptoKey),
      createGroupKey: jest.fn().mockResolvedValue(mockCryptoKey),
      resolveGroupKey: jest
        .fn()
        .mockResolvedValue({ status: 'ready', key: mockCryptoKey }),
      createAndStoreGroupKey: jest.fn().mockResolvedValue(mockCryptoKey),
      rateLimitError: jest.fn().mockReturnValue(null),
    };

    mockStore = {
      selectSnapshot: jest
        .fn()
        .mockImplementation((selector: (state: any) => unknown) =>
          selector({ auth: { user: { email: 'test@example.com' } } }),
        ),
    };

    mockEncryptionService = {
      loadKeyFromSession: jest.fn().mockResolvedValue(mockCryptoKey),
      generateDataKey: jest.fn().mockResolvedValue(mockCryptoKey),
      encryptBytes: jest.fn().mockResolvedValue('encrypted-bytes'),
      encrypt: jest.fn().mockResolvedValue('encrypted-value'),
      wrapKey: jest.fn().mockResolvedValue('wrapped-key'),
    };

    await TestBed.configureTestingModule({
      imports: [CreateExpenseModalComponent, HttpClientTestingModule],
      providers: [
        { provide: ExpensesService, useValue: mockExpensesService },
        { provide: FriendsService, useValue: mockFriendsService },
        { provide: GroupKeyService, useValue: mockGroupKeyService },
        { provide: Store, useValue: mockStore },
        { provide: ClientEncryptionService, useValue: mockEncryptionService },
      ],
    }).compileComponents();

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
      expect(
        titleControl?.hasError('maxLength') ||
          titleControl?.hasError('maxlength'),
      ).toBeTruthy();
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
      const readSpy = jest
        .spyOn(FileReader.prototype, 'readAsArrayBuffer')
        .mockImplementation(function (this: FileReader) {
          Object.defineProperty(this, 'result', {
            value: new ArrayBuffer(8),
            configurable: true,
          });
          this.onload?.(new ProgressEvent('load'));
        });

      const file = new File(['receipt'], 'receipt.jpg', {
        type: 'image/jpeg',
      });
      const mockEvent = {
        target: {
          files: [file],
        },
      } as any;

      component.onFileSelected(mockEvent);
      expect(component.attachedFiles).toHaveLength(1);
      expect(component.attachedFiles[0].name).toBe('receipt.jpg');
      readSpy.mockRestore();
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

    it('should call createExpense when form is valid and no existing expense', async () => {
      await component.onSubmit();

      expect(mockExpensesService.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Expense',
          amountTotal: 100,
          currency: 'USD',
          groupId: 'group-1',
        }),
      );
    });

    it('should call updateExpense when editing an existing expense', async () => {
      component.expense = {
        id: 'exp-1',
        version: 2,
      } as any;

      await component.onSubmit();

      expect(mockExpensesService.updateExpense).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          title: 'Test Expense',
          version: 2,
        }),
      );
    });

    it('should not submit when form is invalid', async () => {
      component.expenseForm.patchValue({ title: '' });
      await component.onSubmit();

      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
      expect(mockExpensesService.updateExpense).not.toHaveBeenCalled();
    });

    it('should not submit when no participants are selected', async () => {
      component.selectedUserIds.clear();
      await component.onSubmit();

      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
    });

    it('should set user-friendly error message on failure', async () => {
      mockExpensesService.createExpense.mockReturnValue(
        throwError(() => ({ error: { message: 'Internal server error 500' } })),
      );

      await component.onSubmit();

      expect(component.errorMessage).toBeDefined();
      expect(component.isSubmitting).toBe(false);
    });

    it('should emit expenseCreated and close modal on success', async () => {
      const closeSpy = jest.spyOn(component.closeModalEvent, 'emit');
      const createdSpy = jest.spyOn(component.expenseCreated, 'emit');

      await component.onSubmit();

      expect(createdSpy).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
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
      jest.useFakeTimers();
      try {
        mockFriendsService.searchUsers.mockReturnValue(
          of([{ id: 'u2', displayName: 'Jane', email: 'jane@example.com' }]),
        );

        component.onSearchChange('ja');
        jest.advanceTimersByTime(250);

        expect(mockFriendsService.searchUsers).toHaveBeenCalledWith('ja');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not search when query is < 2 characters', () => {
      component.onSearchChange('j');

      expect(mockFriendsService.searchUsers).not.toHaveBeenCalled();
      expect(component.searchResults).toEqual([]);
    });

    it('should add friend to split and clear search', () => {
      const friend = {
        id: 'u2',
        displayName: 'Jane',
        email: 'jane@example.com',
      };

      component.addFriendToSplit(friend);

      expect(component.resolvedFriends.has('u2')).toBeTruthy();
      expect(component.selectedUserIds.has('u2')).toBeTruthy();
      expect(component.searchQuery).toBe('');
      expect(component.searchResults).toEqual([]);
    });

    it('should remove friend from split', () => {
      component.resolvedFriends.set('u2', {
        id: 'u2',
        displayName: 'Jane',
        email: '',
      });
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

  // --- Group key classification (pending / no_session) ---
  describe('group key resolution', () => {
    const mockCryptoKey = {} as CryptoKey;

    const validForm = () => {
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
    };

    const asOwner = () => {
      component.members = [{ user: { id: 'user-1' }, role: 'owner' } as any];
    };

    const asMember = () => {
      component.members = [{ user: { id: 'user-1' }, role: 'member' } as any];
    };

    it('ready: uses the resolved key without minting a new one', async () => {
      mockGroupKeyService.resolveGroupKey.mockResolvedValue({
        status: 'ready',
        key: mockCryptoKey,
      });
      validForm();

      await component.onSubmit();

      expect(mockGroupKeyService.createAndStoreGroupKey).not.toHaveBeenCalled();
      expect(mockExpensesService.createExpense).toHaveBeenCalled();
    });

    it('pending + owner/admin: mints the key inline and proceeds', async () => {
      mockGroupKeyService.resolveGroupKey.mockResolvedValue({
        status: 'pending',
      });
      mockGroupKeyService.createAndStoreGroupKey.mockResolvedValue(
        mockCryptoKey,
      );
      validForm();
      asOwner();

      await component.onSubmit();

      expect(mockGroupKeyService.createAndStoreGroupKey).toHaveBeenCalledWith(
        'group-1',
      );
      expect(component.scopeKeyStatus()).toBe('ready');
      expect(mockExpensesService.createExpense).toHaveBeenCalled();
    });

    it('pending + non-owner: does NOT mint and surfaces a friendly error', async () => {
      mockGroupKeyService.resolveGroupKey.mockResolvedValue({
        status: 'pending',
      });
      validForm();
      asMember();

      await component.onSubmit();

      expect(mockGroupKeyService.createAndStoreGroupKey).not.toHaveBeenCalled();
      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
      expect(component.errorMessage).toContain("group key hasn't been shared");
      expect(component.isSubmitting).toBe(false);
    });

    it('no_session: does NOT mint and reports a session-specific error', async () => {
      mockGroupKeyService.resolveGroupKey.mockResolvedValue({
        status: 'no_session',
      });
      validForm();
      asOwner();

      await component.onSubmit();

      expect(mockGroupKeyService.createAndStoreGroupKey).not.toHaveBeenCalled();
      expect(mockExpensesService.createExpense).not.toHaveBeenCalled();
      expect(component.errorMessage).toContain('session key is not loaded');
    });

    it('scopeKeyBlocked/scopeKeyMessage reflect a no_session status', () => {
      component.groupId = 'group-1';
      component.scopeKeyStatus.set('no_session');

      expect(component.scopeKeyBlocked()).toBe(true);
      expect(component.scopeKeyMessage()).toContain(
        'session key is not loaded',
      );
    });

    it('owner/admin facing pending is NOT blocked from submitting', () => {
      component.groupId = 'group-1';
      asOwner();
      component.scopeKeyStatus.set('pending');

      expect(component.scopeKeyBlocked()).toBe(false);
    });

    it('banner auto-clears reactively when status flips to ready', () => {
      component.groupId = 'group-1';
      component.scopeKeyStatus.set('no_session');
      expect(component.scopeKeyBlocked()).toBe(true);

      component.scopeKeyStatus.set('ready');

      expect(component.scopeKeyBlocked()).toBe(false);
      expect(component.scopeKeyMessage()).toBe('');
    });

    it('concurrent resolutions mint the key only once (in-flight guard)', async () => {
      let resolveMint!: (k: CryptoKey) => void;
      mockGroupKeyService.resolveGroupKey.mockResolvedValue({
        status: 'pending',
      });
      mockGroupKeyService.createAndStoreGroupKey.mockReturnValue(
        new Promise<CryptoKey>((res) => {
          resolveMint = res;
        }),
      );
      validForm();
      asOwner();

      const first = component.onSubmit();
      const second = component.onSubmit();
      resolveMint(mockCryptoKey);
      await Promise.all([first, second]);

      expect(mockGroupKeyService.createAndStoreGroupKey).toHaveBeenCalledTimes(
        1,
      );
    });
  });
});
