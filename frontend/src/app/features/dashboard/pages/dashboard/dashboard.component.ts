import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { AuthState } from '../../../../core/auth/auth.state';
import { AuthService } from '../../../../core/auth/auth.service';
import { CreateExpenseModalComponent } from '../../../groups/components/create-expense-modal/create-expense-modal.component';
import { AnalyticsChartsComponent } from '../../../groups/components/analytics-charts/analytics-charts.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { StatsCardComponent } from '../../../../shared/components/stats-card/stats-card.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { GroupsService } from '../../../groups/services/groups.service';
import { ExpensesService } from '../../../groups/services/expenses.service';
import { PendingInvitationResponse, Profile } from '@finmate/data-models';
import { GroupExpense } from '../../../groups/pages/group-detail/group-detail.component';
import { AiService } from '../../services/ai.service';
import {
  DropdownComponent,
  DropdownOption,
} from '../../../../shared/components/dropdown/dropdown.component';
import { DashboardHomeComponent } from '../../components/dashboard-home/dashboard-home.component';
import { DashboardAnalyticsComponent } from '../../components/dashboard-analytics/dashboard-analytics.component';
import { DashboardGoalsComponent } from '../../components/dashboard-goals/dashboard-goals.component';
import { DashboardSettingsComponent } from '../../components/dashboard-settings/dashboard-settings.component';
import { DashboardProfileComponent } from '../../components/dashboard-profile/dashboard-profile.component';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    DatePipe,
    CreateExpenseModalComponent,
    AnalyticsChartsComponent,
    ConfirmModalComponent,
    StatsCardComponent,
    IconComponent,
    DropdownComponent,
    DashboardHomeComponent,
    DashboardAnalyticsComponent,
    DashboardGoalsComponent,
    DashboardSettingsComponent,
    DashboardProfileComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  bankIconPath =
    'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z';
  creditCardIconPath =
    'M19 4H5a3 3 0 00-3 3v10a3 3 0 003 3h14a3 3 0 003-3V7a3 3 0 00-3-3zM5 6h14a1 1 0 011 1v2H4V7a1 1 0 011-1zm14 12H5a1 1 0 01-1-1v-5h16v5a1 1 0 01-1 1z';
  usersIconPath =
    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75';
  cogIconPath =
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z';
  bellIconPath =
    'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0';
  inboxIconPath =
    'M20 12h-4l-3 3h-2l-3-3H4V6h16v6z M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z';

  private destroy$ = new Subscription();
  categoryAnalytics: {
    category: string;
    amount: number;
    percentage: number;
  }[] = [];
  quickLogCategory = CATEGORY_OPTIONS[0].value; // Default to first category
  private store = inject(Store);
  private groupsService = inject(GroupsService);
  private expensesService = inject(ExpensesService);
  private authService = inject(AuthService);
  private aiService = inject(AiService);

  get activeTab(): string {
    return this.expensesService.activeTab();
  }

  protected readonly Math = Math;

  userName = 'User';
  userEmail = 'N/A';
  totalBalance = 0;
  monthlyExpenses = 0;
  activeGroupsCount = 0;
  personalExpenses: GroupExpense[] = [];
  get isExpenseModalOpen(): boolean {
    return this.expensesService.showCreateExpenseModal();
  }
  set isExpenseModalOpen(val: boolean) {
    this.expensesService.showCreateExpenseModal.set(val);
  }
  isLoading = true;

  // AI Chat Bot State
  isAiChatOpen = false;
  aiOptIn = false;
  aiMessages: { sender: 'user' | 'ai'; text: string; time: Date }[] = [];
  aiInput = '';
  isAiLoading = false;

  // Profile and Budget Trackers
  userProfile: Profile | null = null;
  pendingInvitations: PendingInvitationResponse[] = [];
  incomePercentage = 0;
  budgetPercentage = 0;

  // Edit Budget/Income State
  isEditingIncome = false;
  newIncome = 0;
  newBudget = 0;
  newCurrency = 'USD';

  currencyOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)', description: 'US Dollar' },
    { value: 'INR', label: 'INR (₹)', description: 'Indian Rupee' },
    { value: 'EUR', label: 'EUR (€)', description: 'Euro' },
    { value: 'GBP', label: 'GBP (£)', description: 'British Pound' },
    { value: 'JPY', label: 'JPY (¥)', description: 'Japanese Yen' },
    { value: 'CAD', label: 'CAD (C$)', description: 'Canadian Dollar' },
    { value: 'AUD', label: 'AUD (A$)', description: 'Australian Dollar' },
  ];

  // Track edit mode
  selectedExpenseForEdit: GroupExpense | null = null;

  // Confirm delete modal state
  isDeleteConfirmOpen = false;
  deleteExpenseId: string | null = null;

  ngOnInit() {
    const user = this.store.selectSnapshot(AuthState.getUser);
    if (user?.email) {
      this.userName = user.email.split('@')[0];
      this.userEmail = user.email;
    }
    this.aiOptIn = localStorage.getItem('finmate_ai_opt_in') === 'true';
    this.fetchData();

    const sub = this.expensesService.expenseCreated$.subscribe(() => {
      this.fetchData();
    });
    this.destroy$.add(sub);
  }

  ngOnDestroy() {
    this.destroy$.unsubscribe();
  }

  fetchData() {
    this.isLoading = true;

    // 1. Fetch personal expenses
    this.expensesService.getExpenses('personal').subscribe({
      next: (res) => {
        this.personalExpenses = (res.data as GroupExpense[]) || [];
        // Personal balance is simply the sum of all personal expenses logged
        this.totalBalance = this.personalExpenses.reduce(
          (sum, e) => sum + Number(e.amountTotal),
          0,
        );
        this.isLoading = false;
      },
      error: () => (this.isLoading = false),
    });

    // 2. Fetch monthly summary for personal analytics
    this.expensesService.getMonthlyAnalytics('personal').subscribe({
      next: (res) => {
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        const currentMonthData = res.find((r) => r.month === currentMonthStr);
        this.monthlyExpenses = currentMonthData ? currentMonthData.total : 0;
        this.recalculatePercentages();
      },
      error: () => {
        console.error('Failed to fetch monthly analytics');
      },
    });

    // 3. Fetch active groups to count them
    this.groupsService.getGroups().subscribe({
      next: (res) => {
        this.activeGroupsCount = res.meta?.totalItems || res.data?.length || 0;
      },
      error: () => {
        console.error('Failed to fetch active groups');
      },
    });

    // 4. Fetch profile
    this.authService.getMe().subscribe({
      next: (res) => {
        this.userProfile = res.profile;
        this.newIncome = res.profile.monthlyIncome || 0;
        this.newBudget = res.profile.monthlyBudget || 0;
        this.newCurrency = res.profile.defaultCurrency || 'USD';
        this.recalculatePercentages();
      },
      error: () => {
        console.error('Failed to fetch profile');
      },
    });

    // 5. Fetch pending invitations
    this.groupsService.getPendingInvitations().subscribe({
      next: (res) => {
        this.pendingInvitations = res;
      },
      error: () => {
        console.error('Failed to fetch pending invitations');
      },
    });

    // 6. Fetch category analytics
    this.expensesService.getCategoryAnalytics('personal').subscribe({
      next: (res) => {
        const total = res.reduce((sum, item) => sum + Number(item.total), 0);
        this.categoryAnalytics = res
          .map((item) => ({
            category: item.category,
            amount: Number(item.total),
            percentage:
              total > 0 ? Math.round((Number(item.total) / total) * 100) : 0,
          }))
          .sort((a, b) => b.amount - a.amount);
      },
      error: () => {
        console.error('Failed to fetch category analytics');
      },
    });
  }

  recalculatePercentages() {
    this.incomePercentage = this.userProfile?.monthlyIncome
      ? Math.round(
          (this.monthlyExpenses / this.userProfile.monthlyIncome) * 100,
        )
      : 0;
    this.budgetPercentage = this.userProfile?.monthlyBudget
      ? Math.round(
          (this.monthlyExpenses / this.userProfile.monthlyBudget) * 100,
        )
      : 0;
  }

  get incomeProgressWidth(): number {
    const income = this.userProfile?.monthlyIncome;
    return income ? Math.min((this.monthlyExpenses / income) * 100, 100) : 0;
  }

  get budgetProgressWidth(): number {
    const budget = this.userProfile?.monthlyBudget;
    return budget ? Math.min((this.monthlyExpenses / budget) * 100, 100) : 0;
  }

  get isBudgetExceeded(): boolean {
    const budget = this.userProfile?.monthlyBudget;
    return !!budget && this.monthlyExpenses > budget;
  }

  toggleEditIncome() {
    this.isEditingIncome = !this.isEditingIncome;
    if (this.isEditingIncome && this.userProfile) {
      this.newIncome = this.userProfile.monthlyIncome || 0;
      this.newBudget = this.userProfile.monthlyBudget || 0;
      this.newCurrency = this.userProfile.defaultCurrency || 'USD';
    }
  }

  saveIncome() {
    this.authService
      .updateProfile({
        defaultCurrency: this.newCurrency,
        monthlyIncome: Number(this.newIncome),
        monthlyBudget: Number(this.newBudget),
      })
      .subscribe({
        next: (res) => {
          this.userProfile = res.profile;
          this.isEditingIncome = false;
          this.recalculatePercentages();
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to update profile settings.');
        },
      });
  }

  acceptInvitation(invite: PendingInvitationResponse) {
    this.groupsService
      .updateMember(invite.id, invite.membershipId, { joinStatus: 'active' })
      .subscribe({
        next: () => {
          this.fetchData();
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to accept invitation');
        },
      });
  }

  declineInvitation(invite: PendingInvitationResponse) {
    this.groupsService.removeMember(invite.id, invite.membershipId).subscribe({
      next: () => {
        this.fetchData();
      },
      error: (err) => {
        alert(err.error?.message || 'Failed to decline invitation');
      },
    });
  }

  openExpenseModal(expense?: GroupExpense, category?: string) {
    if (category) {
      this.quickLogCategory = category;
      this.selectedExpenseForEdit = null;
    } else {
      this.quickLogCategory = expense
        ? expense.category
        : CATEGORY_OPTIONS[0].value;
      this.selectedExpenseForEdit = expense || null;
    }
    this.isExpenseModalOpen = true;
  }

  closeExpenseModal() {
    this.selectedExpenseForEdit = null;
    this.isExpenseModalOpen = false;
  }

  onExpenseCreated() {
    this.fetchData();
  }

  confirmDeleteExpense(expenseId: string) {
    this.deleteExpenseId = expenseId;
    this.isDeleteConfirmOpen = true;
  }

  onDeleteConfirmed() {
    if (this.deleteExpenseId) {
      this.expensesService.deleteExpense(this.deleteExpenseId).subscribe({
        next: () => {
          this.isDeleteConfirmOpen = false;
          this.deleteExpenseId = null;
          this.fetchData();
        },
        error: (err) => {
          this.isDeleteConfirmOpen = false;
          this.deleteExpenseId = null;
          alert(err.error?.message || 'Failed to delete expense');
        },
      });
    }
  }

  onDeleteCancelled() {
    this.isDeleteConfirmOpen = false;
    this.deleteExpenseId = null;
  }

  // AI Chat Bot Methods
  toggleAiChat() {
    this.isAiChatOpen = !this.isAiChatOpen;
    if (this.isAiChatOpen && this.aiOptIn && this.aiMessages.length === 0) {
      this.initAiGreeting();
    }
  }

  toggleAiOptIn(event: any) {
    this.aiOptIn = event.target.checked;
    localStorage.setItem('finmate_ai_opt_in', this.aiOptIn ? 'true' : 'false');
    if (this.aiOptIn && this.aiMessages.length === 0) {
      this.initAiGreeting();
    }
  }

  initAiGreeting() {
    this.aiMessages = [
      {
        sender: 'ai',
        text: `Hi ${this.userName}! I'm your FinMate AI financial assistant. I can see you've spent ${this.monthlyExpenses} USD of your ${this.userProfile?.monthlyBudget || 0} USD monthly budget. Ask me anything about your categories or how to optimize your spending!`,
        time: new Date(),
      },
    ];
  }

  sendAiMessage(customPrompt?: string) {
    const prompt = (customPrompt || this.aiInput).trim();
    if (!prompt) return;

    // Add user message
    this.aiMessages.push({
      sender: 'user',
      text: prompt,
      time: new Date(),
    });

    if (!customPrompt) {
      this.aiInput = '';
    }

    this.isAiLoading = true;

    // Construct the context-aware system instruction
    const budget = this.userProfile?.monthlyBudget || 0;
    const income = this.userProfile?.monthlyIncome || 0;
    const systemInstruction =
      `You are FinMate's personal financial AI companion. The current user is ${this.userName}. ` +
      `Their current monthly personal spending is ${this.monthlyExpenses} USD, relative to a monthly budget of ${budget} USD (${this.budgetPercentage}% utilization) and a monthly salary of ${income} USD. ` +
      `Their current total balance of personal logged expenses is ${this.totalBalance} USD. ` +
      `Answer in a concise, friendly, and professional tone (max 3-4 sentences). Do not mention database IDs, keys, or technical jargon. Give actionable financial tips.`;

    this.aiService.sendMessage(prompt, systemInstruction).subscribe({
      next: (res) => {
        this.aiMessages.push({
          sender: 'ai',
          text: res.text,
          time: new Date(),
        });
        this.isAiLoading = false;
      },
      error: (err) => {
        this.aiMessages.push({
          sender: 'ai',
          text: `Sorry, I encountered an error: ${err.error?.message || 'Failed to contact AI service.'}`,
          time: new Date(),
        });
        this.isAiLoading = false;
      },
    });
  }
}
