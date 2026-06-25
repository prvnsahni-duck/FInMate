import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { RecurringExpensesService } from './recurring-expenses.service';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';

describe('RecurringExpensesService', () => {
  let service: RecurringExpensesService;
  let httpMock: HttpTestingController;
  let encryptionServiceSpy: jest.Mocked<ClientEncryptionService>;

  const storeMock = {
    selectSnapshot: jest
      .fn()
      .mockImplementation(() => ({ email: 'test@finmate.local' })),
  };

  beforeEach(() => {
    const encSpy = {
      loadKeyFromSession: jest.fn().mockResolvedValue('test-key'),
      encrypt: jest.fn().mockResolvedValue('encrypted-value'),
      decryptExpense: jest
        .fn()
        .mockImplementation((val) => Promise.resolve(val)),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        RecurringExpensesService,
        { provide: ClientEncryptionService, useValue: encSpy },
        { provide: Store, useValue: storeMock },
      ],
    });

    service = TestBed.inject(RecurringExpensesService);
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

  it('should fetch recurring expenses and decrypt them', (done) => {
    const mockData = [{ id: '1', title: 'enc-title', description: 'enc-desc' }];

    service.getRecurringExpenses('group-1').subscribe((data) => {
      expect(data).toHaveLength(1);
      expect(encryptionServiceSpy.decryptExpense).toHaveBeenCalled;
      done();
    });

    const req = httpMock.expectOne('/api/recurring-expenses?groupId=group-1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockData });
  });
});
