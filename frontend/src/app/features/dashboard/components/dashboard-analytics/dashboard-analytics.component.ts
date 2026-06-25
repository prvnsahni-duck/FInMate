import { Component, Input } from '@angular/core';
import { AnalyticsChartsComponent } from '../../../groups/components/analytics-charts/analytics-charts.component';

@Component({
  selector: 'app-dashboard-analytics',
  standalone: true,
  imports: [AnalyticsChartsComponent],
  templateUrl: './dashboard-analytics.component.html',
})
export class DashboardAnalyticsComponent {
  @Input() userProfile: any = null;
}
