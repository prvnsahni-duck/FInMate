import { Component, input, output } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { Expense } from '@finmate/data-models';

@Component({
  selector: 'app-group-trash',
  standalone: true,
  imports: [DatePipe, CurrencyPipe],
  template: `
    <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
      <h2 class="text-xl font-bold mb-6">Deleted Expenses (Trash)</h2>
      
      @if (deletedExpenses().length === 0) {
        <div class="text-center py-12">
          <p class="text-slate-500 dark:text-slate-400">No deleted expenses found in this group.</p>
        </div>
      } @else {
        <div class="space-y-4">
          @for (item of deletedExpenses(); track item.id) {
            <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
              <div>
                <h4 class="font-bold text-slate-800 dark:text-white">{{ item.title }}</h4>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Deleted: {{ item.deletedAt | date }} • Original: {{ item.amountTotal | currency:groupCurrency() }}
                </p>
              </div>
              
              @if (!isViewer()) {
                <button (click)="restore.emit(item.id)" class="py-1.5 px-3 bg-gradient-neon text-white rounded-xl text-xs font-semibold shadow hover:shadow-lg transition-all flex items-center space-x-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5"></path>
                  </svg>
                  <span>Restore</span>
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class GroupTrashComponent {
  deletedExpenses = input.required<Expense[]>();
  groupCurrency = input.required<string>();
  isViewer = input.required<boolean>();

  restore = output<string>();
}
