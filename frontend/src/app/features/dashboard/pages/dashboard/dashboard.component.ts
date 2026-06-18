import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Store } from '@ngxs/store';
import { AuthState } from '../../../../core/auth/auth.state';
import { CreateExpenseModalComponent } from '../../../groups/components/create-expense-modal/create-expense-modal.component';
import { AnalyticsChartsComponent } from '../../../groups/components/analytics-charts/analytics-charts.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { GroupsService } from '../../../groups/services/groups.service';
import { ExpensesService } from '../../../groups/services/expenses.service';
import { Expense } from '@finmate/data-models';
import { GroupExpense } from '../../../groups/pages/group-detail/group-detail.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, CreateExpenseModalComponent, AnalyticsChartsComponent, ConfirmModalComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private store = inject(Store);
  private groupsService = inject(GroupsService);
  private expensesService = inject(ExpensesService);

  userName = 'User';
  totalBalance = 0;
  monthlyExpenses = 0;
  activeGroupsCount = 0;
  personalExpenses: GroupExpense[] = [];
  isExpenseModalOpen = false;
  isLoading = true;

  // Track edit mode
  selectedExpenseForEdit: GroupExpense | null = null;

  // Confirm delete modal state
  isDeleteConfirmOpen = false;
  deleteExpenseId: string | null = null;

  ngOnInit() {
    const user = this.store.selectSnapshot(AuthState.getUser);
    if (user && user.email) {
      this.userName = user.displayName || user.email.split('@')[0];
    }
    this.fetchData();
  }

  fetchData() {
    this.isLoading = true;

    // 1. Fetch personal expenses
    this.expensesService.getExpenses('personal').subscribe({
      next: (res) => {
        this.personalExpenses = (res.data as GroupExpense[]) || [];
        // Personal balance is simply the sum of all personal expenses logged
        this.totalBalance = this.personalExpenses.reduce((sum, e) => sum + Number(e.amountTotal), 0);
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });

    // 2. Fetch monthly summary for personal analytics
    this.expensesService.getMonthlyAnalytics('personal').subscribe({
      next: (res) => {
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        const currentMonthData = res.find(r => r.month === currentMonthStr);
        this.monthlyExpenses = currentMonthData ? currentMonthData.total : 0;
      },
      error: () => { }
    });

    // 3. Fetch active groups to count them
    this.groupsService.getGroups().subscribe({
      next: (res) => {
        this.activeGroupsCount = res.meta?.totalItems || res.data?.length || 0;
      },
      error: () => { }
    });
  }

  openExpenseModal(expense?: any) {
    this.selectedExpenseForEdit = expense || null;
    this.isExpenseModalOpen = true;
  }

  closeExpenseModal() {
    this.selectedExpenseForEdit = null;
    this.isExpenseModalOpen = false;
  }

  onExpenseCreated() {
    this.fetchData();
  }

  confirmDeleteExpense(expenseId: string) {
    this.deleteExpenseId = expenseId;
    this.isDeleteConfirmOpen = true;
  }

  onDeleteConfirmed() {
    if (this.deleteExpenseId) {
      this.expensesService.deleteExpense(this.deleteExpenseId).subscribe({
        next: () => {
          this.isDeleteConfirmOpen = false;
          this.deleteExpenseId = null;
          this.fetchData();
        },
        error: (err) => {
          this.isDeleteConfirmOpen = false;
          this.deleteExpenseId = null;
          alert(err.error?.message || 'Failed to delete expense');
        }
      });
    }
  }

  onDeleteCancelled() {
    this.isDeleteConfirmOpen = false;
    this.deleteExpenseId = null;
  }
}
