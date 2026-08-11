import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { PeopleService } from '../../services/people.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';

/**
 * Simple lend/borrow form — no group selection. "Lent" = I gave money to this
 * person (they owe me); "Borrowed" = I received money (I owe them). The backend
 * normalises direction; on success the parent re-fetches the person detail.
 */
@Component({
  selector: 'app-add-transaction-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SubmitButtonComponent],
  templateUrl: './add-transaction-modal.component.html',
})
export class AddTransactionModalComponent {
  private fb = inject(FormBuilder);
  private peopleService = inject(PeopleService);

  readonly userId = input.required<string>();
  readonly personName = input.required<string>();
  readonly currency = input<string>('INR');

  readonly saved = output<void>();
  readonly closed = output<void>();

  readonly isSaving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    entryType: ['lend' as 'lend' | 'borrow', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    occurredOn: [new Date().toISOString().slice(0, 10), Validators.required],
    note: [''],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.isSaving.set(true);
    this.errorMsg.set(null);
    this.peopleService
      .createTransaction(this.userId(), {
        entryType: v.entryType,
        amount: v.amount as number,
        currency: this.currency(),
        occurredOn: v.occurredOn,
        note: v.note?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.saved.emit();
        },
        error: (err: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.errorMsg.set(
            err?.error?.message ?? 'Could not save the transaction. Please try again.',
          );
        },
      });
  }
}
