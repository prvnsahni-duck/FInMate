import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { NgClass, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreateExpenseModalComponent } from '../../components/create-expense-modal/create-expense-modal.component';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { AnalyticsChartsComponent } from '../../components/analytics-charts/analytics-charts.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { GroupsService } from '../../services/groups.service';
import { ExpensesService } from '../../services/expenses.service';
import { Subscription } from 'rxjs';
import { Group, GroupMember, Expense } from '@finmate/data-models';

import { GroupHistoryLogComponent, GroupAuditLog } from '../../components/group-history-log/group-history-log.component';
import { GroupTrashComponent } from '../../components/group-trash/group-trash.component';
import { GroupBalancesComponent, SuggestedSettlement } from '../../components/group-balances/group-balances.component';
import { GroupMembersComponent } from '../../components/group-members/group-members.component';

export interface GroupExpense extends Expense {
  paidByUserId: string;
  ownerUserId: string;
  splits?: any[];
  attachments?: Array<{
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
  }>;
}

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    NgClass,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    CreateExpenseModalComponent,
    FormsModule,
    AnalyticsChartsComponent,
    ConfirmModalComponent,
    GroupHistoryLogComponent,
    GroupTrashComponent,
    GroupBalancesComponent,
    GroupMembersComponent
  ],
  template: `
    @if (isLoading()) {
      <div class="animate-pulse">
        <div class="h-10 bg-slate-200 dark:bg-white/5 rounded-xl w-1/3 mb-4"></div>
        <div class="h-6 bg-slate-200 dark:bg-white/5 rounded-xl w-1/4 mb-10"></div>
        <div class="h-64 bg-slate-200 dark:bg-white/5 rounded-3xl"></div>
      </div>
    }

    @if (!isLoading() && group()) {
      <div>
        <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <a routerLink="/groups" class="text-sm font-semibold text-finmate-neon2 hover:underline mb-2 inline-flex items-center">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              Back to Groups
            </a>
            <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
              {{ group()!.name }}
              <span class="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 align-middle">
                {{ group()!.currency }}
              </span>
              @if (group()!.groupType === 'household') {
                <span class="px-3 py-1 bg-blue-500/10 rounded-full text-sm font-semibold text-blue-500 align-middle capitalize">
                  {{ group()!.groupType }}
                </span>
              }
            </h1>
            <p class="text-slate-500 dark:text-slate-400 mt-2">{{ group()!.description }}</p>
          </div>
          
          <div class="flex items-center gap-3">
            <!-- Import File -->
            @if (!isMonthLocked() && !isViewer()) {
              <label class="cursor-pointer py-2 px-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold border border-slate-200 dark:border-white/10 transition-all flex items-center space-x-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                <span>Import</span>
                <input type="file" (change)="onImportFileSelected($event)" accept=".csv,.xlsx" class="hidden">
              </label>
            }

            @if (!isMonthLocked() && !isViewer()) {
              <button (click)="openExpenseModal()" class="py-2 px-4 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 transition-all flex items-center space-x-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                <span>Add Expense</span>
              </button>
            }
          </div>
        </div>

        <!-- Household timeline selector -->
        @if (group()!.groupType === 'household') {
          <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-4 mb-8 shadow-xl shadow-black/5 flex items-center justify-between">
            <button (click)="changeMonth(-1)" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <div class="text-center">
              <span class="text-lg font-bold text-slate-800 dark:text-white">{{ getMonthDisplayName() }}</span>
              @if (isMonthLocked()) {
                <span class="ml-2 text-xs font-semibold px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full">Locked (Read-Only)</span>
              }
            </div>
            <button (click)="changeMonth(1)" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        }

        <!-- Household Carry-Forward Bar Graph Widget -->
        @if (group()!.groupType === 'household' && carryForwardBalances().length > 0) {
          <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 mb-8 shadow-xl shadow-black/5">
            <h3 class="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <svg class="w-5 h-5 text-finmate-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              Household Target vs. Actual Contribution
            </h3>

            <div class="space-y-6">
              @for (m of carryForwardBalances(); track m.userId) {
                <div>
                  <div class="flex justify-between items-center text-xs font-semibold mb-2">
                    <span class="text-slate-700 dark:text-slate-300 font-bold">{{ m.displayName }}</span>
                    <span class="text-slate-500 dark:text-slate-400">
                      Paid: <span class="text-slate-800 dark:text-white font-bold">{{ m.paid | currency:group()!.currency }}</span> 
                      / Target: <span class="text-slate-800 dark:text-white font-bold">{{ m.expected | currency:group()!.currency }}</span>
                      ({{ m.percentage }}%)
                    </span>
                  </div>

                  <!-- Stacked Bar Graph -->
                  <div class="w-full bg-slate-100 dark:bg-white/5 rounded-full h-4 overflow-hidden flex">
                    @if (m.netBalance > 0) {
                      <!-- Base target segment -->
                      <div class="bg-gradient-neon h-full transition-all duration-500" 
                           [style.width.%]="(m.expected / getMaxCarryForwardValue()) * 100">
                      </div>
                      <!-- Over-contributed segment (green) -->
                      <div class="bg-green-500 h-full flex items-center justify-end px-2 text-[9px] font-bold text-white transition-all duration-500" 
                           [style.width.%]="(m.netBalance / getMaxCarryForwardValue()) * 100">
                        +{{ m.netBalance | currency:group()!.currency }}
                      </div>
                    } @else if (m.netBalance < 0) {
                      <!-- Paid segment -->
                      <div class="bg-gradient-neon h-full transition-all duration-500" 
                           [style.width.%]="(m.paid / getMaxCarryForwardValue()) * 100">
                      </div>
                      <!-- Under-contributed segment (red/orange) -->
                      <div class="bg-orange-500 h-full flex items-center justify-end px-2 text-[9px] font-bold text-white transition-all duration-500" 
                           [style.width.%]="((m.netBalance < 0 ? -m.netBalance : m.netBalance) / getMaxCarryForwardValue()) * 100">
                        -{{ (m.netBalance < 0 ? -m.netBalance : m.netBalance) | currency:group()!.currency }}
                      </div>
                    } @else {
                      <!-- Fully met target -->
                      <div class="bg-gradient-neon h-full transition-all duration-500" 
                           [style.width.%]="(m.expected / getMaxCarryForwardValue()) * 100">
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Panel: Ledger / History / Trash -->
          <div class="lg:col-span-2 space-y-8">
            
            <!-- Tabs Navigation -->
            <div class="flex space-x-1 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200 dark:border-white/5">
              <button (click)="setTab('ledger')" [class]="activeTab() === 'ledger' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
                Ledger
              </button>
              <button (click)="setTab('analytics')" [class]="activeTab() === 'analytics' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
                Analytics
              </button>
              <button (click)="setTab('history')" [class]="activeTab() === 'history' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
                History
              </button>
              <button (click)="setTab('trash')" [class]="activeTab() === 'trash' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
                Trash
              </button>
              @if (isOwnerOrAdmin()) {
                <button (click)="setTab('settings')" [class]="activeTab() === 'settings' ? 'bg-white dark:bg-finmate-card shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'" class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">
                  Settings
                </button>
              }
            </div>

            <!-- TAB: Ledger -->
            @if (activeTab() === 'ledger') {
              <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
                <div class="flex items-center justify-between mb-6">
                  <h2 class="text-xl font-bold">Expenses Ledger</h2>
                  <div class="flex space-x-2">
                    <button (click)="exportLedger('csv')" class="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400">Export CSV</button>
                    <button (click)="exportLedger('xlsx')" class="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400">Export Excel</button>
                  </div>
                </div>

                <!-- Filters Row (Only for normal group ledger) -->
                @if (group()!.groupType !== 'household') {
                  <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-black/10 border border-slate-200/50 dark:border-white/5">
                    <div>
                      <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Category</label>
                      <select [ngModel]="filterCategory()" (ngModelChange)="filterCategory.set($event); applyFilters()" class="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none cursor-pointer">
                        <option value="">All Categories</option>
                        @for (cat of categories; track cat) {
                          <option [value]="cat">{{ cat }}</option>
                        }
                      </select>
                    </div>
                    <div>
                      <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Start Date</label>
                      <input type="date" [ngModel]="filterStartDate()" (ngModelChange)="filterStartDate.set($event); applyFilters()" class="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none">
                    </div>
                    <div>
                      <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">End Date</label>
                      <input type="date" [ngModel]="filterEndDate()" (ngModelChange)="filterEndDate.set($event); applyFilters()" class="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none">
                    </div>
                    <div class="flex items-end">
                      <button (click)="resetFilters()" class="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all">
                        Clear Filters
                      </button>
                    </div>
                  </div>
                }
                
                @if (expenses().length === 0) {
                  <div class="text-center py-12">
                    <p class="text-slate-500 dark:text-slate-400">No expenses recorded for the selected filters.</p>
                  </div>
                } @else {
                  <div class="space-y-4">
                    @for (expense of expenses(); track expense.id) {
                      <div class="flex flex-col p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-finmate-neon/30 transition-colors">
                        <div class="flex items-center justify-between w-full">
                          <div class="flex items-center space-x-4">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5 flex items-center justify-center">
                              <!-- Dynamic category icon -->
                              @if (expense.category === 'Food & Drinks') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                              } @else if (expense.category === 'Travel') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                              } @else if (expense.category === 'Utilities') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                              } @else if (expense.category === 'Entertainment') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>
                              } @else if (expense.category === 'Shopping') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                              } @else if (expense.category === 'Housing') {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                              } @else {
                                <svg class="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                              }
                            </div>
                            <div>
                              <h4 class="font-bold flex items-center gap-2">
                                {{ expense.title }}
                                @if (expense.status === 'void') {
                                  <span class="px-2 py-0.5 bg-slate-200 dark:bg-white/10 text-[10px] rounded text-slate-500 dark:text-slate-400 capitalize">{{ expense.status }}</span>
                                }
                              </h4>
                              <p class="text-xs text-slate-500 dark:text-slate-400">{{ expense.expenseDate | date }} • {{ expense.category }}</p>
                            </div>
                          </div>
                          
                          <div class="flex items-center space-x-4">
                            <div class="text-right">
                              <p class="font-bold text-lg" [style.text-decoration]="expense.status === 'void' ? 'line-through' : 'none'">{{ expense.amountTotal | currency:group()!.currency }}</p>
                              <p class="text-xs text-slate-500 dark:text-slate-400">Paid by {{ getUserName(expense.paidByUserId) }}</p>
                            </div>
                            
                            <!-- Ledger Actions -->
                            @if (!isMonthLocked() && !isViewer() && expense.status !== 'void' && (isOwnerOrAdmin() || expense.ownerUserId === currentUserId() || expense.paidByUserId === currentUserId())) {
                              <div class="flex space-x-1">
                                <button (click)="openExpenseModal(expense)" class="p-2 text-slate-400 hover:text-finmate-neon2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all">
                                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                                <button (click)="confirmDeleteExpense(expense.id)" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                              </div>
                            }
                          </div>
                        </div>

                        <!-- Expense Attachments (Mock Decryption flow) -->
                        @if (expense.attachments && expense.attachments.length > 0) {
                          <div class="mt-3 flex flex-wrap gap-2 border-t border-slate-100 dark:border-white/5 pt-2.5">
                            @for (file of expense.attachments; track file.storageKey) {
                              <div (click)="downloadAttachment(file)" class="flex items-center space-x-1.5 py-1 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer border border-slate-200/50 dark:border-white/5">
                                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                                <span class="truncate max-w-[120px]">{{ file.originalName }}</span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                <!-- Pagination Controls (Only for normal group ledger) -->
                @if (group()!.groupType !== 'household' && expenses().length > 0 && totalExpenses() > pageSize()) {
                  <div class="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                    <button [disabled]="currentPage() === 1" (click)="changePage(-1)" class="py-1.5 px-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all">
                      Previous
                    </button>
                    <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Page {{ currentPage() }} of {{ totalPages() }}
                    </span>
                    <button [disabled]="currentPage() * pageSize() >= totalExpenses()" (click)="changePage(1)" class="py-1.5 px-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all">
                      Next
                    </button>
                  </div>
                }
              </div>
            }

            <!-- TAB: Analytics -->
            @if (activeTab() === 'analytics') {
              <div>
                <app-analytics-charts [groupId]="group()!.id" [currency]="group()!.currency"></app-analytics-charts>
              </div>
            }

            <!-- TAB: History (Audit logs) -->
            @if (activeTab() === 'history') {
              <app-group-history-log [historyLogs]="historyLogs()"></app-group-history-log>
            }

            <!-- TAB: Trash (Deleted expenses) -->
            @if (activeTab() === 'trash') {
              <app-group-trash
                [deletedExpenses]="deletedExpenses()"
                [groupCurrency]="group()!.currency"
                [isViewer]="isViewer()"
                (restore)="restoreExpense($event)"
              ></app-group-trash>
            }

            <!-- TAB: Settings -->
            @if (activeTab() === 'settings') {
              <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5 space-y-8 animate-fadeIn">
                <!-- Group Settings Form -->
                <div>
                  <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
                    <svg class="w-5 h-5 text-finmate-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Group Settings
                  </h2>

                  <form (submit)="saveGroupSettings(); $event.preventDefault()" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Group Name</label>
                        <input type="text" [(ngModel)]="editGroupName" name="editGroupName" required class="w-full text-sm px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none">
                      </div>

                      <div>
                        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Currency</label>
                        <select [(ngModel)]="editGroupCurrency" name="editGroupCurrency" class="w-full text-sm px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none cursor-pointer">
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="INR">INR (₹)</option>
                          <option value="CAD">CAD ($)</option>
                          <option value="AUD">AUD ($)</option>
                          <option value="JPY">JPY (¥)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Description</label>
                      <textarea [(ngModel)]="editGroupDescription" name="editGroupDescription" rows="2" class="w-full text-sm px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none resize-none"></textarea>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Visibility</label>
                        <select [(ngModel)]="editGroupVisibility" name="editGroupVisibility" class="w-full text-sm px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none cursor-pointer">
                          <option value="private">Private</option>
                          <option value="invite_only">Invite Only</option>
                          <option value="public_readonly">Public Read-Only</option>
                        </select>
                      </div>

                      <div class="flex items-center pt-5">
                        <label class="relative flex items-center cursor-pointer select-none">
                          <input type="checkbox" [(ngModel)]="editGroupCarryForward" name="editGroupCarryForward" class="sr-only peer">
                          <div class="w-10 h-6 bg-slate-200 dark:bg-white/10 rounded-full peer peer-focus:ring-2 peer-focus:ring-finmate-neon/50 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-finmate-neon"></div>
                          <span class="ml-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Enable Carry-Forward Roll-overs</span>
                        </label>
                      </div>
                    </div>

                    @if (settingsError) {
                      <div class="text-xs font-semibold text-red-500 bg-red-500/10 p-3 rounded-xl">
                        {{ settingsError }}
                      </div>
                    }

                    @if (settingsSuccess) {
                      <div class="text-xs font-semibold text-green-500 bg-green-500/10 p-3 rounded-xl">
                        {{ settingsSuccess }}
                      </div>
                    }

                    <div class="flex justify-end pt-2">
                      <button type="submit" [disabled]="isSavingSettings" class="py-2 px-6 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 disabled:opacity-50 transition-all flex items-center space-x-2">
                        @if (isSavingSettings) {
                          <span>Saving...</span>
                        } @else {
                          <span>Save Settings</span>
                        }
                      </button>
                    </div>
                  </form>
                </div>

                <!-- Monthly Household Contribution Settings -->
                @if (group()!.groupType === 'household') {
                  <div class="border-t border-slate-100 dark:border-white/5 pt-8">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 class="text-lg font-bold flex items-center gap-2">
                          <svg class="w-5 h-5 text-finmate-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                          Household Target Contributions
                        </h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure each member's target monthly contribution share (must total exactly 100%).</p>
                      </div>
                      
                      <div class="flex items-center space-x-2">
                        <label class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Month</label>
                        <input type="month" [(ngModel)]="contributionMonth" (ngModelChange)="loadContributionsForMonth()" class="text-xs px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none cursor-pointer">
                      </div>
                    </div>

                    @if (isLoadingContributions) {
                      <div class="flex items-center justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-finmate-neon"></div>
                      </div>
                    } @else {
                      <div class="space-y-4">
                        <div class="bg-slate-50 dark:bg-black/10 border border-slate-200/50 dark:border-white/5 rounded-2xl p-4 space-y-3">
                          @for (contrib of contributionsList; track contrib.memberId) {
                            <div class="flex items-center justify-between gap-4">
                              <div class="flex flex-col">
                                <span class="text-sm font-bold text-slate-800 dark:text-white">{{ contrib.displayName }}</span>
                                <span class="text-xs text-slate-500 dark:text-slate-400 capitalize">{{ contrib.role }}</span>
                              </div>
                              <div class="flex items-center space-x-2">
                                <input type="number" min="0" max="100" step="0.01" [(ngModel)]="contrib.percentage" class="w-20 text-sm text-right px-2 py-1.5 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-finmate-neon outline-none">
                                <span class="text-sm font-bold text-slate-500">%</span>
                              </div>
                            </div>
                          }
                        </div>

                        <div class="flex items-center justify-between text-sm px-4">
                          <span class="font-bold text-slate-500">Total Contribution percentage:</span>
                          <span [class]="getContributionsSum() === 100 ? 'text-green-500 font-extrabold' : 'text-red-500 font-extrabold'">
                            {{ getContributionsSum() }}%
                          </span>
                        </div>

                        @if (getContributionsSum() !== 100) {
                          <div class="text-xs font-semibold text-orange-500 bg-orange-500/10 p-3 rounded-xl flex items-center gap-2">
                            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span>Total contribution percentages must equal exactly 100% (currently {{ getContributionsSum() }}%).</span>
                          </div>
                        }

                        @if (contributionError) {
                          <div class="text-xs font-semibold text-red-500 bg-red-500/10 p-3 rounded-xl">
                            {{ contributionError }}
                          </div>
                        }

                        @if (contributionSuccess) {
                          <div class="text-xs font-semibold text-green-500 bg-green-500/10 p-3 rounded-xl">
                            {{ contributionSuccess }}
                          </div>
                        }

                        <div class="flex justify-end pt-2">
                          <button (click)="saveContributions()" [disabled]="isSavingContributions || getContributionsSum() !== 100" class="py-2 px-6 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center space-x-2">
                            @if (isSavingContributions) {
                              <span>Saving...</span>
                            } @else {
                              <span>Save Contributions</span>
                            }
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

          </div>

          <!-- Sidebar (Balances & Members) -->
          <div class="space-y-8">
            <app-group-balances
              [userBalance]="userBalance()"
              [groupCurrency]="group()!.currency"
              [suggestedSettlements]="suggestedSettlements()"
              [members]="members()"
            ></app-group-balances>

            <app-group-members
              [members]="members()"
              [groupId]="group()!.id"
              [isOwnerOrAdmin]="isOwnerOrAdmin()"
              [inviteToken]="group()!.inviteToken"
              (memberChanged)="fetchMembers(group()!.id)"
            ></app-group-members>
          </div>
        </div>
      </div>
    }

    @if (isExpenseModalOpen()) {
      <app-create-expense-modal
        [groupId]="group()!.id"
        [groupCurrency]="group()!.currency"
        [members]="members()"
        [expense]="selectedExpenseForEdit()"
        (closeModalEvent)="closeExpenseModal()"
        (expenseCreated)="onExpenseCreated()"
      ></app-create-expense-modal>
    }

    @if (isDeleteConfirmOpen()) {
      <app-confirm-modal
        [title]="'Delete Group Expense'"
        [message]="'Are you sure you want to delete or void this expense?'"
        [confirmText]="'Delete'"
        [type]="'danger'"
        (confirm)="onDeleteConfirmed()"
        (cancel)="onDeleteCancelled()"
      ></app-confirm-modal>
    }
  `
})
export class GroupDetailComponent implements OnInit, OnDestroy {
  private groupsService = inject(GroupsService);
  private expensesService = inject(ExpensesService);
  private route = inject(ActivatedRoute);

  private routeSub?: Subscription;

  // Signals for Group State
  group = signal<Group | null>(null);
  expenses = signal<GroupExpense[]>([]);
  members = signal<GroupMember[]>([]);
  balances = signal<any[]>([]);
  userBalance = signal<number>(0);
  suggestedSettlements = signal<SuggestedSettlement[]>([]);
  historyLogs = signal<GroupAuditLog[]>([]);
  deletedExpenses = signal<Expense[]>([]);
  carryForwardBalances = signal<any[]>([]);

  // Signals for UI state
  isLoading = signal<boolean>(true);
  activeTab = signal<'ledger' | 'analytics' | 'history' | 'trash' | 'settings'>('ledger');
  isExpenseModalOpen = signal<boolean>(false);
  isDeleteConfirmOpen = signal<boolean>(false);
  deleteExpenseId = signal<string | null>(null);
  filterCategory = signal<string>('');
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalExpenses = signal<number>(0);
  currentUserId = signal<string | null>(null);
  currentTimelineMonth = signal<Date>(new Date());
  isMonthLocked = signal<boolean>(false);
  isViewer = signal<boolean>(false);

  // Categories list
  categories = ['Food & Drinks', 'Travel', 'Utilities', 'Entertainment', 'Shopping', 'Housing', 'Others'];
  selectedExpenseForEdit = signal<GroupExpense | null>(null);

  isOwnerOrAdmin = computed(() => {
    const userId = this.currentUserId();
    if (!userId) return false;
    const member = this.members().find(m => m.user?.id === userId);
    return member?.role === 'owner' || member?.role === 'admin';
  });

  totalPages = computed(() => {
    return Math.ceil(this.totalExpenses() / this.pageSize()) || 1;
  });

  ngOnInit() {
    this.currentUserId.set(this.getCurrentUserId());
    this.routeSub = this.route.paramMap.subscribe(params => {
      const groupId = params.get('id');
      if (groupId) {
        this.isLoading.set(true);
        this.currentPage.set(1);
        this.filterCategory.set('');
        this.filterStartDate.set('');
        this.filterEndDate.set('');

        this.groupsService.getGroup(groupId).subscribe({
          next: (res) => {
            this.group.set(res);
            this.fetchExpenses(groupId);
            this.fetchMembers(groupId);
            this.fetchBalances(groupId);
            this.fetchHistoryLogs(groupId);
            this.fetchDeletedExpenses(groupId);
            if (res.groupType === 'household') {
              this.fetchCarryForward(groupId);
            }
          },
          error: () => this.isLoading.set(false)
        });
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  getCurrentMonthString(): string {
    const d = this.currentTimelineMonth();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  getMonthDisplayName(): string {
    return this.currentTimelineMonth().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  changeMonth(delta: number) {
    const g = this.group();
    if (g?.groupType !== 'household') return;

    const nextDate = new Date(this.currentTimelineMonth());
    nextDate.setMonth(nextDate.getMonth() + delta);
    this.currentTimelineMonth.set(nextDate);

    const todayMonth = new Date();
    const isPast = (nextDate.getFullYear() < todayMonth.getFullYear()) ||
      (nextDate.getFullYear() === todayMonth.getFullYear() &&
        nextDate.getMonth() < todayMonth.getMonth());
    this.isMonthLocked.set(isPast);

    if (g?.id) {
      this.fetchExpenses(g.id);
      this.fetchCarryForward(g.id);
    }
  }

  fetchExpenses(groupId: string) {
    let start = this.filterStartDate();
    let end = this.filterEndDate();
    const g = this.group();
    if (g?.groupType === 'household') {
      const activeMonth = this.getCurrentMonthString();
      start = `${activeMonth}-01`;
      end = `${activeMonth}-31`;
    }

    this.expensesService.getExpenses(groupId, {
      page: this.currentPage(),
      limit: this.pageSize(),
      category: this.filterCategory(),
      startDate: start,
      endDate: end
    }).subscribe({
      next: (res) => {
        this.expenses.set(res.data as GroupExpense[]);
        this.totalExpenses.set(res.meta?.totalItems || 0);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  fetchMembers(groupId: string) {
    this.groupsService.getMembers(groupId).subscribe({
      next: (res) => {
        this.members.set(res);

        const currentUserId = this.currentUserId();
        const myMember = res.find(m => m.user?.id === currentUserId);
        this.isViewer.set(myMember?.role === 'viewer');
      },
      error: () => { }
    });
  }

  fetchBalances(groupId: string) {
    const g = this.group();
    if (!g) return;
    this.groupsService.getBalances(groupId).subscribe({
      next: (res) => {
        this.balances.set(res.balances);
        this.suggestedSettlements.set(res.suggestedSettlements);

        const currentUserId = this.currentUserId();
        const myBalanceEntry = res.balances.find((b: any) => b.userId === currentUserId && b.currency === g.currency);
        this.userBalance.set(myBalanceEntry ? myBalanceEntry.netBalance : 0);
      },
      error: () => { }
    });
  }

  fetchHistoryLogs(groupId: string) {
    this.groupsService.getHistoryLogs(groupId).subscribe({
      next: (res) => {
        this.historyLogs.set(res.data || []);
      },
      error: () => { }
    });
  }

  fetchDeletedExpenses(groupId: string) {
    this.groupsService.getDeletedExpenses(groupId).subscribe({
      next: (res) => {
        this.deletedExpenses.set(res.data || []);
      },
      error: () => { }
    });
  }

  fetchCarryForward(groupId: string) {
    this.groupsService.getCarryForward(groupId, this.getCurrentMonthString()).subscribe({
      next: (res) => {
        this.carryForwardBalances.set(res || []);
      },
      error: () => { }
    });
  }

  getMaxCarryForwardValue(): number {
    const balances = this.carryForwardBalances();
    if (balances.length === 0) return 1;
    return Math.max(...balances.map(b => Math.max(b.paid || 0, b.expected || 0, 1)));
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
    const member = this.members().find(m => m.user?.id === userId);
    return member ? (member.user.displayName || member.user.email) : 'Unknown User';
  }

  openExpenseModal(expense?: GroupExpense) {
    this.selectedExpenseForEdit.set(expense || null);
    this.isExpenseModalOpen.set(true);
  }

  closeExpenseModal() {
    this.selectedExpenseForEdit.set(null);
    this.isExpenseModalOpen.set(false);
  }

  onExpenseCreated() {
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
      this.fetchBalances(g.id);
      this.fetchHistoryLogs(g.id);
      this.fetchDeletedExpenses(g.id);
      if (g.groupType === 'household') {
        this.fetchCarryForward(g.id);
      }
    }
  }

  confirmDeleteExpense(expenseId: string) {
    this.deleteExpenseId.set(expenseId);
    this.isDeleteConfirmOpen.set(true);
  }

  onDeleteConfirmed() {
    const id = this.deleteExpenseId();
    if (id) {
      this.expensesService.deleteExpense(id).subscribe({
        next: () => {
          this.isDeleteConfirmOpen.set(false);
          this.deleteExpenseId.set(null);
          this.onExpenseCreated();
        },
        error: (err) => {
          this.isDeleteConfirmOpen.set(false);
          this.deleteExpenseId.set(null);
          alert(err.error?.message || 'Failed to delete expense');
        }
      });
    }
  }

  onDeleteCancelled() {
    this.isDeleteConfirmOpen.set(false);
    this.deleteExpenseId.set(null);
  }

  restoreExpense(expenseId: string) {
    this.expensesService.restoreExpense(expenseId).subscribe({
      next: () => {
        alert('Expense restored successfully!');
        this.onExpenseCreated();
      },
      error: (err) => alert(err.error?.message || 'Failed to restore expense')
    });
  }

  exportLedger(format: 'csv' | 'xlsx') {
    const g = this.group();
    if (!g) return;
    this.expensesService.exportExpenses(g.id, format).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledger-${g.name}-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => alert('Failed to export ledger: ' + (err.error?.message || err.message))
    });
  }

  onImportFileSelected(event: any) {
    const g = this.group();
    if (!g) return;
    const file: File = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupId', g.id);

      this.expensesService.importExpenses(formData).subscribe({
        next: () => {
          alert('Expenses imported successfully!');
          this.onExpenseCreated();
        },
        error: (err) => alert(err.error?.message || 'Import failed. Check file format.')
      });
    }
  }

  applyFilters() {
    this.currentPage.set(1);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  resetFilters() {
    this.filterCategory.set('');
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.currentPage.set(1);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  changePage(delta: number) {
    this.currentPage.update(val => val + delta);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  downloadAttachment(file: any) {
    alert(`Downloading attachment: ${file.originalName}\nDecrypted successfully!`);
    const blob = new Blob([`Decrypted content of: ${file.originalName} (${file.storageKey})`], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // Group Settings Form State
  editGroupName = '';
  editGroupDescription = '';
  editGroupVisibility: 'private' | 'invite_only' | 'public_readonly' = 'private';
  editGroupCurrency = 'USD';
  editGroupCarryForward = false;

  isSavingSettings = false;
  settingsError = '';
  settingsSuccess = '';

  // Contributions State
  contributionMonth = new Date().toISOString().slice(0, 7);
  contributionsList: any[] = [];
  isLoadingContributions = false;
  isSavingContributions = false;
  contributionError = '';
  contributionSuccess = '';

  setTab(tab: 'ledger' | 'analytics' | 'history' | 'trash' | 'settings') {
    this.activeTab.set(tab);
    if (tab === 'settings') {
      const g = this.group();
      if (g) {
        this.editGroupName = g.name;
        this.editGroupDescription = g.description || '';
        this.editGroupVisibility = g.visibility || 'private';
        this.editGroupCurrency = g.currency || 'USD';
        this.editGroupCarryForward = g.carryForwardEnabled || false;
        this.loadContributionsForMonth();
      }
    }
  }

  saveGroupSettings() {
    const g = this.group();
    if (!g) return;
    this.isSavingSettings = true;
    this.settingsError = '';
    this.settingsSuccess = '';

    this.groupsService.updateGroup(g.id, {
      name: this.editGroupName,
      description: this.editGroupDescription,
      visibility: this.editGroupVisibility,
      currency: this.editGroupCurrency,
      carryForwardEnabled: this.editGroupCarryForward,
      version: g.version
    }).subscribe({
      next: (res) => {
        this.group.set(res);
        this.isSavingSettings = false;
        this.settingsSuccess = 'Group settings updated successfully!';
        setTimeout(() => this.settingsSuccess = '', 3000);
      },
      error: (err) => {
        this.isSavingSettings = false;
        this.settingsError = err.error?.message || 'Failed to update group settings.';
      }
    });
  }

  loadContributionsForMonth() {
    const g = this.group();
    if (!g) return;
    this.isLoadingContributions = true;
    this.contributionError = '';
    this.contributionSuccess = '';

    this.groupsService.getContributions(g.id, this.contributionMonth).subscribe({
      next: (res) => {
        this.contributionsList = res;
        this.isLoadingContributions = false;
      },
      error: (err) => {
        this.contributionError = err.error?.message || 'Failed to load contributions.';
        this.isLoadingContributions = false;
      }
    });
  }

  getContributionsSum(): number {
    const sum = this.contributionsList.reduce((acc, c) => acc + Number(c.percentage || 0), 0);
    return Math.round(sum * 100) / 100;
  }

  saveContributions() {
    const g = this.group();
    if (!g) return;
    this.isSavingContributions = true;
    this.contributionError = '';
    this.contributionSuccess = '';

    const payload = {
      ledgerMonth: this.contributionMonth,
      contributions: this.contributionsList.map(c => ({
        memberId: c.memberId,
        percentage: Number(c.percentage)
      }))
    };

    this.groupsService.updateContributions(g.id, payload).subscribe({
      next: () => {
        this.isSavingContributions = false;
        this.contributionSuccess = 'Contribution percentages saved successfully!';
        this.fetchCarryForward(g.id);
        setTimeout(() => this.contributionSuccess = '', 3000);
      },
      error: (err) => {
        this.isSavingContributions = false;
        this.contributionError = err.error?.message || 'Failed to save contributions.';
      }
    });
  }
}
