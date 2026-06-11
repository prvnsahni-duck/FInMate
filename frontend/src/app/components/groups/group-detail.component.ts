import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreateExpenseModalComponent } from './create-expense-modal.component';
import { jwtDecode } from 'jwt-decode';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, CreateExpenseModalComponent],
  template: `
    <div *ngIf="isLoading" class="animate-pulse">
      <div class="h-10 bg-slate-200 dark:bg-white/5 rounded-xl w-1/3 mb-4"></div>
      <div class="h-6 bg-slate-200 dark:bg-white/5 rounded-xl w-1/4 mb-10"></div>
      <div class="h-64 bg-slate-200 dark:bg-white/5 rounded-3xl"></div>
    </div>

    <div *ngIf="!isLoading && group">
      <div class="flex items-center justify-between mb-8">
        <div>
          <a routerLink="/groups" class="text-sm font-semibold text-finmate-neon2 hover:underline mb-2 inline-flex items-center">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Back to Groups
          </a>
          <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            {{ group.name }}
            <span class="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 align-middle">
              {{ group.currency }}
            </span>
          </h1>
          <p class="text-slate-500 dark:text-slate-400 mt-2">{{ group.description }}</p>
        </div>
        
        <button (click)="openExpenseModal()" class="py-2 px-4 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 transition-all flex items-center space-x-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
          <span class="hidden sm:inline">Add Expense</span>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Main Ledger -->
        <div class="lg:col-span-2">
          <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-6">Expenses Ledger</h2>
            
            <div *ngIf="expenses.length === 0" class="text-center py-12">
              <p class="text-slate-500 dark:text-slate-400">No expenses recorded yet.</p>
            </div>

            <div *ngIf="expenses.length > 0" class="space-y-4">
              <div *ngFor="let expense of expenses" class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-finmate-neon/30 transition-colors">
                <div class="flex items-center space-x-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5 flex items-center justify-center">
                    <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                  </div>
                  <div>
                    <h4 class="font-bold">{{ expense.title }}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400">{{ expense.expenseDate | date }} • {{ expense.category }}</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-bold text-lg">{{ expense.amountTotal | currency:group.currency }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Paid by {{ getUserName(expense.paidByUserId) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar (Balances & Members) -->
        <div class="space-y-8">
          <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-4">Your Balance</h2>
            <div class="text-3xl font-bold mb-2" [ngClass]="{'text-green-500 dark:text-green-400': userBalance > 0, 'text-red-500 dark:text-red-400': userBalance < 0, 'text-slate-500': userBalance === 0}">
              {{ userBalance > 0 ? '+' : '' }}{{ userBalance | currency:group.currency }}
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {{ userBalance > 0 ? 'You are owed by the group.' : (userBalance < 0 ? 'You owe the group.' : 'You are all settled up!') }}
            </p>
          </div>

          <!-- Suggested Settlements -->
          <div *ngIf="suggestedSettlements.length > 0" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-4">Suggested Settlements</h2>
            <div class="space-y-3">
              <div *ngFor="let s of suggestedSettlements" class="text-sm p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span class="font-semibold">{{ getUserName(s.fromUserId) }}</span> owes <span class="font-semibold">{{ getUserName(s.toUserId) }}</span>
                <div class="text-lg font-bold text-finmate-neon mt-1">{{ s.amount | currency:s.currency }}</div>
              </div>
            </div>
          </div>

          <!-- Group Members -->
          <div *ngIf="members.length > 0" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-4">Group Members</h2>
            <div class="space-y-4">
              <div *ngFor="let member of members" class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center font-bold text-xs">
                    {{ (member.user.displayName || member.user.email).substring(0, 2).toUpperCase() }}
                  </div>
                  <div>
                    <h4 class="font-semibold text-sm">{{ member.user.displayName || member.user.email }}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 capitalize">{{ member.role }}</p>
                  </div>
                </div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [ngClass]="{'bg-green-500/10 text-green-500': member.joinStatus === 'active', 'bg-yellow-500/10 text-yellow-500': member.joinStatus === 'invited'}">
                  {{ member.joinStatus }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <app-create-expense-modal
      *ngIf="isExpenseModalOpen"
      [groupId]="group.id"
      [groupCurrency]="group.currency"
      [members]="members"
      (closeModalEvent)="closeExpenseModal()"
      (expenseCreated)="onExpenseCreated()"
    ></app-create-expense-modal>
  `
})
export class GroupDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  group: any;
  expenses: any[] = [];
  isLoading = true;

  // Modal and Sidebar State
  isExpenseModalOpen = false;
  members: any[] = [];
  balances: any[] = [];
  userBalance = 0;
  suggestedSettlements: any[] = [];

  ngOnInit() {
    const groupId = this.route.snapshot.paramMap.get('id');
    if (groupId) {
      this.http.get<any>(`/api/groups/${groupId}`).subscribe({
        next: (res) => {
          this.group = res;
          this.fetchExpenses(groupId);
          this.fetchMembers(groupId);
          this.fetchBalances(groupId);
        },
        error: () => this.isLoading = false
      });
    }
  }

  fetchExpenses(groupId: string) {
    this.http.get<any>(`/api/expenses?groupId=${groupId}`).subscribe({
      next: (res) => {
        this.expenses = res.data;
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });
  }

  fetchMembers(groupId: string) {
    this.http.get<any[]>(`/api/groups/${groupId}/members`).subscribe({
      next: (res) => {
        this.members = res;
      },
      error: () => {}
    });
  }

  fetchBalances(groupId: string) {
    this.http.get<any>(`/api/groups/${groupId}/settlements/balances`).subscribe({
      next: (res) => {
        this.balances = res.balances;
        this.suggestedSettlements = res.suggestedSettlements;
        
        // Find current user's balance
        const currentUserId = this.getCurrentUserId();
        const myBalanceEntry = res.balances.find((b: any) => b.userId === currentUserId && b.currency === this.group.currency);
        this.userBalance = myBalanceEntry ? myBalanceEntry.netBalance : 0;
      },
      error: () => {}
    });
  }

  getCurrentUserId(): string | null {
    const token = localStorage.getItem('finmate_token');
    if (!token) return null;
    try {
      const decoded = jwtDecode<any>(token);
      return decoded.userId || null;
    } catch {
      return null;
    }
  }

  getUserName(userId: string): string {
    const member = this.members.find(m => m.user.id === userId);
    return member ? (member.user.displayName || member.user.email) : 'Unknown User';
  }

  openExpenseModal() {
    this.isExpenseModalOpen = true;
  }

  closeExpenseModal() {
    this.isExpenseModalOpen = false;
  }

  onExpenseCreated() {
    if (this.group?.id) {
      this.fetchExpenses(this.group.id);
      this.fetchBalances(this.group.id);
    }
  }
}
