import { Component, Input, Output, EventEmitter, inject, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { jwtDecode } from 'jwt-decode';

@Component({
  selector: 'app-create-expense-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-expense-modal.component.html'
})
export class CreateExpenseModalComponent implements OnChanges {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  @Input() groupId!: string;
  @Input() groupCurrency!: string;
  @Input() members: any[] = [];

  @Output() expenseCreated = new EventEmitter<void>();
  @Output() closeModalEvent = new EventEmitter<void>();

  selectedUserIds = new Set<string>();
  isSubmitting = false;
  errorMessage = '';

  expenseForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: [''],
    amountTotal: [null as number | null, [Validators.required, Validators.min(0.01)]],
    currency: ['', [Validators.required]],
    category: ['Food & Drinks', [Validators.required, Validators.maxLength(64)]],
    expenseDate: [this.getTodayDateString(), [Validators.required]],
    paidByUserId: ['', [Validators.required]],
  });

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
      const decoded = jwtDecode<any>(token);
      return decoded.userId || null;
    } catch {
      return null;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['members'] && this.members) {
      this.selectedUserIds.clear();
      this.members.forEach(m => {
        if (m.joinStatus === 'active' || m.joinStatus === 'invited') {
          this.selectedUserIds.add(m.user.id);
        }
      });
      
      const currentUserId = this.getCurrentUserId();
      if (currentUserId && this.members.some(m => m.user.id === currentUserId)) {
        this.expenseForm.patchValue({ paidByUserId: currentUserId });
      } else if (this.members.length > 0) {
        this.expenseForm.patchValue({ paidByUserId: this.members[0].user.id });
      }
    }
    if (changes['groupCurrency'] && this.groupCurrency) {
      this.expenseForm.patchValue({ currency: this.groupCurrency });
    }
  }

  toggleParticipant(userId: string) {
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  closeModal() {
    this.closeModalEvent.emit();
  }

  onSubmit() {
    if (this.expenseForm.valid && this.selectedUserIds.size > 0) {
      this.isSubmitting = true;
      this.errorMessage = '';

      const formValue = this.expenseForm.value;
      const splits = Array.from(this.selectedUserIds).map(userId => ({
        participantUserId: userId,
        splitType: 'equal' as const,
        shareValue: 1
      }));

      const payload = {
        title: formValue.title,
        description: formValue.description,
        amountTotal: formValue.amountTotal,
        currency: formValue.currency,
        category: formValue.category,
        expenseDate: formValue.expenseDate,
        paidByUserId: formValue.paidByUserId,
        groupId: this.groupId,
        splits: splits
      };

      this.http.post<any>('/api/expenses', payload).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.expenseCreated.emit();
          this.closeModal();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMessage = err.error?.message || 'Failed to create expense. Please try again.';
        }
      });
    }
  }
}
