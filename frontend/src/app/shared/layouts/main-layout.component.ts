import { Component, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { APP_NAME } from '../../core/constants/app.constants';
import { IconComponent } from '../components/icon/icon.component';

const THEME_STORAGE_KEY = 'finmate_theme';

export interface NavItem {
  path: string;
  label: string;
  mobileLabel: string;
  iconPath: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    mobileLabel: 'Home',
    iconPath: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'
  },
  {
    path: '/groups',
    label: 'Groups',
    mobileLabel: 'Groups',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
  },
  {
    path: '/friends',
    label: 'Friends',
    mobileLabel: 'Friends',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
  },
  {
    path: '/profile',
    label: 'Profile',
    mobileLabel: 'Profile',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
  }
];

export const THEME_ICONS = {
  light: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  dark: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
};

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './main-layout.component.html'
})
export class MainLayoutComponent {
  appName = APP_NAME;
  isDarkMode = signal(true);
  navItems = NAV_ITEMS;
  themeIcons = THEME_ICONS;
  desktopNavItems = computed(() => this.navItems.filter(item => item.path !== '/profile'));

  constructor() {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const isDark = storedTheme
        ? storedTheme === 'dark'
        : document.documentElement.classList.contains('dark');
      this.isDarkMode.set(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    }
  }

  toggleTheme() {
    this.isDarkMode.update(v => !v);
    const isDark = this.isDarkMode();
    document.documentElement.classList.toggle('dark', isDark);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }
}
