import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { GroupBalanceBreakdown } from '../../services/groups.service';

/**
 * Two-card swipeable balance carousel: **Overall** (the caller's true
 * carry-forward balance, never affected by filters) and **Period** (This Month
 * by default, or the active filter slice). Mobile swipe uses native CSS
 * scroll-snap; desktop gets pagination dots + arrow-key navigation. The Overall
 * card expands into an Opening / Period / Closing breakdown.
 *
 * Presentational only — all figures are inputs computed upstream from the
 * backend response. Settlements are intentionally NOT rendered here (they live
 * in a separate static vertical section so both scopes can be compared).
 */
@Component({
  selector: 'app-balance-carousel',
  standalone: true,
  imports: [CurrencyPipe, NgClass],
  styles: [
    `
      :host {
        display: block;
      }
      .track {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .track::-webkit-scrollbar {
        display: none;
      }
    `,
  ],
  template: `
    <div
      class="track flex overflow-x-auto snap-x snap-mandatory scroll-smooth outline-none"
      tabindex="0"
      role="group"
      aria-roledescription="carousel"
      aria-label="Balances"
      #track
      (scroll)="onScroll(track)"
      (keydown.arrowright)="goTo(1)"
      (keydown.arrowleft)="goTo(0)"
    >
      <!-- Card 1 — Period / Filtered (shown first) -->
      <div
        class="w-full flex-shrink-0 snap-center"
        role="group"
        aria-roledescription="slide"
        [attr.aria-label]="periodTitle() + ' balance'"
      >
        <div
          class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5"
        >
          <div class="flex items-center justify-between mb-2 gap-2">
            <h2 class="text-sm font-bold uppercase tracking-wide text-muted">
              {{ periodTitle() }}
            </h2>
            @if (periodSubtitle()) {
              <span
                class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate max-w-[55%] text-right"
                >{{ periodSubtitle() }}</span
              >
            }
          </div>
          <div class="text-3xl font-bold" [ngClass]="amountClass(period())">
            {{ period() > 0 ? '+' : '' }}{{ period() | currency: currency() }}
          </div>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Analytical view · excludes settlements
          </p>
        </div>
      </div>

      <!-- Card 2 — Overall -->
      <div
        class="w-full flex-shrink-0 snap-center"
        role="group"
        aria-roledescription="slide"
        aria-label="Overall balance"
      >
        <div
          class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5"
        >
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-bold uppercase tracking-wide text-muted">
              Overall Balance
            </h2>
            <span
              class="text-[10px] font-semibold uppercase tracking-wider text-slate-400"
              >Carry-forward</span
            >
          </div>
          <div class="text-3xl font-bold" [ngClass]="amountClass(overall())">
            {{ overall() > 0 ? '+' : '' }}{{ overall() | currency: currency() }}
          </div>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {{
              overall() > 0
                ? 'You are owed by the group.'
                : overall() < 0
                  ? 'You owe the group.'
                  : 'You are all settled up!'
            }}
          </p>

          @if (breakdown(); as b) {
            <button
              type="button"
              class="mt-4 text-xs font-bold text-primary hover:brightness-110 transition flex items-center gap-1"
              [attr.aria-expanded]="breakdownOpen()"
              (click)="breakdownOpen.set(!breakdownOpen())"
            >
              {{ breakdownOpen() ? 'Hide' : 'Show' }} breakdown
              <svg
                class="w-3.5 h-3.5 transition-transform"
                [class.rotate-180]="breakdownOpen()"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </button>

            @if (breakdownOpen()) {
              <dl
                class="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 space-y-2 text-sm animate-fade-in"
              >
                <div class="flex items-center justify-between">
                  <dt class="text-slate-500 dark:text-slate-400">
                    Opening Balance
                  </dt>
                  <dd class="font-semibold tabular-nums">
                    {{ b.openingBalance | currency: currency() }}
                  </dd>
                </div>
                <div class="flex items-center justify-between">
                  <dt class="text-slate-500 dark:text-slate-400">
                    {{ periodTitle() }}
                  </dt>
                  <dd
                    class="font-semibold tabular-nums"
                    [ngClass]="amountClass(b.currentPeriodBalance)"
                  >
                    {{ b.currentPeriodBalance > 0 ? '+' : ''
                    }}{{ b.currentPeriodBalance | currency: currency() }}
                  </dd>
                </div>
                <div
                  class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10"
                >
                  <dt class="font-bold">Closing Balance</dt>
                  <dd
                    class="font-bold tabular-nums"
                    [ngClass]="amountClass(b.closingBalance)"
                  >
                    {{ b.closingBalance > 0 ? '+' : ''
                    }}{{ b.closingBalance | currency: currency() }}
                  </dd>
                </div>
              </dl>
            }
          }
        </div>
      </div>
    </div>

    <!-- Pagination dots -->
    <div class="flex items-center justify-center gap-2 mt-3">
      @for (dot of [0, 1]; track dot) {
        <button
          type="button"
          class="h-2 rounded-full transition-all"
          [class.w-6]="activeIndex() === dot"
          [class.bg-primary]="activeIndex() === dot"
          [class.w-2]="activeIndex() !== dot"
          [class.bg-slate-300]="activeIndex() !== dot"
          [class.dark:bg-white/20]="activeIndex() !== dot"
          [attr.aria-label]="
            dot === 0 ? 'Show ' + periodTitle() : 'Show overall balance'
          "
          [attr.aria-current]="activeIndex() === dot"
          (click)="goTo(dot)"
        ></button>
      }
    </div>
  `,
})
export class BalanceCarouselComponent {
  overall = input.required<number>();
  period = input.required<number>();
  currency = input.required<string>();
  periodTitle = input<string>('This Month');
  periodSubtitle = input<string>('');
  breakdown = input<GroupBalanceBreakdown | null>(null);

  activeIndex = signal(0);
  breakdownOpen = signal(false);

  private track = viewChild.required<ElementRef<HTMLDivElement>>('track');

  amountClass(v: number): Record<string, boolean> {
    return {
      'text-green-500 dark:text-green-400': v > 0,
      'text-red-500 dark:text-red-400': v < 0,
      'text-slate-500': v === 0,
    };
  }

  onScroll(el: HTMLElement): void {
    if (el.clientWidth === 0) return;
    this.activeIndex.set(Math.round(el.scrollLeft / el.clientWidth));
  }

  goTo(index: number): void {
    const el = this.track().nativeElement;
    // Feature-checked: scrollTo is absent in jsdom (tests) and some old browsers.
    el.scrollTo?.({ left: index * el.clientWidth, behavior: 'smooth' });
    this.activeIndex.set(index);
  }
}
