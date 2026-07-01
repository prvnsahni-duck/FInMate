import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dashboard-profile',
  standalone: true,
  templateUrl: './dashboard-profile.component.html',
})
export class DashboardProfileComponent {
  @Input() userName = '';
  @Input() userEmail = '';
  @Input() userProfile: any = null;
  @Input() personalExpensesCount = 0;
  @Input() incomePercentage = 0;
  @Input() isLoggingOut = false;

  @Output() logoutEvent = new EventEmitter<void>();
}
