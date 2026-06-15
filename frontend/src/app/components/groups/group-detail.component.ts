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
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
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
            <span *ngIf="group.groupType === 'household'" class="px-3 py-1 bg-blue-500/10 rounded-full text-sm font-semibold text-blue-500 align-middle capitalize">
              {{ group.groupType }}
            </span>
          </h1>
          <p class="text-slate-500 dark:text-slate-400 mt-2">{{ group.description }}</p>
        </div>
        
        <div class="flex items-center gap-3">
          <!-- Import File -->
          <label *ngIf="!isMonthLocked && !isViewer" class="cursor-pointer py-2 px-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold border border-slate-200 dark:border-white/10 transition-all flex items-center space-x-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            <span>Import</span>
            <input type="file" (change)="onImportFileSelected($event)" accept=".csv,.xlsx" class="hidden">
          </label>

          <button *ngIf="!isMonthLocked && !isViewer" (click)="openExpenseModal()" class="py-2 px-4 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 transition-all flex items-center space-x-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      <!-- Household timeline selector -->
      <div *ngIf="group.groupType === 'household'" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-4 mb-8 shadow-xl shadow-black/5 flex items-center justify-between">
        <button (click)="changeMonth(-1)" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div class="text-center">
          <span class="text-lg font-bold text-slate-800 dark:text-white">{{ getMonthDisplayName() }}</span>
          <span *ngIf="isMonthLocked" class="ml-2 text-xs font-semibold px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full">Locked (Read-Only)</span>
        </div>
        <button (click)="changeMonth(1)" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      <!-- Household Carry-Forward section -->
      <div *ngIf="group.groupType === 'household' && carryForwardBalances.length > 0" class="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 mb-8">
        <h3 class="text-sm font-bold text-blue-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Carry-Forward Extra Balances
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div *ngFor="let m of carryForwardBalances" class="p-3 bg-white/50 dark:bg-black/25 rounded-2xl border border-slate-100 dark:border-white/5">
            <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{{ m.displayName }}</p>
            <p class="text-lg font-bold" [ngClass]="{'text-green-500 dark:text-green-400': m.netBalance > 0, 'text-red-500 dark:text-red-400': m.netBalance < 0, 'text-slate-500': m.netBalance === 0}">
              {{ m.netBalance > 0 ? '+' : '' }}{{ m.netBalance | currency:group.currency }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Main Panel: Ledger / History / Trash -->
        <div class="lg:col-span-2 space-y-8">
          
          <!-- Tabs Navigation -->
          <div class="flex space-x-1 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200 dark:border-white/5">
            <button (click)="setActiveTab('ledger')" [class]="activeTab === 'ledger' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
              Ledger
            </button>
            <button (click)="setActiveTab('history')" [class]="activeTab === 'history' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
              History
            </button>
            <button (click)="setActiveTab('trash')" [class]="activeTab === 'trash' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
              Trash
            </button>
          </div>

          <!-- TAB: Ledger -->
          <div *ngIf="activeTab === 'ledger'" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-bold">Expenses Ledger</h2>
              <div class="flex space-x-2">
                <button (click)="exportLedger('csv')" class="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400">Export CSV</button>
                <button (click)="exportLedger('xlsx')" class="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400">Export Excel</button>
              </div>
            </div>
            
            <div *ngIf="expenses.length === 0" class="text-center py-12">
              <p class="text-slate-500 dark:text-slate-400">No expenses recorded for this month.</p>
            </div>

            <div *ngIf="expenses.length > 0" class="space-y-4">
              <div *ngFor="let expense of expenses" class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-finmate-neon/30 transition-colors">
                <div class="flex items-center space-x-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5 flex items-center justify-center">
                    <!-- Dynamic category icon -->
                    <svg *ngIf="expense.category === 'Food & Drinks'" class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <svg *ngIf="expense.category === 'Travel'" class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    <svg *ngIf="expense.category === 'Utilities'" class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    <svg *ngIf="expense.category === 'Entertainment'" class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>
                    <svg *ngIf="expense.category !== 'Food & Drinks' && expense.category !== 'Travel' && expense.category !== 'Utilities' && expense.category !== 'Entertainment'" class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                  </div>
                  <div>
                    <h4 class="font-bold flex items-center gap-2">
                      {{ expense.title }}
                      <span *ngIf="expense.status === 'void'" class="px-2 py-0.5 bg-slate-200 dark:bg-white/10 text-[10px] rounded text-slate-500 dark:text-slate-400 capitalize">{{ expense.status }}</span>
                    </h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400">{{ expense.expenseDate | date }} • {{ expense.category }}</p>
                  </div>
                </div>
                
                <div class="flex items-center space-x-4">
                  <div class="text-right">
                    <p class="font-bold text-lg" [ngStyle]="{'text-decoration': expense.status === 'void' ? 'line-through' : 'none'}">{{ expense.amountTotal | currency:group.currency }}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Paid by {{ getUserName(expense.paidByUserId) }}</p>
                  </div>
                  
                  <!-- Ledger Actions -->
                  <div *ngIf="!isMonthLocked && !isViewer && expense.status !== 'void'" class="flex space-x-1">
                    <button (click)="openExpenseModal(expense)" class="p-2 text-slate-400 hover:text-finmate-neon2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button (click)="deleteExpense(expense.id)" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: History (Audit logs) -->
          <div *ngIf="activeTab === 'history'" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-6">Group History Audit Log</h2>
            
            <div *ngIf="historyLogs.length === 0" class="text-center py-12">
              <p class="text-slate-500 dark:text-slate-400">No history logged yet.</p>
            </div>

            <div *ngIf="historyLogs.length > 0" class="space-y-4">
              <div *ngFor="let log of historyLogs" class="flex items-start space-x-3 text-sm p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center font-bold text-xs shrink-0 text-slate-500">
                  {{ (log.actorDisplayName || 'System').substring(0, 2).toUpperCase() }}
                </div>
                <div class="flex-1">
                  <p class="text-slate-700 dark:text-slate-300">
                    <span class="font-bold text-slate-900 dark:text-white">{{ log.actorDisplayName || 'System' }}</span>
                    {{ getLogMessage(log) }}
                  </p>
                  <p class="text-[10px] text-slate-400 mt-1">{{ log.createdAt | date:'medium' }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: Trash (Deleted expenses) -->
          <div *ngIf="activeTab === 'trash'" class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
            <h2 class="text-xl font-bold mb-6">Deleted Expenses (Trash)</h2>
            
            <div *ngIf="deletedExpenses.length === 0" class="text-center py-12">
              <p class="text-slate-500 dark:text-slate-400">No deleted expenses found in this group.</p>
            </div>

            <div *ngIf="deletedExpenses.length > 0" class="space-y-4">
              <div *ngFor="let item of deletedExpenses" class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <div>
                  <h4 class="font-bold text-slate-800 dark:text-white">{{ item.title }}</h4>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Deleted: {{ item.deletedAt | date }} • Original: {{ item.amountTotal | currency:group.currency }}</p>
                </div>
                
                <button *ngIf="!isViewer" (click)="restoreExpense(item.id)" class="py-1.5 px-3 bg-gradient-neon text-white rounded-xl text-xs font-semibold shadow hover:shadow-lg transition-all flex items-center space-x-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5"></path></svg>
                  <span>Restore</span>
                </button>
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
      [expense]="selectedExpenseForEdit"
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

  // Active Tab State
  activeTab: 'ledger' | 'history' | 'trash' = 'ledger';

  // Modal and Sidebar State
  isExpenseModalOpen = false;
  selectedExpenseForEdit: any = null;
  members: any[] = [];
  balances: any[] = [];
  userBalance = 0;
  suggestedSettlements: any[] = [];

  // Group History and Trash logs
  historyLogs: any[] = [];
  deletedExpenses: any[] = [];

  // Household variables
  currentTimelineMonth = new Date();
  isMonthLocked = false;
  carryForwardBalances: any[] = [];

  // Role permissions
  isViewer = false;

  ngOnInit() {
    const groupId = this.route.snapshot.paramMap.get('id');
    if (groupId) {
      this.http.get<any>(`/api/groups/${groupId}`).subscribe({
        next: (res) => {
          this.group = res;
          this.fetchExpenses(groupId);
          this.fetchMembers(groupId);
          this.fetchBalances(groupId);
          this.fetchHistoryLogs(groupId);
          this.fetchDeletedExpenses(groupId);
          if (res.groupType === 'household') {
            this.fetchCarryForward(groupId);
          }
        },
        error: () => this.isLoading = false
      });
    }
  }

  getCurrentMonthString(): string {
    const y = this.currentTimelineMonth.getFullYear();
    const m = String(this.currentTimelineMonth.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  getMonthDisplayName(): string {
    return this.currentTimelineMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  changeMonth(delta: number) {
    if (this.group?.groupType !== 'household') return;
    this.currentTimelineMonth.setMonth(this.currentTimelineMonth.getMonth() + delta);
    this.currentTimelineMonth = new Date(this.currentTimelineMonth); // trigger change
    
    // Evaluate month locking: past months are immutable
    const todayMonth = new Date();
    const isPast = (this.currentTimelineMonth.getFullYear() < todayMonth.getFullYear()) ||
                   (this.currentTimelineMonth.getFullYear() === todayMonth.getFullYear() &&
                    this.currentTimelineMonth.getMonth() < todayMonth.getMonth());
    this.isMonthLocked = isPast;

    if (this.group?.id) {
      this.fetchExpenses(this.group.id);
      this.fetchCarryForward(this.group.id);
    }
  }

  fetchExpenses(groupId: string) {
    let url = `/api/expenses?groupId=${groupId}`;
    if (this.group?.groupType === 'household') {
      const activeMonth = this.getCurrentMonthString();
      const start = `${activeMonth}-01`;
      const end = `${activeMonth}-31`;
      url += `&startDate=${start}&endDate=${end}`;
    }

    this.http.get<any>(url).subscribe({
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
        
        // Find viewer role permission
        const currentUserId = this.getCurrentUserId();
        const myMember = res.find(m => m.user.id === currentUserId);
        this.isViewer = myMember?.role === 'viewer';
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

  fetchHistoryLogs(groupId: string) {
    this.http.get<any>(`/api/groups/${groupId}/history`).subscribe({
      next: (res) => {
        this.historyLogs = res.data || [];
      },
      error: () => {}
    });
  }

  fetchDeletedExpenses(groupId: string) {
    this.http.get<any>(`/api/groups/${groupId}/expenses/deleted`).subscribe({
      next: (res) => {
        this.deletedExpenses = res.data || [];
      },
      error: () => {}
    });
  }

  fetchCarryForward(groupId: string) {
    const month = this.getCurrentMonthString();
    this.http.get<any[]>(`/api/groups/${groupId}/carry-forward?month=${month}`).subscribe({
      next: (res) => {
        this.carryForwardBalances = res || [];
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

  setActiveTab(tab: 'ledger' | 'history' | 'trash') {
    this.activeTab = tab;
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
    if (this.group?.id) {
      this.fetchExpenses(this.group.id);
      this.fetchBalances(this.group.id);
      this.fetchHistoryLogs(this.group.id);
      this.fetchDeletedExpenses(this.group.id);
      if (this.group.groupType === 'household') {
        this.fetchCarryForward(this.group.id);
      }
    }
  }

  deleteExpense(expenseId: string) {
    if (confirm('Are you sure you want to delete or void this expense?')) {
      this.http.delete(`/api/expenses/${expenseId}`).subscribe({
        next: () => this.onExpenseCreated(),
        error: (err) => alert(err.error?.message || 'Failed to delete expense')
      });
    }
  }

  restoreExpense(expenseId: string) {
    this.http.post(`/api/expenses/${expenseId}/restore`, {}).subscribe({
      next: () => {
        alert('Expense restored successfully!');
        this.onExpenseCreated();
      },
      error: (err) => alert(err.error?.message || 'Failed to restore expense')
    });
  }

  exportLedger(format: 'csv' | 'xlsx') {
    this.http.get(`/api/export/expenses?groupId=${this.group.id}&format=${format}`, {
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledger-${this.group.name}-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => alert('Failed to export ledger: ' + (err.error?.message || err.message))
    });
  }

  onImportFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupId', this.group.id);

      this.http.post('/api/import/expenses', formData).subscribe({
        next: () => {
          alert('Expenses imported successfully!');
          this.onExpenseCreated();
        },
        error: (err) => alert(err.error?.message || 'Import failed. Check file format.')
      });
    }
  }

  getLogMessage(log: any): string {
    const act = log.action;
    const title = log.metadata?.title || log.metadata?.newTitle || 'an expense';
    const amt = log.metadata?.amountTotal ? ` (${log.metadata.amountTotal} ${log.metadata.currency || ''})` : '';
    if (act === 'expense.created') return `created expense "${title}"${amt}`;
    if (act === 'expense.updated') return `updated expense to "${title}"${amt}`;
    if (act === 'expense.deleted') return `deleted expense "${title}"${amt}`;
    if (act === 'expense.restored') return `restored expense "${title}"`;
    return `performed action "${act}"`;
  }
}
