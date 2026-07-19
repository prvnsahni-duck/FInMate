import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatsCardComponent } from '../../../../shared/components/stats-card/stats-card.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    DatePipe,
    StatsCardComponent,
    IconComponent,
  ],
  templateUrl: './dashboard-home.component.html',
})
export class DashboardHomeComponent {
  @Input() userName = '';
  @Input() totalBalance = 0;
  @Input() monthlyExpenses = 0;
  @Input() activeGroupsCount = 0;
  @Input() personalExpenses: any[] = [];
  @Input() myExpenses: any[] = [];
  @Input() expenseViewFilter: 'all' | 'personal' | 'group_share' = 'all';
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

  @Output() openExpenseModalEvent = new EventEmitter<{
    expense?: any;
    category?: string;
  }>();
  @Output() toggleEditIncomeEvent = new EventEmitter<void>();
  @Output() saveIncomeEvent = new EventEmitter<void>();
  @Output() acceptInvitationEvent = new EventEmitter<any>();
  @Output() declineInvitationEvent = new EventEmitter<any>();
  @Output() confirmDeleteExpenseEvent = new EventEmitter<string>();
  @Output() expenseViewFilterChange = new EventEmitter<'all' | 'personal' | 'group_share'>();
  @Output() openGroupExpenseEvent = new EventEmitter<{ groupId: string; expenseId: string }>();

  get displayExpenses(): any[] {
    return this.myExpenses.length > 0 ? this.myExpenses : this.personalExpenses;
  }

  // SVG Icon Paths
  bankIconPath =
    'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z';
  creditCardIconPath =
    'M19 4H5a3 3 0 00-3 3v10a3 3 0 003 3h14a3 3 0 003-3V7a3 3 0 00-3-3zM5 6h14a1 1 0 011 1v2H4V7a1 1 0 011-1zm14 12H5a1 1 0 01-1-1v-5h16v5a1 1 0 01-1 1z';
  usersIconPath =
    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75';
  cogIconPath =
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z';
  bellIconPath =
    'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0';
  inboxIconPath =
    'M20 12h-4l-3 3h-2l-3-3H4V6h16v6z M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z';

  categoryOptions = CATEGORY_OPTIONS;
}
