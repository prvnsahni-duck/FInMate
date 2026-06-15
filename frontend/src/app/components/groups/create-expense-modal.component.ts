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

  @Input() groupId: string | null = null;
  @Input() groupCurrency!: string;
  @Input() members: any[] = [];
  @Input() expense?: any; // To support edit mode

  @Output() expenseCreated = new EventEmitter<void>();
  @Output() closeModalEvent = new EventEmitter<void>();

  selectedUserIds = new Set<string>();
  isSubmitting = false;
  errorMessage = '';
  attachedFiles: { name: string; size: string; key: string }[] = [];

  expenseForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: [''],
    amountTotal: [null as number | null, [Validators.required, Validators.min(0.01)]],
    currency: ['', [Validators.required]],
    category: ['Food & Drinks', [Validators.required, Validators.maxLength(64)]],
    expenseDate: [this.getTodayDateString(), [Validators.required]],
    paidByUserId: ['', [Validators.required]],
  });

  get currencySymbol(): string {
    const cur = this.expenseForm.get('currency')?.value;
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
      const decoded = jwtDecode<any>(token);
      return decoded.userId || null;
    } catch {
      return null;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // If edit mode (expense provided)
    if (changes['expense'] && this.expense) {
      this.expenseForm.patchValue({
        title: this.expense.title,
        description: this.expense.description || '',
        amountTotal: this.expense.amountTotal,
        currency: this.expense.currency,
        category: this.expense.category,
        expenseDate: this.expense.expenseDate,
        paidByUserId: this.expense.paidByUserId,
      });

      this.selectedUserIds.clear();
      if (this.expense.splits) {
        this.expense.splits.forEach((s: any) => {
          if (s.participantUserId) {
            this.selectedUserIds.add(s.participantUserId);
          }
        });
      }

      this.attachedFiles = [];
      if (this.expense.attachments) {
        this.expense.attachments.forEach((a: any) => {
          this.attachedFiles.push({
            name: a.originalName,
            size: (a.sizeBytes / 1024).toFixed(1) + ' KB',
            key: a.storageKey
          });
        });
      }
      return;
    }

    if (changes['members'] && this.members) {
      this.selectedUserIds.clear();
      this.members.forEach(m => {
        // SPECTATORS are never part of splits
        if ((m.joinStatus === 'active' || m.joinStatus === 'invited') && m.role !== 'spectator') {
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

    // Personal mode defaulting
    if (!this.groupId) {
      const currentUserId = this.getCurrentUserId();
      if (currentUserId) {
        this.expenseForm.patchValue({ paidByUserId: currentUserId });
        this.selectedUserIds.clear();
        this.selectedUserIds.add(currentUserId);
      }
      if (!this.expenseForm.get('currency')?.value) {
        this.expenseForm.patchValue({ currency: 'USD' });
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

  closeModal() {
    this.closeModalEvent.emit();
  }

  onSubmit() {
    // If personal mode, selectedUserIds should contain only the payer (or current user)
    if (!this.groupId) {
      const currentUserId = this.getCurrentUserId();
      if (currentUserId) {
        this.selectedUserIds.clear();
        this.selectedUserIds.add(currentUserId);
        this.expenseForm.patchValue({ paidByUserId: currentUserId });
      }
    }

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
        groupId: this.groupId || null,
        splits: splits,
        attachmentKeys: this.attachedFiles.map(f => f.key),
        version: this.expense?.version // Send version if updating
      };

      const request$ = this.expense
        ? this.http.patch<any>(`/api/expenses/${this.expense.id}`, payload)
        : this.http.post<any>('/api/expenses', payload);

      request$.subscribe({
        next: () => {
          this.isSubmitting = false;
          this.expenseCreated.emit();
          this.closeModal();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMessage = err.error?.message || 'Failed to save expense. Please try again.';
        }
      });
    }
  }

  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const randomUuid = Math.random().toString(36).substring(2, 15);
        this.attachedFiles.push({
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          key: `receipts/${randomUuid}-${file.name}.enc`
        });
      }
    }
  }

  removeAttachment(index: number) {
    this.attachedFiles.splice(index, 1);
  }
}
