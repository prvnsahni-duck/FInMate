import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { jwtDecode } from 'jwt-decode';
import { RecurringExpensesService } from '../../services/recurring-expenses.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import {
  CreateRecurringExpenseDto,
  RecurringExpenseSplitInputDto,
  GroupMember,
  JwtPayload,
  UpdateRecurringExpenseDto,
} from '@finmate/data-models';
import {
  DropdownComponent,
  DropdownOption,
} from '../../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'app-recurring-expense-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    SubmitButtonComponent,
    DropdownComponent,
  ],
  templateUrl: './recurring-expense-form.component.html',
  styleUrls: ['./recurring-expense-form.component.css'],
})
export class RecurringExpenseFormComponent implements OnChanges {
  private recurringExpensesService = inject(RecurringExpensesService);
  private fb = inject(FormBuilder);

  currencyOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'INR', label: 'INR (₹)' },
    { value: 'EUR', label: 'EUR (€)' },
  ];

  categoryOptions: DropdownOption[] = [
    { value: 'Food & Drinks', label: 'Food & Drinks' },
    { value: 'Housing & Rent', label: 'Housing & Rent' },
    { value: 'Utilities & Bills', label: 'Utilities & Bills' },
    { value: 'Subscription', label: 'Subscription' },
    { value: 'Travel & Commute', label: 'Travel & Commute' },
    { value: 'Entertainment', label: 'Entertainment' },
    { value: 'Others', label: 'Others' },
  ];

  frequencyOptions: DropdownOption[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
  ];

  get payerOptions(): DropdownOption[] {
    return this.availablePayers.map((p) => ({
      value: p.id,
      label: p.name,
    }));
  }

  @Input() groupId: string | null = null;
  @Input() groupCurrency!: string;
  @Input() members: GroupMember[] = [];
  @Input() template: any | null = null; // For editing existing template

  @Output() saveSuccess = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  selectedUserIds = new Set<string>();
  isSubmitting = false;
  errorMessage = '';

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: [''],
    amountTotal: [
      null as number | null,
      [Validators.required, Validators.min(0.01)],
    ],
    currency: ['', [Validators.required]],
    category: [
      'Food & Drinks',
      [Validators.required, Validators.maxLength(64)],
    ],
    frequency: ['monthly' as const, [Validators.required]],
    startDate: [this.getTodayDateString(), [Validators.required]],
    endDate: [''],
    paidByUserId: ['', [Validators.required]],
  });

  get currencySymbol(): string {
    const cur = this.form.get('currency')?.value;
    if (cur === 'INR') return '₹';
    if (cur === 'EUR') return '€';
    return '$';
  }

  getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getCurrentUserId(): string | null {
    const token = localStorage.getItem('finmate_token');
    if (!token) return null;
    try {
      const decoded = jwtDecode<JwtPayload>(token);
      return decoded.userId || null;
    } catch {
      return null;
    }
  }

  get availablePayers() {
    if (this.groupId) {
      return this.members.map((m) => ({
        id: m.user.id,
        name: m.user.displayName || m.user.email,
      }));
    } else {
      const currentUserId = this.getCurrentUserId();
      return currentUserId ? [{ id: currentUserId, name: 'You' }] : [];
    }
  }

  get availableParticipants() {
    if (this.groupId) {
      return this.members
        .filter((m) => m.role !== 'spectator')
        .map((m) => ({
          id: m.user.id,
          name: m.user.displayName || m.user.email,
        }));
    } else {
      const currentUserId = this.getCurrentUserId();
      return currentUserId ? [{ id: currentUserId, name: 'You' }] : [];
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['template'] && this.template) {
      this.form.patchValue({
        title: this.template.title,
        description: this.template.description || '',
        amountTotal: this.template.amountTotal,
        currency: this.template.currency,
        category: this.template.category,
        frequency: this.template.frequency,
        startDate: this.template.startDate,
        endDate: this.template.endDate || '',
        paidByUserId: this.template.paidByUserId,
      });

      this.selectedUserIds.clear();
      if (this.template.splits) {
        this.template.splits.forEach((s: any) => {
          if (s.participantUserId) {
            this.selectedUserIds.add(s.participantUserId);
          }
        });
      }
      return;
    }

    if (changes['members'] && this.members) {
      this.selectedUserIds.clear();
      this.members.forEach((m) => {
        if (
          (m.joinStatus === 'active' || m.joinStatus === 'invited') &&
          m.role !== 'spectator'
        ) {
          this.selectedUserIds.add(m.user.id);
        }
      });

      const currentUserId = this.getCurrentUserId();
      if (
        currentUserId &&
        this.members.some((m) => m.user.id === currentUserId)
      ) {
        this.form.patchValue({ paidByUserId: currentUserId });
      } else if (this.members.length > 0) {
        this.form.patchValue({ paidByUserId: this.members[0].user.id });
      }
    }

    if (changes['groupCurrency'] && this.groupCurrency) {
      this.form.patchValue({ currency: this.groupCurrency });
    }

    if (!this.groupId) {
      const currentUserId = this.getCurrentUserId();
      if (currentUserId) {
        this.form.patchValue({ paidByUserId: currentUserId, currency: 'USD' });
        this.selectedUserIds.clear();
        this.selectedUserIds.add(currentUserId);
      }
    }
  }

  toggleParticipant(userId: string) {
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  onSubmit() {
    if (this.form.valid && this.selectedUserIds.size > 0) {
      this.isSubmitting = true;
      this.errorMessage = '';

      const val = this.form.value;
      const splits: RecurringExpenseSplitInputDto[] = Array.from(
        this.selectedUserIds,
      ).map((userId) => ({
        participantUserId: userId,
        splitType: 'equal' as const,
        shareValue: 1,
      }));

      const payload: CreateRecurringExpenseDto = {
        title: val.title!,
        description: val.description || undefined,
        amountTotal: val.amountTotal!,
        currency: val.currency!,
        category: val.category!,
        frequency: val.frequency!,
        startDate: val.startDate!,
        endDate: val.endDate || undefined,
        paidByUserId: val.paidByUserId!,
        groupId: this.groupId ?? undefined,
        splits,
      };

      const request$ = this.template
        ? this.recurringExpensesService.updateRecurringExpense(
            this.template.id,
            {
              ...payload,
              version: this.template.version,
            } satisfies UpdateRecurringExpenseDto,
          )
        : this.recurringExpensesService.createRecurringExpense(payload);

      request$.subscribe({
        next: () => {
          this.isSubmitting = false;
          this.saveSuccess.emit();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMessage =
            err.error?.message || 'Failed to save recurring expense';
        },
      });
    }
  }
}
