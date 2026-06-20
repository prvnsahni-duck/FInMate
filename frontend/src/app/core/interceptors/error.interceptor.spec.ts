import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_HTTP_ERROR_EVENT, AppHttpErrorEventDetail, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('dispatches a normalized event for structured API errors', (done) => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<AppHttpErrorEventDetail>).detail;
      expect(detail).toEqual({
        status: 400,
        message: 'Invalid amount',
        errorCode: 'VAL_INVALID_INPUT',
        retryable: false,
      });
      window.removeEventListener(APP_HTTP_ERROR_EVENT, listener);
      done();
    };
    window.addEventListener(APP_HTTP_ERROR_EVENT, listener);

    http.get('/api/test').subscribe({
      error: (err: HttpErrorResponse) => expect(err.status).toBe(400),
    });

    const req = httpTesting.expectOne('/api/test');
    req.flush(
      { statusCode: 400, errorCode: 'VAL_INVALID_INPUT', message: 'Invalid amount', retryable: false },
      { status: 400, statusText: 'Bad Request' },
    );
  });
});

