import {
  Component,
  inject,
  OnInit,
  DestroyRef,
  signal,
  computed,
  effect,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from '../../../../core/services/encryption.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../../../../core/constants/crypto.constants';
import { ExpenseDecryptCoordinator } from '../../../../core/services/expense-decrypt-coordinator.service';
import { ExpenseDecryptionService } from '../../../../core/services/expense-decryption.service';
import { classifyDecryptionError } from '../../../../core/models/decryption-state';
import { CryptoSessionManager } from '../../../../core/services/crypto-session-manager.service';
import { CryptoRecoveryQueueService } from '../../../../core/services/crypto-recovery-queue.service';
import { ExpenseExportService } from '../../../dashboard/services/expense-export.service';
import { ExportFilter } from '../../../dashboard/services/export/expense-export.types';

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
import { CryptoRecoveryPanelComponent } from '../../../../shared/components/crypto-recovery-panel/crypto-recovery-panel.component';
import {
  resolveMemberDisplayName,
  resolveUserDisplayName,
} from '../../utils/member-display.util';

export interface GroupExpense extends Expense {
  paidByUserId: string | null;
  paidByGroupMemberId?: string | null;
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
    CryptoRecoveryPanelComponent,
    DecimalPipe,
  ],
  templateUrl: './group-detail.component.html',
  styleUrls: ['./group-detail.component.scss'],
})
export class GroupDetailComponent implements OnInit, AfterViewInit {
  private groupsService = inject(GroupsService);
  private expensesService = inject(ExpensesService);
  private recurringExpensesService = inject(RecurringExpensesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private decryptCoordinator = inject(ExpenseDecryptCoordinator);
  private expenseDecryption = inject(ExpenseDecryptionService);
  private store = inject(Store);
  private cryptoSession = inject(CryptoSessionManager);
  private recoveryQueue = inject(CryptoRecoveryQueueService);
  private expenseExportService = inject(ExpenseExportService);
  private retryCooldownIntervalId?: ReturnType<typeof setInterval>;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.retryCooldownIntervalId) {
        clearInterval(this.retryCooldownIntervalId);
        this.retryCooldownIntervalId = undefined;
      }
      // Cancel any in-flight decryption retry loop for this group.
      this.decryptCoordinator.stop();
    });

    // Whenever CryptoSessionManager reports the crypto session Ready —
    // whether from this page's own <app-crypto-recovery-panel> unlock, or
    // from another tab (BroadcastChannel) — re-run key provisioning and
    // decryption. initializeGroupKeysAndSelfHeal()/startDecryption() are
    // documented as safe to call repeatedly (cancel-and-restart, no server
    // round-trip), so this also harmlessly re-fires on a normal first-load
    // success; the alternative (tracking "already handled" state) isn't
    // worth the extra complexity for an idempotent operation.
    effect(() => {
      if (this.cryptoSession.isReady()) {
        const g = this.group();
        if (g?.id) {
          this.initializeGroupKeysAndSelfHeal(g.id);
        }
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
  rateLimitError = this.groupKeyService.rateLimitError;
  readonly DECRYPTION_FAILED_PLACEHOLDER = DECRYPTION_FAILED_PLACEHOLDER;
  isRefreshingKey = signal<boolean>(false);
  requiresKeyProvisioning = this.groupKeyService.requiresKeyProvisioning;
  showLeftScrollCue = signal<boolean>(false);
  showRightScrollCue = signal<boolean>(false);
  isExporting = signal<boolean>(false);
  isFilterBottomSheetOpen = signal<boolean>(false);
  showSkeleton = signal<boolean>(false);
  isLoadingExpenses = signal<boolean>(false);
  isOffline = signal<boolean>(
    typeof window !== 'undefined' ? !navigator.onLine : false,
  );
  private skeletonTimeoutId?: any;
  membersError = signal<boolean>(false);
  balancesError = signal<boolean>(false);
  analyticsError = signal<boolean>(false);

  // Per-section loading/error state (Phase 2 — each section owns its own,
  // independent of the page shell and of every sibling section).
  isLoadingMembers = signal<boolean>(false);
  isLoadingBalances = signal<boolean>(false);
  isLoadingHistory = signal<boolean>(false);
  historyError = signal<boolean>(false);
  isLoadingTrash = signal<boolean>(false);
  trashError = signal<boolean>(false);
  isLoadingRecurring = signal<boolean>(false);
  recurringError = signal<boolean>(false);

  // Decryption lifecycle state (owned by the coordinator).
  decryptionPhase = this.decryptCoordinator.phase;
  decryptionSummary = this.decryptCoordinator.summary;

  /** Some expenses are still waiting for keys after the retry budget settled. */
  showKeysWaitingBanner = computed(
    () =>
      this.decryptionPhase() === 'settled' &&
      this.decryptionSummary().waiting > 0,
  );

  /** Some expenses can never be decrypted (no access / corrupted). */
  showKeysPermanentBanner = computed(
    () => this.decryptionSummary().permanent > 0,
  );

  /** Active automatic recovery in progress (drives the "retrying" hint). */
  isRecoveringKeys = computed(
    () =>
      this.decryptionPhase() === 'loading' ||
      this.decryptionPhase() === 'recovering',
  );

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

  // Expense Version History panel
  isHistoryPanelOpen = signal<boolean>(false);
  historyExpenseId = signal<string | null>(null);
  historyExpenseTitle = signal<string>('');
  expenseVersions = signal<any[]>([]);
  isLoadingVersions = signal<boolean>(false);
  historyLoadError = signal<string>('');

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

  isOwner = computed(() => {
    const userId = this.currentUserId();
    if (!userId) return false;
    const member = this.members().find((m) => m.user?.id === userId);
    return member?.role === 'owner';
  });

  /**
   * Derived, not imperatively set — group() and balances() now resolve
   * independently (they're fetched in parallel), so computing this reactively
   * means it's always correct regardless of which one lands first, instead of
   * being frozen at whatever group()'s value was at the moment balances
   * happened to resolve.
   */
  userBalance = computed(() => {
    const g = this.group();
    const currentUserId = this.currentUserId();
    const entry = this.balances().find(
      (b) => b.userId === currentUserId && b.currency === g?.currency,
    );
    return entry ? entry.netBalance : 0;
  });

  // Archive (Delete Group) dialog state
  isArchiveDialogOpen = signal<boolean>(false);
  archiveConfirmName = signal<string>('');
  archiveReason = signal<string>('');
  isArchiving = signal<boolean>(false);
  archiveError = signal<string>('');

  archiveNameMatches = computed(() => {
    const g = this.group();
    return g ? this.archiveConfirmName().trim() === g.name.trim() : false;
  });

  totalPages = computed(() => {
    return Math.ceil(this.totalExpenses() / this.pageSize()) || 1;
  });

  ngOnInit() {
    this.currentUserId.set(this.getCurrentUserId());
    this.closeMonthSelected.set(this.getCurrentMonthString());

    // Subscribe to query parameters to sync tab and filters
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((qParams) => {
        const tab = qParams['tab'] || 'ledger';
        if (
          [
            'ledger',
            'analytics',
            'history',
            'trash',
            'settings',
            'recurring',
          ].includes(tab)
        ) {
          this.activeTab.set(tab as any);

          // Load settings or recurring data if target tab is active
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

        const category = qParams['category'] || '';
        const start = qParams['start'] || '';
        const end = qParams['end'] || '';

        const isFilterChanged =
          this.filterCategory() !== category ||
          this.filterStartDate() !== start ||
          this.filterEndDate() !== end;

        this.filterCategory.set(category);
        this.filterStartDate.set(start);
        this.filterEndDate.set(end);

        const groupId = this.group()?.id;
        if (groupId && isFilterChanged) {
          this.currentPage.set(1);
          this.fetchExpenses(groupId);
        }

        this.scrollToActiveTab();
        this.checkScrollCues();
      });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const groupId = params.get('id');
        if (groupId) {
          this.startLoading();
          this.currentPage.set(1);

          // Prefill filters from URL before initial fetch
          const initialCategory =
            this.route.snapshot.queryParams['category'] || '';
          const initialStart = this.route.snapshot.queryParams['start'] || '';
          const initialEnd = this.route.snapshot.queryParams['end'] || '';
          this.filterCategory.set(initialCategory);
          this.filterStartDate.set(initialStart);
          this.filterEndDate.set(initialEnd);

          // Fired independently of getGroup() — none of these need the Group
          // response, only the groupId already available from the route.
          // (docs/audits/group-detail-progressive-loading-audit.md §6.1)
          this.fetchMembers(groupId);
          this.fetchBalances(groupId);
          this.fetchHistoryLogs(groupId);
          this.fetchDeletedExpenses(groupId);
          this.fetchRecurringExpenses(groupId);

          this.groupsService.getGroup(groupId).subscribe({
            next: (res) => {
              this.group.set(res);
              this.stopLoading();
              // Stays gated on getGroup(): needs res.groupType to decide the
              // household current-month date range before building its
              // request (see fetchExpenses below), the same real exception
              // already noted for fetchCarryForward in the audit.
              this.fetchExpenses(groupId);
              if (res.groupType === 'household') {
                this.fetchCarryForward(groupId);
              }
            },
            error: () => this.stopLoading(),
          });
        }
      });
  }

  /**
   * Called once membership (and therefore the caller's role) is known.
   * Proactively provisions key material, then hands the expense list to the
   * decryption coordinator which owns the decrypt → retry → success lifecycle.
   *
   * Routes the master-key check through CryptoSessionManager.
   * ensureCryptoContext() rather than calling encryptionService directly —
   * this keeps CryptoSessionManager.state accurate even for a brand-new or
   * empty group with nothing yet to decrypt (which would otherwise never
   * exercise the crypto session at all), so the shared
   * <app-crypto-recovery-panel> always reflects reality.
   */
  async initializeGroupKeysAndSelfHeal(groupId: string) {
    try {
      await this.cryptoSession.ensureCryptoContext('group_detail_init');
    } catch {
      // CryptoSessionManager.state already reflects the failure; the
      // shared recovery panel picks it up. Key provisioning below still
      // needs an attempt so an owner/admin's background self-heal keeps
      // working once their own session recovers.
    }

    const role = this.getCallerRole();
    // Proactively ensure keys exist / are provisioned for all members, even
    // before any expense is decrypted (matters for empty or new groups).
    await this.decryptCoordinator.provision(groupId, role);
    this.startDecryption();
  }

  /**
   * Start (or restart) the coordinator over the current expense list. Safe to
   * call repeatedly — it cancels any prior session and re-decrypts from the
   * ciphertext preserved on each item (no server round-trip needed).
   */
  private startDecryption() {
    const g = this.group();
    if (!g?.id) return;
    this.decryptCoordinator.start({
      groupId: g.id,
      role: this.getCallerRole(),
      getExpenses: () => this.expenses(),
      publish: (list) => this.expenses.set(list),
    });
  }

  async refreshGroupKey() {
    const g = this.group();
    if (!g?.id || this.isRefreshingKey()) return;

    this.isRefreshingKey.set(true);
    try {
      this.groupKeyService.invalidateGroupKey(g.id);
      await this.initializeGroupKeysAndSelfHeal(g.id);
      this.fetchExpenses(g.id);
      this.fetchBalances(g.id);
    } catch (e) {
      console.error('Failed to refresh group key:', e);
    } finally {
      this.isRefreshingKey.set(false);
    }
  }

  @ViewChild('tabBarContainer') tabBarContainer!: ElementRef<HTMLDivElement>;

  ngAfterViewInit() {
    this.checkScrollCues();
    this.scrollToActiveTab();
  }

  scrollToActiveTab() {
    setTimeout(() => {
      const activeEl =
        this.tabBarContainer?.nativeElement?.querySelector('.tab-active');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
    }, 150);
  }

  onTabBarScroll() {
    const el = this.tabBarContainer?.nativeElement;
    if (!el) return;
    requestAnimationFrame(() => {
      this.showLeftScrollCue.set(el.scrollLeft > 5);
      this.showRightScrollCue.set(
        el.scrollLeft < el.scrollWidth - el.clientWidth - 5,
      );
    });
  }

  checkScrollCues() {
    setTimeout(() => this.onTabBarScroll(), 200);
  }

  startLoading() {
    this.isLoading.set(true);
    this.showSkeleton.set(false);
    if (this.skeletonTimeoutId) {
      clearTimeout(this.skeletonTimeoutId);
    }
    this.skeletonTimeoutId = setTimeout(() => {
      if (this.isLoading()) {
        this.showSkeleton.set(true);
      }
    }, 200);
  }

  stopLoading() {
    this.isLoading.set(false);
    this.showSkeleton.set(false);
    if (this.skeletonTimeoutId) {
      clearTimeout(this.skeletonTimeoutId);
      this.skeletonTimeoutId = undefined;
    }
  }

  applyFilters() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.filterCategory() || null,
        start: this.filterStartDate() || null,
        end: this.filterEndDate() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    const groupId = this.group()?.id;
    if (groupId) {
      this.currentPage.set(1);
      this.fetchExpenses(groupId);
    }
  }

  resetFilters() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: null,
        start: null,
        end: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  @ViewChild('filterBtn') filterBtn!: ElementRef<HTMLButtonElement>;

  setFilterBottomSheet(isOpen: boolean) {
    this.isFilterBottomSheetOpen.set(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        this.filterBtn?.nativeElement?.focus();
      }, 100);
    } else {
      setTimeout(() => {
        const firstEl = document.querySelector(
          '#filterCategoryMobile button',
        ) as HTMLElement;
        firstEl?.focus();
      }, 150);
    }
  }

  onBottomSheetKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.setFilterBottomSheet(false);
      return;
    }

    if (event.key === 'Tab') {
      const modalEl = document.querySelector('.z-\\[100\\]');
      if (!modalEl) return;

      const focusableEls = modalEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableEls.length === 0) return;
      const firstEl = focusableEls[0] as HTMLElement;
      const lastEl = focusableEls[focusableEls.length - 1] as HTMLElement;

      if (event.shiftKey) {
        if (document.activeElement === firstEl) {
          lastEl.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastEl) {
          firstEl.focus();
          event.preventDefault();
        }
      }
    }
  }

  @HostListener('window:online')
  onOnline() {
    this.isOffline.set(false);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
      this.fetchBalances(g.id);
    }
  }

  @HostListener('window:offline')
  onOffline() {
    this.isOffline.set(true);
  }

  // unlockVault() removed — superseded by <app-crypto-recovery-panel>,
  // which owns the unlock action for every encrypted feature. The
  // constructor's isReady() effect above re-runs
  // initializeGroupKeysAndSelfHeal (and therefore re-fetches nothing extra
  // beyond what that already retriggers) once the panel restores the
  // session, so this page doesn't need its own copy of that flow anymore.

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

  /**
   * Owns its own section-scoped loading/error state (isLoadingExpenses /
   * ledgerError) — it no longer touches the page-wide isLoading/showSkeleton
   * gate, which now only covers the brief window until getGroup() resolves.
   */
  fetchExpenses(groupId: string) {
    this.isLoadingExpenses.set(true);
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
                    email = member.user?.email;
                    displayName = member.user?.displayName;
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
          this.isLoadingExpenses.set(false);
          this.ledgerError.set(false);
          // Hand the freshly-fetched list to the coordinator for
          // classification + automatic retry/recovery.
          this.startDecryption();
        },
        error: () => {
          this.isLoadingExpenses.set(false);
          this.ledgerError.set(true);
        },
      });
  }

  fetchMembers(groupId: string) {
    this.isLoadingMembers.set(true);
    this.membersError.set(false);
    this.groupsService.getMembers(groupId).subscribe({
      next: (res) => {
        this.members.set(res);
        this.isLoadingMembers.set(false);

        const currentUserId = this.currentUserId();
        const myMember = res.find((m) => m.user?.id === currentUserId);
        this.isViewer.set(myMember?.role === 'viewer');

        this.initializeGroupKeysAndSelfHeal(groupId);
      },
      error: (err) => {
        console.error('Failed to fetch group members', err);
        this.isLoadingMembers.set(false);
        this.membersError.set(true);
      },
    });
  }

  fetchBalances(groupId: string) {
    // No group()-null early return here (removed): this now fires in
    // parallel with getGroup() rather than after it. userBalance is a
    // computed() derived from group()+balances(), so it's correct regardless
    // of arrival order — see the userBalance computed() above.
    this.isLoadingBalances.set(true);
    this.balancesError.set(false);
    this.groupsService.getBalances(groupId).subscribe({
      next: (res) => {
        this.balances.set(res.balances);
        this.suggestedSettlements.set(res.suggestedSettlements);
        this.isLoadingBalances.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch balances', err);
        this.isLoadingBalances.set(false);
        this.balancesError.set(true);
      },
    });
  }

  fetchHistoryLogs(groupId: string) {
    this.isLoadingHistory.set(true);
    this.historyError.set(false);
    this.groupsService.getHistoryLogs(groupId).subscribe({
      next: (res) => {
        this.historyLogs.set(res.data || []);
        this.isLoadingHistory.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch history logs', err);
        this.isLoadingHistory.set(false);
        this.historyError.set(true);
      },
    });
  }

  fetchDeletedExpenses(groupId: string) {
    this.isLoadingTrash.set(true);
    this.trashError.set(false);
    this.groupsService.getDeletedExpenses(groupId).subscribe({
      next: (res) => {
        this.deletedExpenses.set(res.data || []);
        this.isLoadingTrash.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch deleted expenses', err);
        this.isLoadingTrash.set(false);
        this.trashError.set(true);
      },
    });
  }

  fetchCarryForward(groupId: string) {
    this.groupsService
      .getCarryForward(groupId, this.getCurrentMonthString())
      .subscribe({
        next: (res) => {
          this.carryForwardBalances.set(res || []);
        },
        error: (err) =>
          console.error('Failed to fetch carry-forward data', err),
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

  getUserName(userId: string | null | undefined): string {
    return resolveUserDisplayName(this.members(), userId);
  }

  /** True when a transaction is a refund (money returned to the group) rather
   *  than a normal expense — drives every visual distinction in the ledger. */
  isRefundTx(entity: { transactionType?: string | null }): boolean {
    return entity.transactionType === 'refund';
  }

  /**
   * Mirrors the backend's editing-window rule (see
   * ExpensesService.assertWithinEditWindow): the current calendar month is
   * always editable; the previous month is editable through the 7th
   * (inclusive) of the current month; anything older is read-only. Household
   * groups are exempt — they use their own explicit ledger-close lock
   * (isMonthLocked, driven by the month-navigation timeline).
   */
  private isPastEditWindow(expenseDate: string): boolean {
    const [yearStr, monthStr] = expenseDate.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-based
    if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
    // Passing the 1-based month as JS's 0-based index lands on the next
    // month, rolling the year over automatically (e.g. Dec -> Jan).
    const graceEnd = new Date(year, month, 7, 23, 59, 59, 999);
    return Date.now() > graceEnd.getTime();
  }

  /** True if this expense can no longer be added/edited/deleted per the
   *  previous-month editing window (or the household ledger-close lock). */
  isExpenseEditLocked(expense: GroupExpense): boolean {
    const g = this.group();
    if (g?.groupType === 'household') {
      return this.isMonthLocked();
    }
    return this.isPastEditWindow(expense.expenseDate);
  }

  /**
   * Group spending summary for the currently-loaded ledger page: total
   * expenses, total refunds, and net spending (expenses − refunds), in the
   * group's base currency. Client-side, page-scoped — matches what's on
   * screen; the authoritative per-currency figures live in balances().
   */
  ledgerSpendingSummary = computed(() => {
    const g = this.group();
    const currency = g?.currency;
    let totalExpense = 0;
    let totalRefund = 0;
    for (const expense of this.expenses()) {
      if (expense.status === 'void') continue;
      if (currency && expense.currency !== currency) continue;
      const amount = Number(expense.amountTotal) || 0;
      if (this.isRefundTx(expense)) {
        totalRefund += amount;
      } else {
        totalExpense += amount;
      }
    }
    return {
      totalExpense,
      totalRefund,
      netSpending: totalExpense - totalRefund,
    };
  });

  /** User-facing explanation for why a locked transaction can't be touched. */
  expenseLockMessage(expense: GroupExpense): string {
    const g = this.group();
    if (g?.groupType === 'household') {
      return `Household expenses from ${expense.ledgerMonth ?? 'a previous month'} are locked and cannot be modified.`;
    }
    const d = new Date(expense.expenseDate);
    const txMonth = d.toLocaleDateString('en-US', { month: 'long' });
    const lockDeadline = new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      1,
    ).toLocaleDateString('en-US', { month: 'long' });
    return `Transactions from ${txMonth} could only be modified until 7 ${lockDeadline} and are now locked.`;
  }

  /** Resolves the payer display name for a group expense or recurring template.
   *  Prefers paidByUserId; falls back to paidByGroupMemberId so contact-backed
   *  (pending) payers are handled correctly via memberDisplayName(). */
  payerDisplayName(entity: {
    paidByUserId?: string | null;
    paidByGroupMemberId?: string | null;
  }): string {
    if (entity.paidByUserId) {
      const m = this.members().find((m) => m.user?.id === entity.paidByUserId);
      if (m) return this.memberDisplayName(m);
    }
    if (entity.paidByGroupMemberId) {
      const m = this.members().find((m) => m.id === entity.paidByGroupMemberId);
      if (m) return this.memberDisplayName(m);
    }
    return 'Unknown User';
  }

  /** Display name for a member, whichever identity backs it (registered or pending). */
  memberDisplayName(member: GroupMember): string {
    return resolveMemberDisplayName(member);
  }

  openExpenseModal(expense?: GroupExpense) {
    this.selectedExpenseForEdit.set(expense || null);
    this.isExpenseModalOpen.set(true);
  }

  closeExpenseModal() {
    this.selectedExpenseForEdit.set(null);
    this.isExpenseModalOpen.set(false);
  }

  openExpenseHistory(expense: GroupExpense) {
    this.historyExpenseId.set(expense.id);
    this.historyExpenseTitle.set(String(expense.title ?? ''));
    this.expenseVersions.set([]);
    this.historyLoadError.set('');
    this.isLoadingVersions.set(true);
    this.isHistoryPanelOpen.set(true);

    this.expensesService.getExpenseVersionHistory(expense.id).subscribe({
      next: (versions) => {
        this.expenseVersions.set(versions);
        this.isLoadingVersions.set(false);
      },
      error: (err) => {
        this.historyLoadError.set(
          err.error?.message || 'Failed to load version history.',
        );
        this.isLoadingVersions.set(false);
      },
    });
  }

  closeExpenseHistory() {
    this.isHistoryPanelOpen.set(false);
    this.historyExpenseId.set(null);
    this.expenseVersions.set([]);
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

  /**
   * Export the full group ledger to Excel.
   *
   * The backend returns every expense in the group as ciphertext (it can't
   * decrypt — zero-knowledge); this client fetches those rows, decrypts the
   * title/description with the group key, and builds the .xlsx locally. That's
   * why the old server-side CSV/xlsx export is gone: it wrote ciphertext into
   * the file. Respects the ledger's active category/date filters.
   */
  async exportLedger() {
    const g = this.group();
    if (!g || this.isExporting()) return;

    this.isExporting.set(true);
    try {
      const filter: ExportFilter = {
        groupId: g.id,
        type: 'group',
        from: this.filterStartDate() || '',
        to: this.filterEndDate() || '',
        category: this.filterCategory() || undefined,
      };
      const datePart = new Date().toISOString().slice(0, 10);
      await this.expenseExportService.exportExpenses(
        filter,
        'xlsx',
        `ledger-${this.sanitizeForFilename(g.name)}-${datePart}`,
      );
    } catch (err: any) {
      alert(
        'Failed to export ledger: ' +
          (err?.error?.message || err?.message || 'Unknown error'),
      );
    } finally {
      this.isExporting.set(false);
    }
  }

  /**
   * Make a group name safe to drop into a download filename: strip characters
   * that are invalid on Windows/macOS filesystems (`< > : " / \ | ? *` and
   * control chars), collapse whitespace, and trim trailing dots/spaces
   * (which Windows also rejects). Falls back to `group` when nothing is left.
   */
  private sanitizeForFilename(name: string): string {
    const cleaned = (name ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
    return cleaned || 'group';
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

  changePage(delta: number) {
    this.currentPage.update((val) => val + delta);
    const g = this.group();
    if (g?.id) {
      this.fetchExpenses(g.id);
    }
  }

  async downloadAttachment(file: any) {
    if (file.encryptedFileKey && file.encryptedOriginalName) {
      try {
        const expense = this.expenses().find((e) => e.id === file.expenseId);
        if (!expense) {
          throw new Error('Expense context not found for attachment');
        }

        // Reuse the central pipeline's scope-key resolution + classification
        // instead of re-implementing it here. resolveExpenseKey() never
        // rejects (it swallows session failures into keyStatus:'no_session'),
        // so the null-key check has to throw *inside* the operation passed to
        // runWithRecovery — only then can its catch see the failure, verify
        // it's a genuine session block, and queue+auto-resume the whole
        // decrypt-and-save flow once unlocked, instead of failing with an
        // alert the user has to dismiss before clicking download again.
        const scopeKey = await this.recoveryQueue.runWithRecovery(async () => {
          const result = await this.expenseDecryption.resolveExpenseKey(
            expense as any,
          );
          if (!result.key) {
            throw new Error(
              classifyDecryptionError({ keyStatus: result.keyStatus }).message,
            );
          }
          return result.key;
        });

        const fileKey = await this.encryptionService.unwrapKey(
          file.encryptedFileKey,
          scopeKey,
        );
        const decryptedName = await this.encryptionService.decrypt(
          file.encryptedOriginalName,
          fileKey,
        );

        const encryptedBytes = localStorage.getItem(
          `sim_storage:${file.storageKey}`,
        );
        if (!encryptedBytes) {
          throw new Error(
            'Attachment file data not found in simulation storage',
          );
        }

        const decryptedBytes = await this.encryptionService.decryptBytes(
          encryptedBytes,
          fileKey,
        );

        const blob = new Blob([decryptedBytes], {
          type: file.mimeType || 'application/octet-stream',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = decryptedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (err: any) {
        console.error(err);
        alert('Failed to decrypt attachment: ' + (err.message || err));
      }
    } else {
      alert(`Downloading attachment (Legacy): ${file.originalName}`);
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
    this.isLoadingRecurring.set(true);
    this.recurringError.set(false);
    this.recurringExpensesService.getRecurringExpenses(groupId).subscribe({
      next: (res) => {
        this.recurringExpenses.set(res || []);
        this.isLoadingRecurring.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch recurring expenses', err);
        this.isLoadingRecurring.set(false);
        this.recurringError.set(true);
      },
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

  onRecurringExpenseSaved(saved?: { firstOccurrenceGenerated?: boolean }) {
    const g = this.group();
    if (g?.id) {
      this.fetchRecurringExpenses(g.id);
      // When the template's start date is today, the backend materializes the
      // first occurrence immediately — refresh the ledger (and balances/history)
      // exactly like a manual expense create so it shows without a reload.
      if (saved?.firstOccurrenceGenerated) {
        this.onExpenseCreated();
      }
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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
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

  openArchiveDialog() {
    this.archiveConfirmName.set('');
    this.archiveReason.set('');
    this.archiveError.set('');
    this.isArchiveDialogOpen.set(true);
  }

  closeArchiveDialog() {
    this.isArchiveDialogOpen.set(false);
    this.archiveConfirmName.set('');
    this.archiveReason.set('');
    this.archiveError.set('');
  }

  confirmArchiveGroup() {
    const g = this.group();
    if (!g || !this.archiveNameMatches()) return;
    this.isArchiving.set(true);
    this.archiveError.set('');

    this.groupsService
      .archiveGroup(g.id, this.archiveReason() || undefined)
      .subscribe({
        next: () => {
          this.isArchiving.set(false);
          this.closeArchiveDialog();
          this.router.navigate(['/groups']);
        },
        error: (err) => {
          this.isArchiving.set(false);
          this.archiveError.set(
            err.error?.message || 'Failed to delete group. Please try again.',
          );
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
    void member;
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
