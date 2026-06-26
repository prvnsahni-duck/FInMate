import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CurrencyPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { ExpensesService } from '../../services/expenses.service';
import { CATEGORY_OPTIONS } from '../../../../core/constants/app.constants';

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
  imports: [CurrencyPipe, NgFor, NgIf, PercentPipe],
  templateUrl: './analytics-charts.component.html',
  styles: [
    `
      :host {
        --donut-track-color: rgba(148, 163, 184, 0.1);
      }
      .dark :host {
        --donut-track-color: rgba(255, 255, 255, 0.05);
      }
    `,
  ],
})
export class AnalyticsChartsComponent implements OnInit, OnChanges {
  private expensesService = inject(ExpensesService);

  @Input() groupId: string | null = null;
  @Input() currency = 'USD';

  isLoading = true;
  processedCategories: ProcessedCategory[] = [];
  processedMonths: ProcessedMonth[] = [];

  grandTotal = 0;
  hoveredCategory: ProcessedCategory | null = null;
  hoveredMonth: ProcessedMonth | null = null;
  categoryOptions = CATEGORY_OPTIONS;

  ngOnInit() {
    this.loadAnalytics();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      (changes['groupId'] && !changes['groupId'].firstChange) ||
      (changes['currency'] && !changes['currency'].firstChange)
    ) {
      this.loadAnalytics();
    }
  }

  private loadAnalytics() {
    this.isLoading = true;
    const gId = this.groupId ? this.groupId : 'personal';

    // Load category distribution and monthly trends
    this.expensesService.getCategoryAnalytics(gId).subscribe({
      next: (categories) => {
        this.processCategoriesData(categories);

        this.expensesService.getMonthlyAnalytics(gId).subscribe({
          next: (monthly) => {
            this.processMonthlyData(monthly);
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          },
        });
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  private processCategoriesData(data: CategoryData[]) {
    const matching = data.filter(
      (d) => d.currency.toUpperCase() === this.currency.toUpperCase(),
    );
    this.grandTotal = matching.reduce((sum, d) => sum + Number(d.total), 0);
    const C = 2 * Math.PI * 70; // 439.82
    let cumulativePercent = 0;

    const categoryColorMap = new Map(
      this.categoryOptions.map((option) => [option.value, option.color]),
    );

    const defaultColor = categoryColorMap.get('Others') ?? '#9CA3AF';

    this.processedCategories = matching.map((item) => {
      const total = Number(item.total) || 0;

      const percentage = this.grandTotal > 0 ? total / this.grandTotal : 0;

      const dashArray = `${C * percentage} ${C}`;
      const dashOffset = -(C * cumulativePercent);

      cumulativePercent += percentage;

      return {
        category: item.category,
        total,
        percentage,
        color: categoryColorMap.get(item.category) ?? defaultColor,
        dashArray,
        dashOffset,
      };
    });
  }

  private processMonthlyData(data: MonthlyData[]) {
    const matching = data
      .filter((d) => d.currency.toUpperCase() === this.currency.toUpperCase())
      .sort((a, b) => a.month.localeCompare(b.month));

    const last6 = matching.slice(-6);
    const maxVal = Math.max(...last6.map((d) => Number(d.total)), 100);
    const svgHeight = 160;
    const spacing = 340 / Math.max(last6.length, 1);

    this.processedMonths = last6.map((item, index) => {
      const total = Number(item.total);
      const height = (total / maxVal) * svgHeight;
      const x = 50 + index * spacing;
      const y = 180 - height;

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
