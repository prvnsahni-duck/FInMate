import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatsCardComponent } from '../../../../shared/components/stats-card/stats-card.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe, StatsCardComponent, IconComponent],
  templateUrl: './dashboard-home.component.html'
})
export class DashboardHomeComponent {
  @Input() userName = '';
  @Input() totalBalance = 0;
  @Input() monthlyExpenses = 0;
  @Input() activeGroupsCount = 0;
  @Input() personalExpenses: any[] = [];
  @Input() pendingInvitations: any[] = [];
  @Input() categoryAnalytics: any[] = [];
  @Input() userProfile: any = null;
  @Input() isLoading = false;
  
  @Input() isEditingIncome = false;
  @Input() newIncome = 0;
  @Output() newIncomeChange = new EventEmitter<number>();
  @Input() newBudget = 0;
  @Output() newBudgetChange = new EventEmitter<number>();
  
  @Input() incomePercentage = 0;
  @Input() budgetPercentage = 0;
  @Input() incomeProgressWidth = 0;
  @Input() budgetProgressWidth = 0;
  @Input() isBudgetExceeded = false;

  @Output() openExpenseModalEvent = new EventEmitter<{ expense?: any; category?: string }>();
  @Output() toggleEditIncomeEvent = new EventEmitter<void>();
  @Output() saveIncomeEvent = new EventEmitter<void>();
  @Output() acceptInvitationEvent = new EventEmitter<any>();
  @Output() declineInvitationEvent = new EventEmitter<any>();
  @Output() confirmDeleteExpenseEvent = new EventEmitter<string>();

  // SVG Icon Paths
  bankIconPath = 'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z';
  creditCardIconPath = 'M19 4H5a3 3 0 00-3 3v10a3 3 0 003 3h14a3 3 0 003-3V7a3 3 0 00-3-3zM5 6h14a1 1 0 011 1v2H4V7a1 1 0 011-1zm14 12H5a1 1 0 01-1-1v-5h16v5a1 1 0 01-1 1z';
  usersIconPath = 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75';
  cogIconPath = 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z';
  bellIconPath = 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0';
  inboxIconPath = 'M20 12h-4l-3 3h-2l-3-3H4V6h16v6z M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z';

  getCategoryBadgeClass(category: string): string {
    switch (category) {
      case 'Food & Drinks':
        return 'bg-success/10 text-success border border-success/20';
      case 'Travel':
        return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20';
      case 'Utilities':
        return 'bg-accent/10 text-accent border border-accent/20';
      case 'Entertainment':
        return 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20';
      case 'Shopping':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20';
      case 'Housing':
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
      default:
        return 'bg-secondary/10 text-secondary/75 border border-secondary/20';
    }
  }

  getCategoryIconPath(category: string): string {
    switch (category) {
      case 'Food & Drinks':
        return 'M17 2v7h2V2h2v7a4 4 0 01-4 4v9h-2v-9a4 4 0 01-4-4V2h2v7h2V2h2z M6 2v8h2v12H6v-12H4V2h2z';
      case 'Travel':
        return 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z';
      case 'Utilities':
        return 'M13 10V3L4 14h7v7l9-11h-7z';
      case 'Entertainment':
        return 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M10 8l7 4-7 4V8z';
      case 'Shopping':
        return 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z';
      case 'Housing':
        return 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6';
      default:
        return 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2';
    }
  }
}
