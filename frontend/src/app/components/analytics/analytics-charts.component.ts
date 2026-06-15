import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface MonthlyData {
  month: string;
  total: number;
  currency: string;
}

interface CategoryData {
  category: string;
  total: number;
  currency: string;
}

interface ProcessedCategory {
  category: string;
  total: number;
  percentage: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

interface ProcessedMonth {
  month: string;
  displayName: string;
  total: number;
  height: number;
  x: number;
  y: number;
}

@Component({
  selector: 'app-analytics-charts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
      
      <!-- Category Breakdown (Donut Chart) -->
      <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5 flex flex-col items-center">
        <h3 class="text-lg font-bold mb-6 self-start">Category Spending</h3>
        
        <div *ngIf="isLoading" class="flex flex-col items-center justify-center h-64 w-full animate-pulse">
          <div class="w-36 h-36 rounded-full border-8 border-slate-200 dark:border-white/5 border-t-transparent animate-spin mb-4"></div>
          <p class="text-sm text-slate-400">Loading category breakdown...</p>
        </div>

        <div *ngIf="!isLoading && processedCategories.length === 0" class="flex flex-col items-center justify-center h-64 w-full text-slate-500">
          <svg class="w-12 h-12 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.003 9.003 0 1020.95 13H11V3.055z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path>
          </svg>
          <p class="font-medium text-sm">No expenses recorded for breakdown.</p>
        </div>

        <div *ngIf="!isLoading && processedCategories.length > 0" class="w-full flex flex-col sm:flex-row items-center justify-around gap-6">
          <!-- Donut SVG -->
          <div class="relative w-48 h-48 select-none">
            <svg class="w-full h-full" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="70" fill="transparent" stroke="var(--donut-track-color, rgba(148, 163, 184, 0.1))" stroke-width="18" />
              <g transform="rotate(-90 100 100)">
                <circle 
                  *ngFor="let cat of processedCategories"
                  cx="100" 
                  cy="100" 
                  r="70" 
                  fill="transparent" 
                  [attr.stroke]="cat.color" 
                  stroke-width="18" 
                  [attr.stroke-dasharray]="cat.dashArray" 
                  [attr.stroke-dashoffset]="cat.dashOffset"
                  stroke-linecap="round"
                  class="transition-all duration-500 cursor-pointer hover:stroke-[22px]"
                  (mouseenter)="hoveredCategory = cat"
                  (mouseleave)="hoveredCategory = null"
                />
              </g>
            </svg>
            <!-- Centered Text -->
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {{ hoveredCategory ? hoveredCategory.category : 'Total Spend' }}
              </span>
              <span class="text-xl font-extrabold text-slate-800 dark:text-white mt-0.5">
                {{ (hoveredCategory ? hoveredCategory.total : grandTotal) | currency:currency }}
              </span>
              <span *ngIf="hoveredCategory" class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {{ hoveredCategory.percentage | percent:'1.0-1' }}
              </span>
            </div>
          </div>

          <!-- Legends -->
          <div class="flex flex-col space-y-3 shrink-0">
            <div *ngFor="let cat of processedCategories" class="flex items-center space-x-3 text-sm cursor-pointer" (mouseenter)="hoveredCategory = cat" (mouseleave)="hoveredCategory = null">
              <span class="w-3.5 h-3.5 rounded-md" [style.background-color]="cat.color"></span>
              <span class="font-semibold text-slate-700 dark:text-slate-200">{{ cat.category }}</span>
              <span class="text-xs text-slate-400 dark:text-slate-500 font-bold">{{ cat.percentage | percent:'1.0-0' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Spending Trends (Bar Chart) -->
      <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5 flex flex-col">
        <h3 class="text-lg font-bold mb-6">Monthly Trends</h3>

        <div *ngIf="isLoading" class="flex flex-col items-center justify-center h-64 w-full animate-pulse">
          <div class="w-full flex items-end justify-around h-40 px-6 mb-4">
            <div class="w-8 bg-slate-200 dark:bg-white/5 rounded-t-xl h-1/3"></div>
            <div class="w-8 bg-slate-200 dark:bg-white/5 rounded-t-xl h-2/3"></div>
            <div class="w-8 bg-slate-200 dark:bg-white/5 rounded-t-xl h-1/2"></div>
            <div class="w-8 bg-slate-200 dark:bg-white/5 rounded-t-xl h-5/6"></div>
          </div>
          <p class="text-sm text-slate-400">Loading spending trends...</p>
        </div>

        <div *ngIf="!isLoading && processedMonths.length === 0" class="flex flex-col items-center justify-center h-64 w-full text-slate-500">
          <svg class="w-12 h-12 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"></path>
          </svg>
          <p class="font-medium text-sm">No monthly trend data available.</p>
        </div>

        <!-- SVG Bar Chart -->
        <div *ngIf="!isLoading && processedMonths.length > 0" class="relative w-full h-64">
          <svg class="w-full h-full" viewBox="0 0 400 220" preserveAspectRatio="none">
            <!-- Gridlines -->
            <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(148, 163, 184, 0.1)" stroke-dasharray="4,4" />
            <line x1="40" y1="100" x2="380" y2="100" stroke="rgba(148, 163, 184, 0.1)" stroke-dasharray="4,4" />
            <line x1="40" y1="180" x2="380" y2="180" stroke="rgba(148, 163, 184, 0.2)" />

            <!-- Bars -->
            <g>
              <rect 
                *ngFor="let m of processedMonths"
                [attr.x]="m.x" 
                [attr.y]="m.y" 
                width="32" 
                [attr.height]="m.height" 
                rx="6" 
                class="transition-all duration-300 hover:opacity-80 fill-gradient cursor-pointer"
                [style.fill]="'url(#bar-gradient)'"
                (mouseenter)="hoveredMonth = m"
                (mouseleave)="hoveredMonth = null"
              />
            </g>

            <!-- Month Labels -->
            <text 
              *ngFor="let m of processedMonths"
              [attr.x]="m.x + 16" 
              y="202" 
              text-anchor="middle" 
              class="text-[10px] font-semibold fill-slate-400 dark:fill-slate-500 font-sans"
            >
              {{ m.displayName }}
            </text>

            <!-- Gradients Definition -->
            <defs>
              <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="100%" stop-color="#4facfe" />
              </linearGradient>
            </defs>
          </svg>

          <!-- Hover Tooltip -->
          <div 
            *ngIf="hoveredMonth" 
            class="absolute bg-slate-900/95 dark:bg-black/95 text-white border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xl pointer-events-none"
            [style.left.px]="hoveredMonth.x * 0.95"
            [style.top.px]="hoveredMonth.y * 0.8"
          >
            {{ hoveredMonth.total | currency:currency }}
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host {
      --donut-track-color: rgba(148, 163, 184, 0.1);
    }
    .dark :host {
      --donut-track-color: rgba(255, 255, 255, 0.05);
    }
  `]
})
export class AnalyticsChartsComponent implements OnInit, OnChanges {
  private http = inject(HttpClient);

  @Input() groupId: string | null = null;
  @Input() currency = 'USD';

  isLoading = true;
  processedCategories: ProcessedCategory[] = [];
  processedMonths: ProcessedMonth[] = [];
  
  grandTotal = 0;
  hoveredCategory: ProcessedCategory | null = null;
  hoveredMonth: ProcessedMonth | null = null;

  // Category Color Map
  private categoryColors: Record<string, string> = {
    'Food & Drinks': '#00f2fe',  // Bright Cyan
    'Travel': '#a18cd1',         // Soft Purple
    'Utilities': '#f6d365',      // Warm Yellow
    'Entertainment': '#ff0844',  // Neon Pink
    'Others': '#10b981',         // Mint Green
  };

  ngOnInit() {
    this.loadAnalytics();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['groupId'] && !changes['groupId'].firstChange) ||
        (changes['currency'] && !changes['currency'].firstChange)) {
      this.loadAnalytics();
    }
  }

  private loadAnalytics() {
    this.isLoading = true;
    const gId = this.groupId ? this.groupId : 'personal';
    const categoriesUrl = gId === 'personal' 
      ? '/api/expenses/analytics/categories' 
      : `/api/expenses/analytics/categories?groupId=${gId}`;
    const monthlyUrl = gId === 'personal' 
      ? '/api/expenses/analytics/monthly' 
      : `/api/expenses/analytics/monthly?groupId=${gId}`;

    // Load category distribution and monthly trends
    this.http.get<CategoryData[]>(categoriesUrl).subscribe({
      next: (categories) => {
        this.processCategoriesData(categories);
        
        this.http.get<MonthlyData[]>(monthlyUrl).subscribe({
          next: (monthly) => {
            this.processMonthlyData(monthly);
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          }
        });
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  private processCategoriesData(data: CategoryData[]) {
    // Filter matching currency
    const matching = data.filter(d => d.currency.toUpperCase() === this.currency.toUpperCase());
    
    this.grandTotal = matching.reduce((sum, d) => sum + Number(d.total), 0);
    
    const C = 2 * Math.PI * 70; // 439.82
    let cumulativePercent = 0;

    this.processedCategories = matching.map(item => {
      const total = Number(item.total);
      const percentage = this.grandTotal > 0 ? total / this.grandTotal : 0;
      
      const dashArray = `${C * percentage} ${C}`;
      const dashOffset = -C * cumulativePercent;
      
      cumulativePercent += percentage;

      return {
        category: item.category,
        total,
        percentage,
        color: this.categoryColors[item.category] || this.categoryColors['Others'],
        dashArray,
        dashOffset,
      };
    });
  }

  private processMonthlyData(data: MonthlyData[]) {
    // Filter matching currency and sort chronologically
    const matching = data
      .filter(d => d.currency.toUpperCase() === this.currency.toUpperCase())
      .sort((a, b) => a.month.localeCompare(b.month));

    // Keep only last 6 months for chart layout
    const last6 = matching.slice(-6);
    
    const maxVal = Math.max(...last6.map(d => Number(d.total)), 100);

    const svgHeight = 160; // 180 (track y-baseline) - 20 (y-offset top)
    const spacing = 340 / Math.max(last6.length, 1); // 400 (width) - 60 (x-padding)

    this.processedMonths = last6.map((item, index) => {
      const total = Number(item.total);
      const height = (total / maxVal) * svgHeight;
      const x = 50 + index * spacing;
      const y = 180 - height; // baseline y=180

      // Format YYYY-MM display to Month Name (e.g. "Jun")
      let displayName = item.month;
      try {
        const parts = item.month.split('-');
        if (parts.length === 2) {
          const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
          displayName = date.toLocaleDateString('en-US', { month: 'short' });
        }
      } catch {
        // fallback
      }

      return {
        month: item.month,
        displayName,
        total,
        height,
        x,
        y,
      };
    });
  }
}
