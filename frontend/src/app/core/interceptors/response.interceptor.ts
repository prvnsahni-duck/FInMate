import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

export const responseInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map((event) => {
      if (event instanceof HttpResponse && event.body && typeof event.body === 'object') {
        const body = event.body as any;
        if (body.success === true && body.data !== undefined) {
          return event.clone({ body: body.data });
        }
      }
      return event;
    })
  );
};
