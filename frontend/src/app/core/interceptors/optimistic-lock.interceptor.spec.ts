import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of } from 'rxjs';
import { optimisticLockInterceptor } from './optimistic-lock.interceptor';
import { AutomergeService } from '../services/automerge.service';
import { ConflictModalService } from '../services/conflict-modal.service';
import { ConflictResolution } from '../../shared/models/conflict.types';

const MOCK_SERVER_STATE = {
  id: 'abc',
  title: 'Server title',
  body: 'Server body',
  version: 2,
};

describe('optimisticLockInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let automerge: AutomergeService;
  let modalService: ConflictModalService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([optimisticLockInterceptor])),
        // provideHttpClientTesting replaces BOTH HttpBackend and the regular
        // HTTP backend with the testing backend, so all requests — including
        // the bypass-client GET — are captured by HttpTestingController.
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    automerge = TestBed.inject(AutomergeService);
    modalService = TestBed.inject(ConflictModalService);
  });

  afterEach(() => httpTesting.verify());

  it('passes through non-412 errors without modification', (done) => {
    http.patch('/api/v1/notes/abc', { title: 'Hi', version: 1 }).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(500);
        done();
      },
    });

    const req = httpTesting.expectOne('/api/v1/notes/abc');
    req.flush(
      { message: 'Server error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
  });

  it('passes through 412 errors with a non-CON_VERSION_CONFLICT errorCode', (done) => {
    http.patch('/api/v1/notes/abc', { title: 'Hi', version: 1 }).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(412);
        done();
      },
    });

    const req = httpTesting.expectOne('/api/v1/notes/abc');
    req.flush(
      { statusCode: 412, errorCode: 'SOME_OTHER_CODE', retryable: false },
      { status: 412, statusText: 'Precondition Failed' },
    );
  });

  it('auto-merges non-overlapping edits and retries the PATCH silently', (done) => {
    jest.spyOn(automerge, 'detectOverlap').mockReturnValue([]); // no overlap
    jest.spyOn(automerge, 'merge').mockReturnValue({
      title: 'My title',
      body: 'Server body',
      version: 2,
    });

    http
      .patch('/api/v1/notes/abc', { title: 'My title', version: 1 })
      .subscribe({
        next: (result) => {
          expect(result).toBeTruthy();
          done();
        },
      });

    // 1 — Original PATCH → 412
    const originalReq = httpTesting.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/v1/notes/abc',
    );
    originalReq.flush(
      { statusCode: 412, errorCode: 'CON_VERSION_CONFLICT', retryable: true },
      { status: 412, statusText: 'Precondition Failed' },
    );

    // 2 — Interceptor GETs the latest state via bypass client
    const fetchReq = httpTesting.expectOne(
      (r) => r.method === 'GET' && r.url === '/api/v1/notes/abc',
    );
    fetchReq.flush(MOCK_SERVER_STATE);

    // 3 — Interceptor retries the PATCH with merged payload
    const retryReq = httpTesting.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/v1/notes/abc',
    );
    retryReq.flush({ ...MOCK_SERVER_STATE, version: 3 });
  });

  it('opens the modal when overlapping fields are detected', (done) => {
    const resolution: ConflictResolution<Record<string, unknown>> = {
      strategy: 'keep-mine',
      mergedPayload: { body: 'My local body', version: 2 },
      newVersion: 2,
    };
    jest.spyOn(automerge, 'detectOverlap').mockReturnValue(['body']);
    jest.spyOn(modalService, 'open').mockReturnValue(of(resolution));

    http
      .patch('/api/v1/notes/abc', { body: 'My local body', version: 1 })
      .subscribe({ next: () => done() });

    // 1 — Original PATCH → 412
    const originalReq = httpTesting.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/v1/notes/abc',
    );
    originalReq.flush(
      { statusCode: 412, errorCode: 'CON_VERSION_CONFLICT', retryable: true },
      { status: 412, statusText: 'Precondition Failed' },
    );

    // 2 — GET latest state
    const fetchReq = httpTesting.expectOne(
      (r) => r.method === 'GET' && r.url === '/api/v1/notes/abc',
    );
    fetchReq.flush(MOCK_SERVER_STATE);

    expect(modalService.open).toHaveBeenCalledWith(
      expect.objectContaining({ overlappingFields: ['body'] }),
    );

    // 3 — Retry PATCH with keep-mine resolution
    const retryReq = httpTesting.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/v1/notes/abc',
    );
    retryReq.flush({ ...MOCK_SERVER_STATE, version: 3 });
  });

  it('rethrows the original 412 error when the user cancels the modal', (done) => {
    const cancelledResolution: ConflictResolution<Record<string, unknown>> = {
      strategy: 'cancelled',
    };
    jest.spyOn(automerge, 'detectOverlap').mockReturnValue(['body']);
    jest.spyOn(modalService, 'open').mockReturnValue(of(cancelledResolution));

    http
      .patch('/api/v1/notes/abc', { body: 'local', version: 1 })
      .subscribe({
        error: (err: HttpErrorResponse) => {
          expect(err.status).toBe(412);
          done();
        },
      });

    // 1 — Original PATCH → 412
    const originalReq = httpTesting.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/v1/notes/abc',
    );
    originalReq.flush(
      { statusCode: 412, errorCode: 'CON_VERSION_CONFLICT', retryable: true },
      { status: 412, statusText: 'Precondition Failed' },
    );

    // 2 — GET latest state
    const fetchReq = httpTesting.expectOne(
      (r) => r.method === 'GET' && r.url === '/api/v1/notes/abc',
    );
    fetchReq.flush(MOCK_SERVER_STATE);

    // No retry PATCH expected — error is rethrown
  });
});
