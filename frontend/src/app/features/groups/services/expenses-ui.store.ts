import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Dedicated UI store for expenses-related presentation state.
 *
 * Extracted from ExpensesService to respect the Single Responsibility Principle:
 * ExpensesService handles HTTP + crypto, this store handles modal/tab state.
 */
@Injectable({
  providedIn: 'root',
})
export class ExpensesUiStore {
  /** Controls the visibility of the create/edit expense modal. */
  showCreateExpenseModal = signal<boolean>(false);

  /** Tracks the active navigation tab label. */
  activeTab = signal<string>('Home');

  /** Emits when a new expense has been successfully created. */
  expenseCreated$ = new Subject<void>();
}
