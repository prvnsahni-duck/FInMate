import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { APP_NAME } from '../../core/constants/app.constants';
import { ExpensesService } from '../../features/groups/services/expenses.service';

const THEME_STORAGE_KEY = 'finmate_theme';

export interface NavItem {
  path: string;
  label: string;
  mobileLabel: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Home', mobileLabel: 'Home', icon: '🏠' },
  { path: '/dashboard', label: 'Analytics', mobileLabel: 'Stats', icon: '📊' },
  { path: '/dashboard', label: 'Goals', mobileLabel: 'Goals', icon: '🎯' },
  { path: '/groups', label: 'Groups', mobileLabel: 'Groups', icon: '👥' },
  { path: '/dashboard', label: 'Settings', mobileLabel: 'Settings', icon: '⚙️' },
  { path: '/dashboard', label: 'Profile', mobileLabel: 'Profile', icon: '👤' }
];

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './main-layout.component.html'
})
export class MainLayoutComponent {
  appName = APP_NAME;
  themeState = signal<'light' | 'dark'>('light');
  navItems = NAV_ITEMS;
  activeTab = signal<string>('Home');
  expensesService = inject(ExpensesService);
  private router = inject(Router);

  constructor() {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' || 'light';
      this.themeState.set(storedTheme);
      this.applyTheme(storedTheme);
    }

    // Track active navigation tab based on route changes
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const url = event.urlAfterRedirects || event.url;
        if (url.includes('/groups')) {
          this.activeTab.set('Groups');
          this.expensesService.activeTab.set('Groups');
        } else if (url.includes('/dashboard')) {
          if (this.activeTab() === 'Groups') {
            this.activeTab.set('Home');
            this.expensesService.activeTab.set('Home');
          }
        }
      });
  }

  selectTab(item: NavItem) {
    this.activeTab.set(item.label);
    this.expensesService.activeTab.set(item.label);
  }

  openExpenseModal() {
    if (this.router.url !== '/dashboard') {
      this.router.navigate(['/dashboard']).then(() => {
        this.expensesService.showCreateExpenseModal.set(true);
      });
    } else {
      this.expensesService.showCreateExpenseModal.set(true);
    }
  }

  closeExpenseModal() {
    this.expensesService.showCreateExpenseModal.set(false);
  }

  onExpenseCreated() {
    this.expensesService.expenseCreated$.next();
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
