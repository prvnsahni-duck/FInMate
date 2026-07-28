import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface GroupAuditLog {
  id: string;
  action: string;
  actorDisplayName?: string;
  metadata?: {
    title?: string;
    newTitle?: string;
    amountTotal?: number;
    currency?: string;
  };
  createdAt: string | Date;
}

@Component({
  selector: 'app-group-history-log',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div
      class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5"
    >
      <h2 class="text-xl font-bold mb-6">Group History Audit Log</h2>

      @if (historyLogs().length === 0) {
        <div class="text-center py-12">
          <p class="text-slate-500 dark:text-slate-400">
            No history logged yet.
          </p>
        </div>
      } @else {
        <div class="space-y-4">
          @for (log of historyLogs(); track log.id || log.createdAt) {
            <div
              class="flex items-start space-x-3 text-sm p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div
                class="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center font-bold text-xs shrink-0 text-slate-500"
              >
                {{
                  (log.actorDisplayName || 'System')
                    .substring(0, 2)
                    .toUpperCase()
                }}
              </div>
              <div class="flex-1">
                <p class="text-slate-700 dark:text-slate-300">
                  <span class="font-bold text-slate-900 dark:text-white">{{
                    log.actorDisplayName || 'System'
                  }}</span>
                  {{ getLogMessage(log) }}
                </p>
                <p class="text-[10px] text-slate-400 mt-1">
                  {{ log.createdAt | date: 'medium' }}
                </p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class GroupHistoryLogComponent {
  historyLogs = input.required<GroupAuditLog[]>();

  /**
   * Human-readable phrasing for non-expense actions (expense.* is handled
   * separately because it interpolates the title/amount). Anything not listed
   * falls back to a humanized version of the raw code so the log never shows
   * a machine string like "group.keys_provisioned".
   */
  private static readonly ACTION_LABELS: Record<string, string> = {
    'group.created': 'created the group',
    'group.updated': 'updated the group settings',
    'group.archived': 'archived the group',
    'group.keys_provisioned': 'set up group encryption',
    'group.key_rotated': 'rotated the group encryption key',
    'group.member_invited': 'invited a new member',
    'group.member_joined': 'joined the group',
    'group.member_left': 'left the group',
    'group.member_removed': 'removed a member',
    'group.member_updated': "updated a member's role",
    'group.month_closed': 'closed the monthly ledger',
    'group.expenses_imported': 'imported expenses',
    'group.contributions_updated': 'updated contributions',
    'group.invite_created': 'created an invite link',
    'group.invite_link_regenerated': 'regenerated the invite link',
    'settlement.proposed': 'proposed a settlement',
    'settlement.confirmed': 'confirmed a settlement',
    'settlement.cancelled': 'cancelled a settlement',
  };

  getLogMessage(log: GroupAuditLog): string {
    const act = log.action;
    const title = log.metadata?.title || log.metadata?.newTitle || 'an expense';
    const amt = log.metadata?.amountTotal
      ? ` (${log.metadata.amountTotal} ${log.metadata.currency || ''})`
      : '';
    if (act === 'expense.created') return `created expense "${title}"${amt}`;
    if (act === 'expense.updated') return `updated expense to "${title}"${amt}`;
    if (act === 'expense.deleted') return `deleted expense "${title}"${amt}`;
    if (act === 'expense.restored') return `restored expense "${title}"`;

    const known = GroupHistoryLogComponent.ACTION_LABELS[act];
    if (known) return known;

    // Fallback: turn "group.some_action" into "some action" so unmapped or
    // future codes still read as prose rather than an identifier.
    const humanized = act
      .replace(/^[a-z]+\./, '')
      .replace(/[._]/g, ' ')
      .trim();
    return humanized ? `performed "${humanized}"` : 'performed an action';
  }
}
