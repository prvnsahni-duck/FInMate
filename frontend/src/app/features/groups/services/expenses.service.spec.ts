import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ExpensesService } from './expenses.service';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { Store } from '@ngxs/store';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../../../core/constants/crypto.constants';
import { firstValueFrom } from 'rxjs';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let httpMock: HttpTestingController;
  let encryptionServiceSpy: jest.Mocked<ClientEncryptionService>;
  let storeMock: any;

  const mockUser = { email: 'test@finmate.local', userId: 'user-1' };

  beforeEach(() => {
    const encSpy = {
      loadKeyFromSession: jest.fn().mockResolvedValue('mock-crypto-key'),
      encrypt: jest.fn().mockImplementation((val) => Promise.resolve(`enc:${val}`)),
      decryptExpense: jest.fn().mockImplementation((expense) =>
        Promise.resolve({
          ...expense,
          title: expense.title?.replace('enc:', '') || expense.title,
          description: expense.description?.replace('enc:', '') || expense.description,
        }),
      ),
    };

    storeMock = {
      selectSnapshot: jest.fn().mockReturnValue(mockUser),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ExpensesService,
        { provide: ClientEncryptionService, useValue: encSpy },
        { provide: Store, useValue: storeMock },
      ],
    });

    service = TestBed.inject(ExpensesService);
    httpMock = TestBed.inject(HttpTestingController);
    encryptionServiceSpy = TestBed.inject(
      ClientEncryptionService,
    ) as jest.Mocked<ClientEncryptionService>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- getExpenses ---
  describe('getExpenses', () => {
    it('should fetch and decrypt expenses', (done) => {
      const mockData = [
        { id: 'exp-1', title: 'enc:Groceries', description: 'enc:Weekly groceries' },
        { id: 'exp-2', title: 'enc:Rent', description: '' },
      ];

      service.getExpenses('group-1').subscribe((res) => {
        expect(res.data).toHaveLength(2);
        expect(encryptionServiceSpy.decryptExpense).toHaveBeenCalledTimes(2);
        done();
      });

      const req = httpMock.expectOne('/api/expenses?groupId=group-1');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockData, meta: { totalItems: 2 } });
    });

    it('should pass pagination and filter params correctly', (done) => {
      service
        .getExpenses('group-1', {
          page: 2,
          limit: 10,
          category: 'food',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        })
        .subscribe(() => done());

      const req = httpMock.expectOne(
        '/api/expenses?groupId=group-1&page=2&limit=10&category=food&startDate=2026-01-01&endDate=2026-01-31',
      );
      req.flush({ data: [], meta: { totalItems: 0 } });
    });

    it('should return placeholder text when decryption fails — never ciphertext', (done) => {
      encryptionServiceSpy.decryptExpense.mockRejectedValue(
        new Error('Internal decryption error'),
      );

      const mockData = [
        { id: 'exp-1', title: 'abc123:xyz789', description: 'cipher:text' },
      ];

      service.getExpenses('group-1').subscribe((res) => {
        expect(res.data[0].title).toBe(DECRYPTION_FAILED_PLACEHOLDER);
        expect(res.data[0].description).toBe('');
        // Verify no technical message leaks
        expect(res.data[0].title).not.toContain('decrypt');
        expect(res.data[0].title).not.toContain('CryptoKey');
        expect(res.data[0].title).not.toContain('AES');
        done();
      });

      const req = httpMock.expectOne('/api/expenses?groupId=group-1');
      req.flush({ data: mockData });
    });

    it('should return raw data when no encryption key is available', (done) => {
      encryptionServiceSpy.loadKeyFromSession.mockResolvedValue(null);

      const mockData = [
        { id: 'exp-1', title: 'Raw Title', description: 'Raw Desc' },
      ];

      service.getExpenses('group-1').subscribe((res) => {
        expect(res.data[0].title).toBe('Raw Title');
        expect(encryptionServiceSpy.decryptExpense).not.toHaveBeenCalled();
        done();
      });

      const req = httpMock.expectOne('/api/expenses?groupId=group-1');
      req.flush({ data: mockData });
    });

    it('should skip decryption when no user is logged in', (done) => {
      storeMock.selectSnapshot.mockReturnValue(null);

      const mockData = [{ id: 'exp-1', title: 'No User Title' }];

      service.getExpenses('group-1').subscribe((res) => {
        expect(res.data[0].title).toBe('No User Title');
        expect(encryptionServiceSpy.loadKeyFromSession).not.toHaveBeenCalled();
        done();
      });

      const req = httpMock.expectOne('/api/expenses?groupId=group-1');
      req.flush({ data: mockData });
    });
  });

  // --- createExpense ---
  describe('createExpense', () => {
    it('should encrypt payload and decrypt the response', async () => {
      const payload = {
        title: 'Dinner',
        description: 'Team dinner',
        amountTotal: 150,
        currency: 'USD',
        category: 'food',
        expenseDate: '2026-06-28',
        paidByUserId: 'user-1',
        splits: [],
      };

      const promise = firstValueFrom(service.createExpense(payload));

      // Wait for encryptPayload microtask to execute and request to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 0));

      const req = httpMock.expectOne('/api/expenses');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.title).toBe('enc:Dinner');
      req.flush({ id: 'exp-new', title: 'enc:Dinner' });

      const resolvedExpense = await promise;

      expect(resolvedExpense).toBeDefined();
      expect(encryptionServiceSpy.encrypt).toHaveBeenCalledWith(
        'Dinner',
        'mock-crypto-key',
      );
      expect(encryptionServiceSpy.encrypt).toHaveBeenCalledWith(
        'Team dinner',
        'mock-crypto-key',
      );
      expect(encryptionServiceSpy.decryptExpense).toHaveBeenCalled();
    });

    it('should return placeholder on decryption failure for created expense', async () => {
      encryptionServiceSpy.decryptExpense.mockRejectedValue(
        new Error('Bad key'),
      );

      const payload = {
        title: 'Test',
        amountTotal: 10,
        currency: 'USD',
        category: 'other',
        expenseDate: '2026-06-28',
        paidByUserId: 'user-1',
        splits: [],
      };

      const promise = firstValueFrom(service.createExpense(payload));

      // Wait for encryptPayload microtask to execute and request to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 0));

      const req = httpMock.expectOne('/api/expenses');
      req.flush({ id: 'exp-new', title: 'enc:Test' });

      const resolvedExpense = await promise;

      expect(resolvedExpense.title).toBe(DECRYPTION_FAILED_PLACEHOLDER);
    });
  });

  // --- updateExpense ---
  describe('updateExpense', () => {
    it('should encrypt payload, send PATCH, and decrypt the response', async () => {
      const payload = {
        title: 'Updated Dinner',
        amountTotal: 200,
        currency: 'USD',
        category: 'food',
        expenseDate: '2026-06-28',
        paidByUserId: 'user-1',
        splits: [],
        version: 2,
      };

      const promise = firstValueFrom(service.updateExpense('exp-1', payload));

      // Wait for encryptPayload microtask to execute and request to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 0));

      const req = httpMock.expectOne('/api/expenses/exp-1');
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 'exp-1', title: 'enc:Updated Dinner' });

      await promise;

      expect(encryptionServiceSpy.encrypt).toHaveBeenCalledWith(
        'Updated Dinner',
        'mock-crypto-key',
      );
    });
  });


  // --- deleteExpense ---
  describe('deleteExpense', () => {
    it('should send DELETE request', (done) => {
      service.deleteExpense('exp-1').subscribe(() => {
        done();
      });

      const req = httpMock.expectOne('/api/expenses/exp-1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // --- restoreExpense ---
  describe('restoreExpense', () => {
    it('should restore and decrypt the expense', (done) => {
      service.restoreExpense('exp-1').subscribe(() => {
        expect(encryptionServiceSpy.decryptExpense).toHaveBeenCalled();
        done();
      });

      const req = httpMock.expectOne('/api/expenses/exp-1/restore');
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'exp-1', title: 'enc:Restored' });
    });

    it('should return placeholder when restore decryption fails', (done) => {
      encryptionServiceSpy.decryptExpense.mockRejectedValue(
        new Error('Corrupted data'),
      );

      service.restoreExpense('exp-1').subscribe((expense) => {
        expect(expense.title).toBe(DECRYPTION_FAILED_PLACEHOLDER);
        expect(expense.description).toBe('');
        done();
      });

      const req = httpMock.expectOne('/api/expenses/exp-1/restore');
      req.flush({ id: 'exp-1', title: 'cipher:text' });
    });
  });

  // --- Analytics ---
  describe('getMonthlyAnalytics', () => {
    it('should call correct URL without groupId', (done) => {
      service.getMonthlyAnalytics().subscribe(() => done());

      const req = httpMock.expectOne('/api/expenses/analytics/monthly');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('should append groupId query param when provided', (done) => {
      service.getMonthlyAnalytics('group-1').subscribe(() => done());

      const req = httpMock.expectOne(
        '/api/expenses/analytics/monthly?groupId=group-1',
      );
      req.flush([]);
    });

    it('should not append groupId when value is "personal"', (done) => {
      service.getMonthlyAnalytics('personal').subscribe(() => done());

      const req = httpMock.expectOne('/api/expenses/analytics/monthly');
      req.flush([]);
    });
  });

  describe('getCategoryAnalytics', () => {
    it('should call correct URL with groupId', (done) => {
      service.getCategoryAnalytics('group-1').subscribe(() => done());

      const req = httpMock.expectOne(
        '/api/expenses/analytics/categories?groupId=group-1',
      );
      req.flush([]);
    });
  });

  // --- Export / Import ---
  describe('exportExpenses', () => {
    it('should request blob for CSV export', (done) => {
      service.exportExpenses('group-1', 'csv').subscribe(() => done());

      const req = httpMock.expectOne(
        '/api/export/expenses?groupId=group-1&format=csv',
      );
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob());
    });
  });

  describe('importExpenses', () => {
    it('should POST FormData', (done) => {
      const formData = new FormData();
      service.importExpenses(formData).subscribe(() => done());

      const req = httpMock.expectOne('/api/import/expenses');
      expect(req.request.method).toBe('POST');
      req.flush(null);
    });
  });

  // --- Error message non-technical validation ---
  describe('error messages are non-technical', () => {
    it('should never expose technical terms in decryption failure output', (done) => {
      encryptionServiceSpy.decryptExpense.mockRejectedValue(
        new Error('OperationError: AES-GCM decrypt failed on CryptoKey'),
      );

      service.getExpenses('group-1').subscribe((res) => {
        const title = res.data[0].title;
        const desc = res.data[0].description;
        const combined = `${title} ${desc}`;

        expect(combined).not.toMatch(/decrypt/i);
        expect(combined).not.toMatch(/CryptoKey/i);
        expect(combined).not.toMatch(/AES/i);
        expect(combined).not.toMatch(/IndexedDB/i);
        expect(combined).not.toMatch(/\d{3}/); // No HTTP status codes
        done();
      });

      const req = httpMock.expectOne('/api/expenses?groupId=group-1');
      req.flush({ data: [{ id: 'exp-1', title: 'cipher' }] });
    });
  });
});
