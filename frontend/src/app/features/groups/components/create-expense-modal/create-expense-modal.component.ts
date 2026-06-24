import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { jwtDecode } from 'jwt-decode';
import { ExpensesService } from '../../services/expenses.service';
import { FriendsService } from '../../../../features/friends/services/friends.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { CreateExpenseDto, ExpenseSplitInputDto, GroupMember, JwtPayload, UpdateExpenseDto, UserSearchResult } from '@finmate/data-models';
import { GroupExpense } from '../../pages/group-detail/group-detail.component';
import { DropdownComponent, DropdownOption } from '../../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'app-create-expense-modal',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, SubmitButtonComponent, DropdownComponent],
  templateUrl: './create-expense-modal.component.html'
})
export class CreateExpenseModalComponent implements OnChanges {
  private expensesService = inject(ExpensesService);
  private friendsService = inject(FriendsService);
  private fb = inject(FormBuilder);

  currencyOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'INR', label: 'INR (₹)' },
    { value: 'EUR', label: 'EUR (€)' }
  ];

  categoryOptions: DropdownOption[] = [
    { 
      value: 'Food & Drinks', 
      label: 'Food & Drinks', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>`
    },
    { 
      value: 'Travel', 
      label: 'Travel', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>`
    },
    { 
      value: 'Utilities', 
      label: 'Utilities', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`
    },
    { 
      value: 'Entertainment', 
      label: 'Entertainment', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>`
    },
    { 
      value: 'Shopping', 
      label: 'Shopping', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>`
    },
    { 
      value: 'Housing', 
      label: 'Housing', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>`
    },
    { 
      value: 'Others', 
      label: 'Others', 
      icon: `<svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>`
    }
  ];

  get payerOptions(): DropdownOption[] {
    return this.availablePayers.map(p => ({
      value: p.id,
      label: p.name
    }));
  }

  @Input() groupId: string | null = null;
  @Input() groupCurrency!: string;
  @Input() members: GroupMember[] = [];
  @Input() expense: GroupExpense | null = null; // To support edit mode
  @Input() defaultCategory: string = 'Food & Drinks';

  @Output() expenseCreated = new EventEmitter<void>();
  @Output() closeModalEvent = new EventEmitter<void>();

  selectedUserIds = new Set<string>();
  isSubmitting = false;
  errorMessage = '';
  attachedFiles: { name: string; size: string; key: string }[] = [];

  // Direct splits with friends fields
  splitWithFriend = false;
  searchQuery = '';
  searchResults: UserSearchResult[] = [];
  resolvedFriends: Map<string, UserSearchResult> = new Map();
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
      const decoded = jwtDecode<JwtPayload>(token);
      return decoded.userId || null;
    } catch {
      return null;
    }
  }

  get availablePayers(): {id: string; name: string}[] {
    if (this.groupId) {
      return this.members.map(m => ({ id: m.user.id, name: m.user.displayName || m.user.username || m.user.email || '' }));
    } else {
      const currentUserId = this.getCurrentUserId();
      const list = [];
      if (currentUserId) {
        list.push({ id: currentUserId, name: 'You' });
      }
      for (const friend of this.resolvedFriends.values()) {
        list.push({ id: friend.id, name: friend.displayName || friend.username || friend.email || '' });
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
    if (!this.expense && changes['defaultCategory'] && this.defaultCategory) {
      this.expenseForm.patchValue({ category: this.defaultCategory });
    }

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
        this.expense.splits.forEach((s) => {
          if (s.participantUserId) {
            this.selectedUserIds.add(s.participantUserId);
          }
        });
      }

      // If group-less direct split expense
      if (!this.groupId && this.expense.splits) {
        const currentUserId = this.getCurrentUserId();
        const otherSplits = this.expense.splits.filter((s) => s.participantUserId && s.participantUserId !== currentUserId);
        if (otherSplits.length > 0) {
          this.splitWithFriend = true;
          otherSplits.forEach((s) => {
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
        this.expense.attachments.forEach((a) => {
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

  addFriendToSplit(user: UserSearchResult) {
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
      const splits: ExpenseSplitInputDto[] = Array.from(this.selectedUserIds).map(userId => ({
        participantUserId: userId,
        splitType: 'equal' as const,
        shareValue: 1
      }));

      const title = formValue.title;
      const amountTotal = formValue.amountTotal;
      const currency = formValue.currency;
      const category = formValue.category;
      const expenseDate = formValue.expenseDate;
      const paidByUserId = formValue.paidByUserId;

      if (!title || amountTotal === null || amountTotal === undefined || !currency || !category || !expenseDate || !paidByUserId) {
        return;
      }

      const payload: CreateExpenseDto = {
        title,
        description: formValue.description ?? undefined,
        amountTotal,
        currency,
        category,
        expenseDate,
        paidByUserId,
        groupId: this.groupId ?? undefined,
        splits,
        attachmentKeys: this.attachedFiles.map(f => f.key),
      };

      const request$ = this.expense
        ? this.expensesService.updateExpense(this.expense.id, {
            ...payload,
            version: this.expense.version,
          } satisfies UpdateExpenseDto)
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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
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
