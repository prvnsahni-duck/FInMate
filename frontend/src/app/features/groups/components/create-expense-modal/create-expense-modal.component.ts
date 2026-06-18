import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { jwtDecode } from 'jwt-decode';
import { ExpensesService } from '../../services/expenses.service';
import { FriendsService } from '../../../../features/friends/services/friends.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { GroupMember, Expense } from '@finmate/data-models';
import { GroupExpense } from '../../pages/group-detail/group-detail.component';

@Component({
  selector: 'app-create-expense-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SubmitButtonComponent],
  templateUrl: './create-expense-modal.component.html'
})
export class CreateExpenseModalComponent implements OnChanges {
  private expensesService = inject(ExpensesService);
  private friendsService = inject(FriendsService);
  private fb = inject(FormBuilder);

  @Input() groupId: string | null = null;
  @Input() groupCurrency!: string;
  @Input() members: GroupMember[] = [];
  @Input() expense: GroupExpense | null = null; // To support edit mode

  @Output() expenseCreated = new EventEmitter<void>();
  @Output() closeModalEvent = new EventEmitter<void>();

  selectedUserIds = new Set<string>();
  isSubmitting = false;
  errorMessage = '';
  attachedFiles: { name: string; size: string; key: string }[] = [];

  // Direct splits with friends fields
  splitWithFriend = false;
  searchQuery = '';
  searchResults: any[] = [];
  resolvedFriends: Map<string, { id: string; displayName: string; email: string }> = new Map();
  isSearching = false;

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

  get availablePayers() {
    if (this.groupId) {
      return this.members.map(m => ({ id: m.user.id, name: m.user.displayName || m.user.email }));
    } else {
      const currentUserId = this.getCurrentUserId();
      const list = [];
      if (currentUserId) {
        list.push({ id: currentUserId, name: 'You' });
      }
      for (const friend of this.resolvedFriends.values()) {
        list.push({ id: friend.id, name: friend.displayName });
      }
      return list;
    }
  }

  get availableParticipants() {
    if (this.groupId) {
      return this.members
        .filter(m => m.role !== 'spectator')
        .map(m => ({ id: m.user.id, name: m.user.displayName || m.user.email }));
    } else {
      const currentUserId = this.getCurrentUserId();
      const list = [];
      if (currentUserId) {
        list.push({ id: currentUserId, name: 'You' });
      }
      for (const friend of this.resolvedFriends.values()) {
        list.push({ id: friend.id, name: friend.displayName });
      }
      return list;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
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

      // If group-less direct split expense
      if (!this.groupId && this.expense.splits) {
        const currentUserId = this.getCurrentUserId();
        const otherSplits = this.expense.splits.filter((s: any) => s.participantUserId && s.participantUserId !== currentUserId);
        if (otherSplits.length > 0) {
          this.splitWithFriend = true;
          otherSplits.forEach((s: any) => {
            if (s.participantUser) {
              const u = s.participantUser;
              this.resolvedFriends.set(u.id, {
                id: u.id,
                displayName: u.displayName || u.email.split('@')[0],
                email: u.email
              });
              this.selectedUserIds.add(u.id);
            } else if (s.participantUserId) {
              this.resolvedFriends.set(s.participantUserId, {
                id: s.participantUserId,
                displayName: s.participantUserDisplayName || 'Friend',
                email: ''
              });
              this.selectedUserIds.add(s.participantUserId);
            }
          });
        }
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

  onSplitToggleChange() {
    const currentUserId = this.getCurrentUserId();
    if (!this.splitWithFriend) {
      this.resolvedFriends.clear();
      this.selectedUserIds.clear();
      if (currentUserId) {
        this.selectedUserIds.add(currentUserId);
        this.expenseForm.patchValue({ paidByUserId: currentUserId });
      }
    }
  }

  onSearchChange(query: string) {
    if (query.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    this.isSearching = true;
    this.friendsService.searchUsers(query).subscribe({
      next: (users) => {
        this.searchResults = users;
        this.isSearching = false;
      },
      error: () => {
        this.isSearching = false;
      }
    });
  }

  addFriendToSplit(user: any) {
    this.resolvedFriends.set(user.id, {
      id: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email
    });
    this.selectedUserIds.add(user.id);
    this.searchQuery = '';
    this.searchResults = [];
  }

  removeFriendFromSplit(userId: string) {
    const currentUserId = this.getCurrentUserId();
    if (userId === currentUserId) return;
    this.selectedUserIds.delete(userId);
    this.resolvedFriends.delete(userId);
  }

  closeModal() {
    this.closeModalEvent.emit();
  }

  onSubmit() {
    if (!this.groupId && !this.splitWithFriend) {
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
        version: this.expense?.version
      };

      const request$ = this.expense
        ? this.expensesService.updateExpense(this.expense.id, payload)
        : this.expensesService.createExpense(payload);

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
