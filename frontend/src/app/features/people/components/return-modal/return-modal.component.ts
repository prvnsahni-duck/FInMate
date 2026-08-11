import {
  Component,
  inject,
  input,
  output,
  signal,
  OnInit,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { PeopleService } from '../../services/people.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';

/**
 * Settlement ("Return") form. Prefills the full outstanding amount and allows a
 * partial value. Client-side validation blocks over-settlement for good UX, but
 * the backend remains authoritative (it also rejects over-settlement).
 */
@Component({
  selector: 'app-return-modal',
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, SubmitButtonComponent],
  templateUrl: './return-modal.component.html',
})
export class ReturnModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private peopleService = inject(PeopleService);

  readonly userId = input.required<string>();
  readonly personName = input.required<string>();
  /** Absolute outstanding amount for the given currency. */
  readonly outstanding = input.required<number>();
  readonly currency = input<string>('INR');
  /** Drives the wording so it is never ambiguous about who pays whom. */
  readonly direction = input<'owes_you' | 'you_owe'>('owes_you');

  /** e.g. "Record a return from Naveen" vs "Settle up with Naveen". */
  title(): string {
    return this.direction() === 'you_owe'
      ? `Settle up with ${this.personName()}`
      : `Record a return from ${this.personName()}`;
  }

  /** Confirm-button label — "Record return" vs "Confirm payment". */
  confirmLabel(): string {
    return this.direction() === 'you_owe' ? 'Confirm payment' : 'Record return';
  }

  readonly saved = output<void>();
  readonly closed = output<void>();

  readonly isSaving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    occurredOn: [new Date().toISOString().slice(0, 10), Validators.required],
    note: [''],
  });

  ngOnInit(): void {
    this.form.controls.amount.setValue(this.outstanding());
  }

  /** True when the entered amount exceeds the outstanding balance. */
  isOverLimit(): boolean {
    const v = this.form.controls.amount.value;
    return v != null && v > this.outstanding() + 1e-9;
  }

  submit(): void {
    if (this.form.invalid || this.isOverLimit()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.isSaving.set(true);
    this.errorMsg.set(null);
    this.peopleService
      .createSettlement(this.userId(), {
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
            err?.error?.message ?? 'Could not record the settlement. Please try again.',
          );
        },
      });
  }
}
