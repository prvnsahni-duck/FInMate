import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
  DestroyRef,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { ExpensesService } from '../../services/expenses.service';
import { FriendsService } from '../../../../features/friends/services/friends.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import {
  ExpenseSplitInputDto,
  GroupMember,
  JwtPayload,
  UpdateExpenseDto,
  UserSearchResult,
} from '@finmate/data-models';
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { environment } from '../../../../../environments/environment';
import { GroupExpense } from '../../pages/group-detail/group-detail.component';
import {
  DropdownComponent,
  DropdownOption,
} from '../../../../shared/components/dropdown/dropdown.component';
import {
  CATEGORY_OPTIONS,
  CURRENCY_OPTIONS,
} from '../../../../core/constants/app.constants';

@Component({
  selector: 'app-create-expense-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    SubmitButtonComponent,
    DropdownComponent,
  ],
  templateUrl: './create-expense-modal.component.html',
})
export class CreateExpenseModalComponent implements OnChanges {
  private expensesService = inject(ExpensesService);
  private friendsService = inject(FriendsService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private store = inject(Store);
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  currencyOptions: DropdownOption[] = CURRENCY_OPTIONS;

  categoryOptions: DropdownOption[] = CATEGORY_OPTIONS;

  get payerOptions(): DropdownOption[] {
    return this.availablePayers.map((p) => ({
      value: p.id,
      label: p.name,
    }));
  }

  @Input() groupId: string | null = null;
  @Input() groupCurrency!: string;
  @Input() members: GroupMember[] = [];
  @Input() expense: GroupExpense | null = null; // To support edit mode
  @Input() defaultCategory: string = CATEGORY_OPTIONS[0].value;

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
  private searchTimeoutId?: ReturnType<typeof setTimeout>;
  private searchSub?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchTimeoutId) {
        clearTimeout(this.searchTimeoutId);
      }
      this.searchSub?.unsubscribe();
    });
  }

  expenseForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: [''],
    amountTotal: [
      null as number | null,
      [Validators.required, Validators.min(0.01)],
    ],
    currency: ['', [Validators.required]],
    category: [
      CATEGORY_OPTIONS[0].value,
      [Validators.required, Validators.maxLength(64)],
    ],
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

  get availablePayers(): { id: string; name: string }[] {
    if (this.groupId) {
      return this.members.map((m) => ({
        id: m.user.id,
        name: m.user.displayName || m.user.username || m.user.email || '',
      }));
    } else {
      const currentUserId = this.getCurrentUserId();
      const list = [];
      if (currentUserId) {
        list.push({ id: currentUserId, name: 'You' });
      }
      for (const friend of this.resolvedFriends.values()) {
        list.push({
          id: friend.id,
          name: friend.displayName || friend.username || friend.email || '',
        });
      }
      return list;
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
        const otherSplits = this.expense.splits.filter(
          (s) => s.participantUserId && s.participantUserId !== currentUserId,
        );
        if (otherSplits.length > 0) {
          this.splitWithFriend = true;
          otherSplits.forEach((s) => {
            if (s.participantUser) {
              const u = s.participantUser;
              this.resolvedFriends.set(u.id, {
                id: u.id,
                displayName: u.displayName || u.email.split('@')[0],
                email: u.email,
              });
              this.selectedUserIds.add(u.id);
            } else if (s.participantUserId) {
              this.resolvedFriends.set(s.participantUserId, {
                id: s.participantUserId,
                displayName: s.participantUserDisplayName || 'Friend',
                email: '',
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
            key: a.storageKey,
          });
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
    if (this.searchTimeoutId) {
      clearTimeout(this.searchTimeoutId);
      this.searchTimeoutId = undefined;
    }
    this.searchSub?.unsubscribe();

    if (query.trim().length < 2) {
      this.searchResults = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.searchTimeoutId = setTimeout(() => {
      this.searchSub = this.friendsService.searchUsers(query).subscribe({
        next: (users) => {
          this.searchResults = users;
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
        },
      });
    }, 250);
  }

  addFriendToSplit(user: UserSearchResult) {
    this.resolvedFriends.set(user.id, {
      id: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email,
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

  filesToEncrypt: Array<{ name: string; type: string; size: number; arrayBuffer: ArrayBuffer }> = [];

  async onSubmit() {
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
      const splits: ExpenseSplitInputDto[] = Array.from(
        this.selectedUserIds,
      ).map((userId) => ({
        participantUserId: userId,
        splitType: 'equal' as const,
        shareValue: 1,
      }));

      const title = formValue.title;
      const amountTotal = formValue.amountTotal;
      const currency = formValue.currency;
      const category = formValue.category;
      const expenseDate = formValue.expenseDate;
      const paidByUserId = formValue.paidByUserId;

      if (
        !title ||
        amountTotal === null ||
        amountTotal === undefined ||
        !currency ||
        !category ||
        !expenseDate ||
        !paidByUserId
      ) {
        this.isSubmitting = false;
        return;
      }

      try {
        const user = this.getCurrentUserId();
        const email = this.store.selectSnapshot((state: any) => state.auth?.user?.email);
        let scopeKey: CryptoKey | null = null;
        let scope: 'personal' | 'group' | 'direct_shared' = 'personal';

        if (this.groupId) {
          scope = 'group';
          scopeKey = await this.groupKeyService.getGroupDataKey(this.groupId);
          if (!scopeKey) {
            scopeKey = await this.groupKeyService.createAndStoreGroupKey(this.groupId);
          }
        } else {
          const otherParticipants = splits.filter(
            (s) => s.participantUserId && s.participantUserId !== user
          );
          if (otherParticipants.length > 0) {
            scope = 'direct_shared';
          } else {
            scope = 'personal';
            scopeKey = await this.encryptionService.loadKeyFromSession(email);
          }
        }

        if (scope === 'direct_shared') {
          scopeKey = await this.encryptionService.generateDataKey();
        }

        if (!scopeKey) {
          throw new Error('Encryption key not loaded/derived. Please try again.');
        }

        // Encrypt new attachments
        const encryptedAttachments = [];
        const existingAttachments = this.attachedFiles
          .filter((f) => !f.key.startsWith('pending:'))
          .map((f) => ({
            storageKey: f.key,
            encryptedOriginalName: '',
            encryptedFileKey: '',
            mimeType: 'application/octet-stream',
            sizeBytes: 0,
          }));

        for (const fileObj of this.filesToEncrypt) {
          const fileKey = await this.encryptionService.generateDataKey();
          const encryptedBytes = await this.encryptionService.encryptBytes(fileObj.arrayBuffer, fileKey);
          const encryptedName = await this.encryptionService.encrypt(fileObj.name, fileKey);
          const wrappedFileKey = await this.encryptionService.wrapKey(fileKey, scopeKey);

          const randomUuid = Math.random().toString(36).substring(2, 15);
          const storageKey = `receipts/${randomUuid}-${fileObj.name}.enc`;
          localStorage.setItem(`sim_storage:${storageKey}`, encryptedBytes);

          encryptedAttachments.push({
            storageKey,
            encryptedOriginalName: encryptedName,
            encryptedFileKey: wrappedFileKey,
            mimeType: fileObj.type,
            sizeBytes: fileObj.size,
          });
        }

        const wrappedContentKeys = [];
        if (scope === 'direct_shared' && scopeKey) {
          const masterKey = await this.encryptionService.loadKeyFromSession(email);
          const currentUserId = user;

          const wrappedSelf = await this.encryptionService.wrapKey(scopeKey, masterKey!);
          wrappedContentKeys.push({
            userId: currentUserId!,
            wrappedKey: wrappedSelf,
          });

          const otherParticipants = splits.filter(
            (s) => s.participantUserId && s.participantUserId !== user
          );
          for (const split of otherParticipants) {
            const participantId = split.participantUserId!;
            try {
              const pubKeyRes = await firstValueFrom(
                this.http.get<{ data: { publicWrappingKey: string | null } }>(
                  `${this.baseUrl}/users/${participantId}/public-key`,
                ),
              );
              const pubKeyStr = pubKeyRes?.data?.publicWrappingKey;
              if (pubKeyStr) {
                const subtle = typeof window !== 'undefined' ? window.crypto.subtle : (globalThis as any).crypto.subtle;
                const pubKey = await subtle.importKey(
                  'jwk',
                  JSON.parse(pubKeyStr),
                  { name: 'RSA-OAEP', hash: 'SHA-256' },
                  true,
                  ['wrapKey'],
                );
                const wrappedFriendKey = await this.encryptionService.wrapKey(scopeKey, pubKey);
                wrappedContentKeys.push({
                  userId: participantId,
                  wrappedKey: wrappedFriendKey,
                });
              }
            } catch (e) {
              console.error(`Failed to wrap content key for participant ${participantId}`, e);
            }
          }
        }

        const payload: any = {
          title,
          description: formValue.description ?? undefined,
          amountTotal,
          currency,
          category,
          expenseDate,
          paidByUserId,
          groupId: this.groupId ?? undefined,
          splits,
          encryptionScope: scope,
          wrappedContentKeys: wrappedContentKeys.length > 0 ? wrappedContentKeys : undefined,
          encryptedAttachments: [...existingAttachments, ...encryptedAttachments],
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
            this.errorMessage =
              err.error?.message || 'Failed to save expense. Please try again.';
          },
        });
      } catch (err: any) {
        this.isSubmitting = false;
        this.errorMessage = err?.message || 'Failed to encrypt and save expense.';
      }
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          this.filesToEncrypt.push({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            arrayBuffer,
          });
          this.attachedFiles.push({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            key: `pending:${Math.random().toString(36).substring(2, 10)}`,
          });
        };
        reader.readAsArrayBuffer(file);
      }
    }
  }

  removeAttachment(index: number) {
    const fileItem = this.attachedFiles[index];
    if (fileItem && fileItem.key.startsWith('pending:')) {
      const encryptIndex = this.filesToEncrypt.findIndex((f) => f.name === fileItem.name);
      if (encryptIndex !== -1) {
        this.filesToEncrypt.splice(encryptIndex, 1);
      }
    }
    this.attachedFiles.splice(index, 1);
  }
}
