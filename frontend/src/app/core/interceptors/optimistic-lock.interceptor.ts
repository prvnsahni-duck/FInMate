import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, map, switchMap, throwError } from 'rxjs';
import { AutomergeService } from '../services/automerge.service';
import { ConflictModalService } from '../services/conflict-modal.service';
import { ConflictErrorResponse } from '../../shared/models/conflict.types';

/**
 * Global HTTP interceptor that handles `412 CON_VERSION_CONFLICT` responses.
 *
 * Flow:
 * 1. Non-412 errors are passed through unchanged.
 * 2. On 412 CON_VERSION_CONFLICT:
 *    a. Fetch the latest server state via GET (bypassing other interceptors).
 *    b. Detect overlapping fields between the local PATCH payload and server state.
 *    c. No overlap  → auto-merge and silently retry the PATCH.
 *    d. Overlap     → open the ConflictDiffModal, await user resolution, then
 *                     retry or rethrow based on the user's choice.
 */
export const optimisticLockInterceptor: HttpInterceptorFn = (req, next) => {
  // All inject() calls MUST happen here — at the top of the interceptor function —
  // because this is the only Angular injection context available to an
  // HttpInterceptorFn. Calling inject() inside catchError or switchMap operators
  // would throw a NullInjectorError and would not capture the testing backend.
  const automerge = inject(AutomergeService);
  const modalService = inject(ConflictModalService);
  const bypassClient = new HttpClient(inject(HttpBackend));

  return next(req).pipe(
    catchError((error: unknown) => {
      // Only handle HttpErrorResponse with status 412
      if (!(error instanceof HttpErrorResponse) || error.status !== 412) {
        return throwError(() => error);
      }

      const conflictError = error.error as Partial<ConflictErrorResponse>;
      if (conflictError?.errorCode !== 'CON_VERSION_CONFLICT') {
        return throwError(() => error);
      }

      const localPayload = (req.body ?? {}) as Record<string, unknown>;
      const localVersion = (localPayload['version'] as number) ?? 0;

      return bypassClient.get<Record<string, unknown>>(req.url).pipe(
        map((res: any) => res?.success === true && res?.data !== undefined ? res.data : res),
        switchMap((serverState) => {
          const overlappingFields = automerge.detectOverlap(
            localPayload,
            serverState,
          );

          if (overlappingFields.length === 0) {
            // ── Auto-merge path ──────────────────────────────────────────────
            const merged = automerge.merge(serverState, localPayload, []);
            const retryReq = req.clone({
              body: { ...merged, version: serverState['version'] },
            });
            return next(retryReq);
          }

          // ── Manual resolution path ───────────────────────────────────────
          return modalService
            .open({
              resourceUrl: req.url,
              localPayload,
              serverState,
              localVersion,
              overlappingFields,
            })
            .pipe(
              switchMap((resolution) => {
                if (resolution.strategy === 'cancelled') {
                  return throwError(() => error);
                }
                const retryReq = req.clone({ body: resolution.mergedPayload });
                return next(retryReq);
              }),
            );
        }),
      );
    }),
  );
};
