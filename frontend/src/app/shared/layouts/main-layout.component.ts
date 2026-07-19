import { Component, signal, inject, DestroyRef } from '@angular/core';
import {
  RouterOutlet,
  RouterLink,
  Router,
  NavigationEnd,
} from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { APP_NAME } from '../../core/constants/app.constants';
import { ExpensesUiStore } from '../../features/groups/services/expenses-ui.store';
import { IconComponent } from '../components/icon/icon.component';
import { NgClass } from '@angular/common';
import { Store } from '@ngxs/store';
import { AuthState, SetPersistenceWarning } from '../../core/auth/auth.state';
import {
  APP_HTTP_ERROR_EVENT,
  AppHttpErrorEventDetail,
} from '../../core/interceptors/error.interceptor';

const THEME_STORAGE_KEY = 'finmate_theme';

export interface NavItem {
  path: string;
  label: string;
  mobileLabel: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Home',
    mobileLabel: 'Home',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    path: '/dashboard',
    label: 'Analytics',
    mobileLabel: 'Stats',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2zm9-6V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    path: '/dashboard',
    label: 'Goals',
    mobileLabel: 'Goals',
    icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 17a5 5 0 100-10 5 5 0 000 10z M12 14a2 2 0 100-4 2 2 0 000 4z',
  },
  {
    path: '/groups',
    label: 'Groups',
    mobileLabel: 'Groups',
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  },
  {
    path: '/dashboard',
    label: 'Settings',
    mobileLabel: 'Settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    path: '/dashboard',
    label: 'Profile',
    mobileLabel: 'Profile',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
];

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, IconComponent, NgClass],
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent {
  appName = APP_NAME;
  themeState = signal<'light' | 'dark'>('light');
  navItems = NAV_ITEMS;
  activeTab = signal<string>('Home');
  private expensesUiStore = inject(ExpensesUiStore);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private store = inject(Store);

  persistenceWarning = toSignal(
    this.store.select(AuthState.getPersistenceWarning),
  );

  rateLimitError = signal<string | null>(null);

  dismissWarning() {
    this.store.dispatch(new SetPersistenceWarning(null));
  }

  sunIconPath =
    'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41';
  moonIconPath = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

  constructor() {
    if (typeof window !== 'undefined') {
      const storedTheme =
        (localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark') ||
        'light';
      this.themeState.set(storedTheme);
      this.applyTheme(storedTheme);

      window.addEventListener(APP_HTTP_ERROR_EVENT, (event: any) => {
        const detail = event.detail as AppHttpErrorEventDetail;
        if (detail.status === 429) {
          this.rateLimitError.set(
            detail.message ||
              'Too many requests. Please slow down and try again later.',
          );
          setTimeout(() => this.rateLimitError.set(null), 7000);
        }
      });
    }

    // Track active navigation tab based on route changes
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects || event.url;
        if (url.includes('/groups')) {
          this.activeTab.set('Groups');
          this.expensesUiStore.activeTab.set('Groups');
        } else if (url.includes('/dashboard')) {
          if (this.activeTab() === 'Groups') {
            this.activeTab.set('Home');
            this.expensesUiStore.activeTab.set('Home');
          }
        }
      });
  }

  selectTab(item: NavItem) {
    this.activeTab.set(item.label);
    this.expensesUiStore.activeTab.set(item.label);
  }

  openExpenseModal() {
    if (this.router.url !== '/dashboard') {
      this.router.navigate(['/dashboard']).then(() => {
        this.expensesUiStore.showCreateExpenseModal.set(true);
      });
    } else {
      this.expensesUiStore.showCreateExpenseModal.set(true);
    }
  }

  closeExpenseModal() {
    this.expensesUiStore.showCreateExpenseModal.set(false);
  }

  onExpenseCreated() {
    this.expensesUiStore.expenseCreated$.next();
  }

  setTheme(theme: 'light' | 'dark') {
    this.themeState.set(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      this.applyTheme(theme);
    }
  }

  private applyTheme(theme: 'light' | 'dark') {
    let actualTheme: 'light' | 'dark' = 'light';
    actualTheme = theme;
    document.documentElement.classList.toggle('dark', actualTheme === 'dark');
  }
}
