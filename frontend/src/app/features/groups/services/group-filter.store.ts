import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_GROUP_FILTER,
  DatePreset,
  GroupFilter,
  TransactionTypeFilter,
  cloneFilter,
  countActiveFilters,
} from '../models/group-filter.model';
import {
  ResolvedRange,
  formatDateRangeLabel,
  resolveDatePreset,
} from '../utils/date-preset.util';

/**
 * Single source of truth for the group page's unified filter.
 *
 * Holds two states:
 *  - `applied`  — the committed filter that drives every fetch.
 *  - `draft`    — the drawer's working copy (Apply commits it, Cancel/Reset
 *                 discard it).
 *
 * Router-free by design so it stays trivially unit-testable; the owning
 * component persists `applied` to the URL and re-fetches when it changes.
 * Provided at the component level (not root) so each group page gets its own.
 */
@Injectable()
export class GroupFilterStore {
  private readonly _applied = signal<GroupFilter>(
    cloneFilter(DEFAULT_GROUP_FILTER),
  );
  private readonly _draft = signal<GroupFilter>(
    cloneFilter(DEFAULT_GROUP_FILTER),
  );

  readonly applied = this._applied.asReadonly();
  readonly draft = this._draft.asReadonly();

  /** Non-default filters on the applied set — drives the badge. */
  readonly activeCount = computed(() => countActiveFilters(this._applied()));
  readonly hasActiveFilters = computed(() => this.activeCount() > 0);

  /** Non-default filters on the draft — for a live count inside the drawer. */
  readonly draftCount = computed(() => countActiveFilters(this._draft()));

  /** Applied date preset resolved to concrete `{from,to}` bounds. */
  readonly resolvedRange = computed<ResolvedRange>(() => {
    const d = this._applied().date;
    return resolveDatePreset(d.preset, new Date(), {
      from: d.from,
      to: d.to,
    });
  });

  /** Header label for the applied date filter. */
  readonly dateRangeLabel = computed(() => {
    const d = this._applied().date;
    const { from, to } = this.resolvedRange();
    return formatDateRangeLabel(d.preset, from, to);
  });

  /** Seed both applied and draft (e.g. from URL query params on load). */
  initialize(f: GroupFilter): void {
    this._applied.set(cloneFilter(f));
    this._draft.set(cloneFilter(f));
  }

  /** Copy applied → draft; call when the drawer opens. */
  openDraft(): void {
    this._draft.set(cloneFilter(this._applied()));
  }

  // ── Draft mutators (drawer controls bind through these) ───────────────────

  setDraftPreset(preset: DatePreset): void {
    this._draft.update((d) => ({
      ...d,
      date:
        preset === 'custom'
          ? { preset, from: d.date.from, to: d.date.to }
          : { preset },
    }));
  }

  setDraftCustomFrom(from: string): void {
    this._draft.update((d) => ({
      ...d,
      date: { ...d.date, preset: 'custom', from: from || undefined },
    }));
  }

  setDraftCustomTo(to: string): void {
    this._draft.update((d) => ({
      ...d,
      date: { ...d.date, preset: 'custom', to: to || undefined },
    }));
  }

  setDraftCategory(category: string): void {
    this._draft.update((d) => ({ ...d, category: category || undefined }));
  }

  setDraftMember(memberId: string): void {
    this._draft.update((d) => ({ ...d, memberId: memberId || undefined }));
  }

  setDraftPaidBy(paidById: string): void {
    this._draft.update((d) => ({ ...d, paidById: paidById || undefined }));
  }

  setDraftTxType(transactionType: TransactionTypeFilter): void {
    this._draft.update((d) => ({ ...d, transactionType }));
  }

  // ── Lifecycle actions ─────────────────────────────────────────────────────

  /** Commit draft → applied. Returns the newly applied filter. */
  apply(): GroupFilter {
    this._applied.set(cloneFilter(this._draft()));
    return this._applied();
  }

  /** Reset the draft to defaults (Clear All inside the drawer). */
  resetDraft(): void {
    this._draft.set(cloneFilter(DEFAULT_GROUP_FILTER));
  }

  /** Discard draft edits (Cancel closes the drawer without applying). */
  cancelDraft(): void {
    this._draft.set(cloneFilter(this._applied()));
  }

  // ── Remove a single applied filter (from a removable summary chip) ──────────
  // Each mutates the applied set directly and re-syncs the draft, so the owning
  // component's applied() effect re-fetches and updates the URL.

  private syncDraftToApplied(): void {
    this._draft.set(cloneFilter(this._applied()));
  }

  /** Reset the date filter back to the default (This Month). */
  clearAppliedDate(): void {
    this._applied.update((a) => ({ ...a, date: { preset: 'this_month' } }));
    this.syncDraftToApplied();
  }

  clearAppliedCategory(): void {
    this._applied.update((a) => ({ ...a, category: undefined }));
    this.syncDraftToApplied();
  }

  clearAppliedMember(): void {
    this._applied.update((a) => ({ ...a, memberId: undefined }));
    this.syncDraftToApplied();
  }

  clearAppliedPaidBy(): void {
    this._applied.update((a) => ({ ...a, paidById: undefined }));
    this.syncDraftToApplied();
  }

  clearAppliedTxType(): void {
    this._applied.update((a) => ({ ...a, transactionType: 'both' }));
    this.syncDraftToApplied();
  }
}
