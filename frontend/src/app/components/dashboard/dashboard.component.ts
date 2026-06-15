import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth.state';
import { HttpClient } from '@angular/common/http';
import { CreateExpenseModalComponent } from '../groups/create-expense-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CreateExpenseModalComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private store = inject(Store);
  private http = inject(HttpClient);

  userName = 'User';
  totalBalance = 0;
  monthlyExpenses = 0;
  activeGroupsCount = 0;
  personalExpenses: any[] = [];
  isExpenseModalOpen = false;
  isLoading = true;

  // Track edit mode
  selectedExpenseForEdit: any = null;

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
    this.http.get<any>('/api/expenses?groupId=personal').subscribe({
      next: (res) => {
        this.personalExpenses = res.data || [];
        // Personal balance is simply the sum of all personal expenses logged
        this.totalBalance = this.personalExpenses.reduce((sum, e) => sum + Number(e.amountTotal), 0);
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });

    // 2. Fetch monthly summary for personal analytics
    this.http.get<any[]>('/api/expenses/analytics/monthly').subscribe({
      next: (res) => {
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        const currentMonthData = res.find(r => r.month === currentMonthStr);
        this.monthlyExpenses = currentMonthData ? currentMonthData.total : 0;
      },
      error: () => {}
    });

    // 3. Fetch active groups to count them
    this.http.get<any>('/api/groups').subscribe({
      next: (res) => {
        this.activeGroupsCount = res.meta?.totalItems || res.data?.length || 0;
      },
      error: () => {}
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

  deleteExpense(expenseId: string) {
    if (confirm('Are you sure you want to delete this personal expense?')) {
      this.http.delete(`/api/expenses/${expenseId}`).subscribe({
        next: () => this.fetchData(),
        error: (err) => alert(err.error?.message || 'Failed to delete expense')
      });
    }
  }
}
