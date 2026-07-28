import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';
import { ExpenseExportService } from '../../services/expense-export.service';
import {
  ExportFilter,
  ExportFormat,
} from '../../services/export/expense-export.types';

/**
 * Export Transactions dialog (lives under Dashboard, not Profile/Settings).
 *
 * Collects a date range + optional filters, then delegates the actual
 * fetch/decrypt/generate/download to ExpenseExportService. This component owns
 * only form state, validation, and loading/error UI.
 */
@Component({
  selector: 'app-export-transactions-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './export-transactions-modal.component.html',
})
export class ExportTransactionsModalComponent implements OnInit {
  @Input() defaultCurrency = 'USD';
  @Output() closeModalEvent = new EventEmitter<void>();

  private exportService = inject(ExpenseExportService);

  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly currencyOptions = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

  fromDate = '';
  toDate = '';
  type: 'all' | 'personal' | 'group' = 'all';
  category = '';
  status: '' | 'settled' | 'pending' = '';
  currency = '';
  format: ExportFormat = 'xlsx';

  isExporting = false;
  errorMessage = '';

  ngOnInit(): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    this.fromDate = firstOfMonth;
    this.toDate = today;
  }

  /** Returns a validation error message, or null when the form is valid. */
  private validate(): string | null {
    if (!this.fromDate || !this.toDate) {
      return 'Please choose both a from and to date.';
    }
    if (this.fromDate > this.toDate) {
      return 'The "from" date must be on or before the "to" date.';
    }
    return null;
  }

  async onExport(): Promise<void> {
    const error = this.validate();
    if (error) {
      this.errorMessage = error;
      return;
    }

    this.errorMessage = '';
    this.isExporting = true;

    const filter: ExportFilter = {
      from: this.fromDate,
      to: this.toDate,
      type: this.type,
      ...(this.category ? { category: this.category } : {}),
      ...(this.status ? { status: this.status } : {}),
      ...(this.currency ? { currency: this.currency } : {}),
    };

    try {
      await this.exportService.exportExpenses(filter, this.format);
      // Clear the in-flight flag before closing — close() is intentionally a
      // no-op while exporting (to block the Cancel/backdrop mid-download).
      this.isExporting = false;
      this.close();
    } catch (err: unknown) {
      this.errorMessage = this.resolveErrorMessage(err);
      this.isExporting = false;
    }
  }

  private resolveErrorMessage(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return (
      e?.error?.message ||
      e?.message ||
      'Something went wrong while exporting. Please try again.'
    );
  }

  close(): void {
    if (this.isExporting) return;
    this.closeModalEvent.emit();
  }
}
