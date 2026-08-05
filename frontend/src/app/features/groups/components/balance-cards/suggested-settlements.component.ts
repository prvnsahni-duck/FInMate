import { Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { GroupMember } from '@finmate/data-models';
import { resolveUserDisplayName } from '../../utils/member-display.util';
import { SuggestedSettlement } from '../group-balances/group-balances.component';

/**
 * One labelled, static (non-carousel) list of suggested settlements for a single
 * scope. Rendered twice on the group page — once for the Overall scope, once for
 * the current Period/Filtered scope — so the two are easy to compare vertically.
 */
@Component({
  selector: 'app-suggested-settlements',
  standalone: true,
  imports: [CurrencyPipe],
  template: `
    @if (settlements().length > 0) {
      <div>
        <h3
          class="text-xs font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-2"
        >
          {{ scopeLabel() }}
          @if (excludesSettlements()) {
            <span class="text-[10px] font-semibold text-primary normal-case"
              >(excludes settlements)</span
            >
          }
        </h3>
        <div class="space-y-3">
          @for (s of settlements(); track s.fromUserId + s.toUserId) {
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
export class SuggestedSettlementsComponent {
  scopeLabel = input.required<string>();
  settlements = input.required<SuggestedSettlement[]>();
  members = input.required<GroupMember[]>();
  /** Show the "(excludes settlements)" hint (period/filtered scope only). */
  excludesSettlements = input<boolean>(false);
  /**
   * Optional pre-resolved names keyed by the settlement's from/to id. Used by the
   * household flow, where settlements are keyed by GroupMember id (resolved to a
   * display name here) rather than by user id. Takes precedence when present.
   */
  nameByKey = input<Record<string, string> | null>(null);

  getUserName(userId: string | null | undefined): string {
    const map = this.nameByKey();
    if (map && userId && map[userId]) return map[userId];
    return resolveUserDisplayName(this.members(), userId);
  }
}
