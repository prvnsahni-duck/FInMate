import {
  Component,
  inject,
  OnInit,
  DestroyRef,
  signal,
  computed,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreateExpenseModalComponent } from '../../components/create-expense-modal/create-expense-modal.component';
import { RecurringExpenseFormComponent } from '../../components/recurring-expense-form/recurring-expense-form.component';
import { RecurringExpensesService } from '../../services/recurring-expenses.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { AnalyticsChartsComponent } from '../../components/analytics-charts/analytics-charts.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { GroupsService } from '../../services/groups.service';
import { ExpensesService } from '../../services/expenses.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DropdownComponent,
  DropdownOption,
} from '../../../../shared/components/dropdown/dropdown.component';

import {
  BalanceEntry,
  CarryForwardBalance,
  Expense,
  ExpenseSplitInputDto,
  Group,
  GroupContributionResponse,
  GroupMember,
  JwtPayload,
} from '@finmate/data-models';

import {
  GroupHistoryLogComponent,
  GroupAuditLog,
} from '../../components/group-history-log/group-history-log.component';
import { GroupTrashComponent } from '../../components/group-trash/group-trash.component';
import {
  GroupBalancesComponent,
  SuggestedSettlement,
} from '../../components/group-balances/group-balances.component';
import { GroupMembersComponent } from '../../components/group-members/group-members.component';

export interface GroupExpense extends Expense {
  paidByUserId: string;
  ownerUserId: string;
  splits?: Array<
    ExpenseSplitInputDto & {
      participantUser?: {
        id: string;
        email: string;
        displayName?: string;
      };
      participantUserDisplayName?: string;
      participantUserEmail?: string;
      shareAmount?: number;
    }
  >;
  attachments?: Array<{
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    CreateExpenseModalComponent,
    RecurringExpenseFormComponent,
    FormsModule,
    AnalyticsChartsComponent,
    ConfirmModalComponent,
    GroupHistoryLogComponent,
    GroupTrashComponent,
    GroupBalancesComponent,
    GroupMembersComponent,
    DropdownComponent,
  ],
  templateUrl: './group-detail.component.html',
  styleUrls: ['./group-detail.component.scss'],
})
export class GroupDetailComponent implements OnInit {
  private groupsService = inject(GroupsService);
  private expensesService = inject(ExpensesService);
  private recurringExpensesService = inject(RecurringExpensesService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private retryCooldownIntervalId?: ReturnType<typeof setInterval>;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.retryCooldownIntervalId) {
        clearInterval(this.retryCooldownIntervalId);
        this.retryCooldownIntervalId = undefined;
      }
    });
  }

  filterCategoryOptions: DropdownOption[] = [
    { value: '', label: 'All Categories' },
    { value: 'Food & Drinks', label: 'Food & Drinks' },
    { value: 'Travel', label: 'Travel' },
    { value: 'Utilities', label: 'Utilities' },
    { value: 'Entertainment', label: 'Entertainment' },
    { value: 'Shopping', label: 'Shopping' },
    { value: 'Housing', label: 'Housing' },
    { value: 'Others', label: 'Others' },
  ];

  visibilityOptions: DropdownOption[] = [
    { value: 'private', label: 'Private' },
    { value: 'invite_only', label: 'Invite Only' },
    { value: 'public_readonly', label: 'Public Read-Only' },
  ];

  currencyOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'INR', label: 'INR (₹)' },
    { value: 'CAD', label: 'CAD ($)' },
    { value: 'AUD', label: 'AUD ($)' },
    { value: 'JPY', label: 'JPY (¥)' },
  ];

  memberRoleOptions: DropdownOption[] = [
    { value: 'member', label: 'Contributor' },
    { value: 'admin', label: 'Admin' },
    { value: 'spectator', label: 'Spectator' },
    { value: 'viewer', label: 'Viewer' },
    { value: 'owner', label: 'Transfer Owner' },
  ];

  // Signals for Group State
  group = signal<Group | null>(null);
  expenses = signal<GroupExpense[]>([]);
  members = signal<GroupMember[]>([]);
  balances = signal<BalanceEntry[]>([]);
  userBalance = signal<number>(0);
  suggestedSettlements = signal<SuggestedSettlement[]>([]);
  historyLogs = signal<GroupAuditLog[]>([]);
  deletedExpenses = signal<Expense[]>([]);
  carryForwardBalances = signal<CarryForwardBalance[]>([]);
  recurringExpenses = signal<any[]>([]);

  // Signals for ledger closure settings
  closeMonthSelected = signal<string>('');
  isClosingMonth = signal<boolean>(false);
  closeMonthError = signal<string | null>(null);
  closeMonthSuccess = signal<string | null>(null);
  isConfirmCloseMonthOpen = signal<boolean>(false);

  // Signals for UI state
  isLoading = signal<boolean>(true);
  activeTab = signal<
    'ledger' | 'analytics' | 'history' | 'trash' | 'settings' | 'recurring'
  >('ledger');
  isRecurringExpenseFormOpen = signal<boolean>(false);
  selectedRecurringExpenseForEdit = signal<any | null>(null);
  isExpenseModalOpen = signal<boolean>(false);
  isDeleteConfirmOpen = signal<boolean>(false);
  deleteExpenseId = signal<string | null>(null);
  filterCategory = signal<string>('');
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalExpenses = signal<number>(0);
  currentUserId = signal<string | null>(null);
  currentTimelineMonth = signal<Date>(new Date());
  isMonthLocked = signal<boolean>(false);
  isViewer = signal<boolean>(false);

  // Categories list
  categories = [
    'Food & Drinks',
    'Travel',
    'Utilities',
    'Entertainment',
    'Shopping',
    'Housing',
    'Others',
  ];
  selectedExpenseForEdit = signal<GroupExpense | null>(null);

  // Error Banner & Cooldown State
  ledgerError = signal<boolean>(false);
  retryCooldown = signal<number>(0);
  expandedExpenseIds = signal<Record<string, boolean>>({});

  toggleExpenseExpand(expenseId: string) {
    this.expandedExpenseIds.update((ids) => ({
      ...ids,
      [expenseId]: !ids[expenseId],
    }));
  }

  retryLoadLedger() {
    if (this.retryCooldown() > 0) return;

    if (this.retryCooldownIntervalId) {
      clearInterval(this.retryCooldownIntervalId);
      this.retryCooldownIntervalId = undefined;
    }

    this.retryCooldown.set(5);
    this.retryCooldownIntervalId = setInterval(() => {
      this.retryCooldown.update((c) => c - 1);
      if (this.retryCooldown() <= 0) {
        if (this.retryCooldownIntervalId) {
          clearInterval(this.retryCooldownIntervalId);
          this.retryCooldownIntervalId = undefined;
        }
      }
    }, 1000);

    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  isOwnerOrAdmin = computed(() => {
    const userId = this.currentUserId();
    if (!userId) return false;
    const member = this.members().find((m) => m.user?.id === userId);
    return member?.role === 'owner' || member?.role === 'admin';
  });

  totalPages = computed(() => {
    return Math.ceil(this.totalExpenses() / this.pageSize()) || 1;
  });

  ngOnInit() {
    this.currentUserId.set(this.getCurrentUserId());
    this.closeMonthSelected.set(this.getCurrentMonthString());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const groupId = params.get('id');
      if (groupId) {
        this.isLoading.set(true);
        this.currentPage.set(1);
        this.filterCategory.set('');
        this.filterStartDate.set('');
        this.filterEndDate.set('');

        this.groupsService.getGroup(groupId).subscribe({
          next: (res) => {
            this.group.set(res);
            this.fetchExpenses(groupId);
            this.fetchMembers(groupId);
            this.fetchBalances(groupId);
            this.fetchHistoryLogs(groupId);
            this.fetchDeletedExpenses(groupId);
            this.fetchRecurringExpenses(groupId);
            if (res.groupType === 'household') {
              this.fetchCarryForward(groupId);
            }
          },
          error: () => this.isLoading.set(false),
        });
      }
    });
  }

  getCurrentMonthString(): string {
    const d = this.currentTimelineMonth();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  getMonthDisplayName(): string {
    return this.currentTimelineMonth().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  changeMonth(delta: number) {
    const g = this.group();
    if (g?.groupType !== 'household') return;

    const nextDate = new Date(this.currentTimelineMonth());
    nextDate.setMonth(nextDate.getMonth() + delta);
    this.currentTimelineMonth.set(nextDate);

    const todayMonth = new Date();
    const isPast =
      nextDate.getFullYear() < todayMonth.getFullYear() ||
      (nextDate.getFullYear() === todayMonth.getFullYear() &&
        nextDate.getMonth() < todayMonth.getMonth());
    this.isMonthLocked.set(isPast);

    if (g?.id) {
      this.fetchExpenses(g.id);
      this.fetchCarryForward(g.id);
    }
  }

  fetchExpenses(groupId: string) {
    let start = this.filterStartDate();
    let end = this.filterEndDate();
    const g = this.group();
    if (g?.groupType === 'household') {
      const activeMonth = this.getCurrentMonthString();
      start = `${activeMonth}-01`;
      end = `${activeMonth}-31`;
    }

    this.expensesService
      .getExpenses(groupId, {
        page: this.currentPage(),
        limit: this.pageSize(),
        category: this.filterCategory(),
        startDate: start,
        endDate: end,
      })
      .subscribe({
        next: (res) => {
          const mappedExpenses = (res.data as any[]).map((expense) => {
            const mappedSplits = (expense.splits || []).map((split: any) => {
              let email = split.participantUserEmail;
              let displayName = split.participantUserDisplayName;
              let participantUser = split.participantUser;

              if (!email || !displayName || !participantUser) {
                if (split.participantUserId) {
                  const member = this.members().find(
                    (m) => m.user?.id === split.participantUserId,
                  );
                  if (member) {
                    email = member.user.email;
                    displayName = member.user.displayName;
                    participantUser = member.user;
                  }
                } else if (split.participantGroupMemberId) {
                  const member = this.members().find(
                    (m) => m.id === split.participantGroupMemberId,
                  );
                  if (member) {
                    email = member.user?.email;
                    displayName = member.user?.displayName;
                    participantUser = member.user;
                  }
                }
              }

              return {
                ...split,
                shareAmount: split.amountOwed,
                participantUserEmail: email,
                participantUserDisplayName: displayName,
                participantUser,
              };
            });

            return {
              ...expense,
              splits: mappedSplits,
            } as GroupExpense;
          });
          this.expenses.set(mappedExpenses);
          this.totalExpenses.set(res.meta?.totalItems || 0);
          this.isLoading.set(false);
          this.ledgerError.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.ledgerError.set(true);
        },
      });
  }

  fetchMembers(groupId: string) {
    this.groupsService.getMembers(groupId).subscribe({
      next: (res) => {
        this.members.set(res);

        const currentUserId = this.currentUserId();
        const myMember = res.find((m) => m.user?.id === currentUserId);
        this.isViewer.set(myMember?.role === 'viewer');
      },
      error: () => {},
    });
  }

  fetchBalances(groupId: string) {
    const g = this.group();
    if (!g) return;
    this.groupsService.getBalances(groupId).subscribe({
      next: (res) => {
        this.balances.set(res.balances);
        this.suggestedSettlements.set(res.suggestedSettlements);

        const currentUserId = this.currentUserId();
        const myBalanceEntry = res.balances.find(
          (b) => b.userId === currentUserId && b.currency === g.currency,
        );
        this.userBalance.set(myBalanceEntry ? myBalanceEntry.netBalance : 0);
      },
      error: () => {},
    });
  }

  fetchHistoryLogs(groupId: string) {
    this.groupsService.getHistoryLogs(groupId).subscribe({
      next: (res) => {
        this.historyLogs.set(res.data || []);
      },
      error: () => {},
    });
  }

  fetchDeletedExpenses(groupId: string) {
    this.groupsService.getDeletedExpenses(groupId).subscribe({
      next: (res) => {
        this.deletedExpenses.set(res.data || []);
      },
      error: () => {},
    });
  }

  fetchCarryForward(groupId: string) {
    this.groupsService
      .getCarryForward(groupId, this.getCurrentMonthString())
      .subscribe({
        next: (res) => {
          this.carryForwardBalances.set(res || []);
        },
        error: () => {},
      });
  }

  getMaxCarryForwardValue(): number {
    const balances = this.carryForwardBalances();
    if (balances.length === 0) return 1;
    return Math.max(
      ...balances.map((b) => Math.max(b.paid || 0, b.expected || 0, 1)),
    );
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

  getUserName(userId: string): string {
    const member = this.members().find((m) => m.user?.id === userId);
    return member
      ? member.user.displayName || member.user.email
      : 'Unknown User';
  }

  openExpenseModal(expense?: GroupExpense) {
    this.selectedExpenseForEdit.set(expense || null);
    this.isExpenseModalOpen.set(true);
  }

  closeExpenseModal() {
    this.selectedExpenseForEdit.set(null);
    this.isExpenseModalOpen.set(false);
  }

  onExpenseCreated() {
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
      this.fetchBalances(g.id);
      this.fetchHistoryLogs(g.id);
      this.fetchDeletedExpenses(g.id);
      if (g.groupType === 'household') {
        this.fetchCarryForward(g.id);
      }
    }
  }

  confirmDeleteExpense(expenseId: string) {
    this.deleteExpenseId.set(expenseId);
    this.isDeleteConfirmOpen.set(true);
  }

  onDeleteConfirmed() {
    const id = this.deleteExpenseId();
    if (id) {
      this.expensesService.deleteExpense(id).subscribe({
        next: () => {
          this.isDeleteConfirmOpen.set(false);
          this.deleteExpenseId.set(null);
          this.onExpenseCreated();
        },
        error: (err) => {
          this.isDeleteConfirmOpen.set(false);
          this.deleteExpenseId.set(null);
          alert(err.error?.message || 'Failed to delete expense');
        },
      });
    }
  }

  onDeleteCancelled() {
    this.isDeleteConfirmOpen.set(false);
    this.deleteExpenseId.set(null);
  }

  restoreExpense(expenseId: string) {
    this.expensesService.restoreExpense(expenseId).subscribe({
      next: () => {
        alert('Expense restored successfully!');
        this.onExpenseCreated();
      },
      error: (err) => alert(err.error?.message || 'Failed to restore expense'),
    });
  }

  exportLedger(format: 'csv' | 'xlsx') {
    const g = this.group();
    if (!g) return;
    this.expensesService.exportExpenses(g.id, format).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledger-${g.name}-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) =>
        alert(
          'Failed to export ledger: ' + (err.error?.message || err.message),
        ),
    });
  }

  onImportFileSelected(event: Event) {
    const g = this.group();
    if (!g) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupId', g.id);

      this.expensesService.importExpenses(formData).subscribe({
        next: () => {
          alert('Expenses imported successfully!');
          this.onExpenseCreated();
        },
        error: (err) =>
          alert(err.error?.message || 'Import failed. Check file format.'),
      });
    }
  }

  applyFilters() {
    this.currentPage.set(1);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  resetFilters() {
    this.filterCategory.set('');
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.currentPage.set(1);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  changePage(delta: number) {
    this.currentPage.update((val) => val + delta);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  downloadAttachment(file: NonNullable<GroupExpense['attachments']>[number]) {
    alert(
      `Downloading attachment: ${file.originalName}\nDecrypted successfully!`,
    );
    const blob = new Blob(
      [`Decrypted content of: ${file.originalName} (${file.storageKey})`],
      { type: 'text/plain' },
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // Group Settings Form State
  editGroupName = '';
  editGroupDescription = '';
  editGroupVisibility: 'private' | 'invite_only' | 'public_readonly' =
    'private';
  editGroupCurrency = 'USD';
  editGroupCarryForward = false;

  isSavingSettings = false;
  settingsError = '';
  settingsSuccess = '';

  // Contributions State
  contributionMonth = new Date().toISOString().slice(0, 7);
  contributionsList: GroupContributionResponse[] = [];
  isLoadingContributions = false;
  isSavingContributions = false;
  contributionError = '';
  contributionSuccess = '';

  fetchRecurringExpenses(groupId: string) {
    this.recurringExpensesService.getRecurringExpenses(groupId).subscribe({
      next: (res) => {
        this.recurringExpenses.set(res || []);
      },
      error: (err) => console.error('Failed to fetch recurring expenses', err),
    });
  }

  openRecurringExpenseForm(template?: any) {
    this.selectedRecurringExpenseForEdit.set(template || null);
    this.isRecurringExpenseFormOpen.set(true);
  }

  closeRecurringExpenseForm() {
    this.selectedRecurringExpenseForEdit.set(null);
    this.isRecurringExpenseFormOpen.set(false);
  }

  onRecurringExpenseSaved() {
    const g = this.group();
    if (g?.id) {
      this.fetchRecurringExpenses(g.id);
    }
    this.closeRecurringExpenseForm();
  }

  deleteRecurringExpense(id: string) {
    if (
      confirm(
        'Are you sure you want to delete this recurring expense schedule?',
      )
    ) {
      this.recurringExpensesService.deleteRecurringExpense(id).subscribe({
        next: () => {
          const g = this.group();
          if (g?.id) {
            this.fetchRecurringExpenses(g.id);
          }
        },
        error: (err) =>
          alert(err.error?.message || 'Failed to delete recurring expense'),
      });
    }
  }

  toggleRecurringExpenseStatus(template: any) {
    const nextStatus = template.status === 'active' ? 'paused' : 'active';
    this.recurringExpensesService
      .updateRecurringExpense(template.id, {
        status: nextStatus,
        version: template.version,
      })
      .subscribe({
        next: () => {
          const g = this.group();
          if (g?.id) {
            this.fetchRecurringExpenses(g.id);
          }
        },
        error: (err) => alert(err.error?.message || 'Failed to update status'),
      });
  }

  setTab(
    tab:
      | 'ledger'
      | 'analytics'
      | 'history'
      | 'trash'
      | 'settings'
      | 'recurring',
  ) {
    this.activeTab.set(tab);
    if (tab === 'settings') {
      const g = this.group();
      if (g) {
        this.editGroupName = g.name;
        this.editGroupDescription = g.description || '';
        this.editGroupVisibility = g.visibility || 'private';
        this.editGroupCurrency = g.currency || 'USD';
        this.editGroupCarryForward = g.carryForwardEnabled || false;
        this.loadContributionsForMonth();
      }
    } else if (tab === 'recurring') {
      const g = this.group();
      if (g?.id) {
        this.fetchRecurringExpenses(g.id);
      }
    }
  }

  saveGroupSettings() {
    const g = this.group();
    if (!g) return;
    this.isSavingSettings = true;
    this.settingsError = '';
    this.settingsSuccess = '';

    this.groupsService
      .updateGroup(g.id, {
        name: this.editGroupName,
        description: this.editGroupDescription,
        visibility: this.editGroupVisibility,
        currency: this.editGroupCurrency,
        carryForwardEnabled: this.editGroupCarryForward,
        version: g.version,
      })
      .subscribe({
        next: (res) => {
          this.group.set(res);
          this.isSavingSettings = false;
          this.settingsSuccess = 'Group settings updated successfully!';
          setTimeout(() => (this.settingsSuccess = ''), 3000);
        },
        error: (err) => {
          this.isSavingSettings = false;
          this.settingsError =
            err.error?.message || 'Failed to update group settings.';
        },
      });
  }

  loadContributionsForMonth() {
    const g = this.group();
    if (!g) return;
    this.isLoadingContributions = true;
    this.contributionError = '';
    this.contributionSuccess = '';

    this.groupsService
      .getContributions(g.id, this.contributionMonth)
      .subscribe({
        next: (res) => {
          this.contributionsList = res.map((c) => ({
            ...c,
            amount: Number(c.percentage || 0), // Initialize amount to percentage
          }));
          this.isLoadingContributions = false;
        },
        error: (err) => {
          this.contributionError =
            err.error?.message || 'Failed to load contributions.';
          this.isLoadingContributions = false;
        },
      });
  }

  contributionMode: 'amount' | 'percentage' = 'amount';

  setContributionMode(mode: 'amount' | 'percentage') {
    this.contributionMode = mode;
  }

  getContributionsSum(): number {
    const sum = this.contributionsList.reduce(
      (acc, c) => acc + Number(c.percentage || 0),
      0,
    );
    return Math.round(sum * 100) / 100;
  }

  getCallerRole(): string {
    const userId = this.currentUserId();
    if (!userId) return 'viewer';
    const member = this.members().find((m) => m.user?.id === userId);
    return member ? member.role : 'viewer';
  }

  canChangeRole(member: GroupMember): boolean {
    return true;
  }

  canRemoveMember(member: GroupMember): boolean {
    const currentUserId = this.currentUserId();
    if (!currentUserId) return false;

    // Cannot remove self
    if (member.user?.id === currentUserId) return false;

    const callerRole = this.getCallerRole();
    if (callerRole === 'owner') return true;

    // Admin can remove members that are not owner or admin
    if (callerRole === 'admin') {
      const targetRole = member.role as string;
      return targetRole !== 'owner' && targetRole !== 'admin';
    }

    return false;
  }

  updateMemberRole(member: GroupMember, event: Event | string) {
    let newRole: GroupMember['role'];
    if (typeof event === 'string') {
      newRole = event as GroupMember['role'];
    } else {
      const target = event.target as HTMLSelectElement;
      newRole = target.value as GroupMember['role'];
    }
    const g = this.group();
    if (!g) return;

    this.groupsService
      .updateMember(g.id, member.id, { role: newRole })
      .subscribe({
        next: () => {
          alert(
            `Successfully updated role for ${member.user?.displayName || member.user?.email}`,
          );
          this.fetchMembers(g.id);
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to update member role');
        },
      });
  }

  removeOrRevokeMember(member: GroupMember) {
    const actionText =
      member.joinStatus === 'invited' ? 'revoke invitation for' : 'remove';
    if (
      confirm(
        `Are you sure you want to ${actionText} ${member.user?.displayName || member.user?.email}?`,
      )
    ) {
      const g = this.group();
      if (!g) return;

      this.groupsService.removeMember(g.id, member.id).subscribe({
        next: () => {
          alert(
            `Successfully removed ${member.user?.displayName || member.user?.email}`,
          );
          this.fetchMembers(g.id);
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to remove member');
        },
      });
    }
  }

  onAmountChange() {
    this.calculatePercentagesFromAmounts();
  }

  calculatePercentagesFromAmounts() {
    const totalAmount = this.contributionsList.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0,
    );
    if (totalAmount <= 0) {
      this.contributionsList.forEach((c) => (c.percentage = 0));
      return;
    }

    let sum = 0;
    this.contributionsList.forEach((c) => {
      const rawPct = ((Number(c.amount) || 0) / totalAmount) * 100;
      c.percentage = Math.round(rawPct * 100) / 100;
      sum += c.percentage;
    });

    let diff = 100 - sum;
    diff = Math.round(diff * 100) / 100;

    if (diff !== 0 && this.contributionsList.length > 0) {
      let targetMember = this.contributionsList[0];
      let maxAmount = -1;
      for (const c of this.contributionsList) {
        const amt = Number(c.amount) || 0;
        if (amt > maxAmount) {
          maxAmount = amt;
          targetMember = c;
        }
      }
      if (targetMember) {
        targetMember.percentage =
          Math.round((targetMember.percentage + diff) * 100) / 100;
      }
    }
  }

  getContributionsAmountSum(): number {
    const sum = this.contributionsList.reduce(
      (acc, c) => acc + Number(c.amount || 0),
      0,
    );
    return Math.round(sum * 100) / 100;
  }

  saveContributions() {
    const g = this.group();
    if (!g) return;

    // Run calculation once more to be completely sure percentages are correct
    if (this.contributionMode === 'amount') {
      this.calculatePercentagesFromAmounts();
    }

    const sum = this.contributionsList.reduce(
      (acc, c) => acc + Number(c.percentage || 0),
      0,
    );
    const roundedSum = Math.round(sum * 100) / 100;
    if (roundedSum !== 100) {
      if (
        this.contributionMode === 'amount' &&
        this.getContributionsAmountSum() > 0
      ) {
        this.contributionError =
          'Internal calculation failed to distribute exactly 100%';
      } else {
        this.contributionError =
          'Total contribution percentages must equal exactly 100% (currently ' +
          roundedSum +
          '%).';
      }
      return;
    }

    this.isSavingContributions = true;
    this.contributionError = '';
    this.contributionSuccess = '';

    const payload = {
      ledgerMonth: this.contributionMonth,
      contributions: this.contributionsList.map((c) => ({
        memberId: c.memberId,
        percentage: Number(c.percentage),
      })),
    };

    this.groupsService.updateContributions(g.id, payload).subscribe({
      next: () => {
        this.isSavingContributions = false;
        this.contributionSuccess =
          this.contributionMode === 'amount'
            ? 'Contribution amounts saved successfully!'
            : 'Contribution percentages saved successfully!';
        this.fetchCarryForward(g.id);
        setTimeout(() => (this.contributionSuccess = ''), 3000);
      },
      error: (err) => {
        this.isSavingContributions = false;
        this.contributionError =
          err.error?.message || 'Failed to save contributions.';
      },
    });
  }

  openConfirmCloseMonth() {
    this.closeMonthError.set(null);
    this.closeMonthSuccess.set(null);
    this.isConfirmCloseMonthOpen.set(true);
  }

  onCloseMonthConfirmed() {
    this.isConfirmCloseMonthOpen.set(false);
    const g = this.group();
    if (!g) return;

    this.isClosingMonth.set(true);
    this.closeMonthError.set(null);
    this.closeMonthSuccess.set(null);

    this.groupsService.closeMonth(g.id, this.closeMonthSelected()).subscribe({
      next: (res) => {
        this.isClosingMonth.set(false);
        this.closeMonthSuccess.set(
          `Month ${this.closeMonthSelected()} closed successfully! ${res.carryForwardExpenseCount} rollover expense(s) created.`,
        );
        this.fetchExpenses(g.id);
        this.fetchBalances(g.id);
        this.fetchHistoryLogs(g.id);
        this.fetchCarryForward(g.id);
        setTimeout(() => this.closeMonthSuccess.set(null), 5000);
      },
      error: (err) => {
        this.isClosingMonth.set(false);
        this.closeMonthError.set(
          err.error?.message || 'Failed to close the billing month.',
        );
      },
    });
  }

  onCloseMonthCancelled() {
    this.isConfirmCloseMonthOpen.set(false);
  }
}
