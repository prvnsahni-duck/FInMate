import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { optimisticLockInterceptor } from './interceptors/optimistic-lock.interceptor';
import { jwtInterceptor } from './interceptors/jwt.interceptor';
import { provideStore } from '@ngxs/store';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { AuthState } from './state/auth.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([jwtInterceptor, optimisticLockInterceptor])),
    provideStore(
      [AuthState], // Register AuthState
      withNgxsReduxDevtoolsPlugin(),
      withNgxsLoggerPlugin()
    )
  ],
};
