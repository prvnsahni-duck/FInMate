import { Component, input } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { GroupMember } from '@finmate/data-models';

export interface SuggestedSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}

@Component({
  selector: 'app-group-balances',
  standalone: true,
  imports: [CurrencyPipe, NgClass],
  template: `
    <div
      class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5"
    >
      <h2 class="text-xl font-bold mb-4">Your Balance</h2>
      <div
        class="text-3xl font-bold mb-2"
        [ngClass]="{
          'text-green-500 dark:text-green-400': userBalance() > 0,
          'text-red-500 dark:text-red-400': userBalance() < 0,
          'text-slate-500': userBalance() === 0,
        }"
      >
        {{ userBalance() > 0 ? '+' : ''
        }}{{ userBalance() | currency: groupCurrency() }}
      </div>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{
          userBalance() > 0
            ? 'You are owed by the group.'
            : userBalance() < 0
              ? 'You owe the group.'
              : 'You are all settled up!'
        }}
      </p>
    </div>

    <!-- Suggested Settlements -->
    @if (suggestedSettlements().length > 0) {
      <div
        class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5 mt-8"
      >
        <h2 class="text-xl font-bold mb-4">Suggested Settlements</h2>
        <div class="space-y-3">
          @for (s of suggestedSettlements(); track s.fromUserId + s.toUserId) {
            <div
              class="text-sm p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5"
            >
              <span class="font-semibold">{{ getUserName(s.fromUserId) }}</span>
              owes
              <span class="font-semibold">{{ getUserName(s.toUserId) }}</span>
              <div class="text-lg font-bold text-finmate-neon mt-1">
                {{ s.amount | currency: s.currency }}
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class GroupBalancesComponent {
  userBalance = input.required<number>();
  groupCurrency = input.required<string>();
  suggestedSettlements = input.required<SuggestedSettlement[]>();
  members = input.required<GroupMember[]>();

  getUserName(userId: string): string {
    const member = this.members().find((m) => m.user?.id === userId);
    return member
      ? member.user.displayName || member.user.email
      : 'Unknown User';
  }
}
