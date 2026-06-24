import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DropdownComponent, DropdownOption } from '../../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'app-dashboard-settings',
  standalone: true,
  imports: [FormsModule, DropdownComponent],
  templateUrl: './dashboard-settings.component.html'
})
export class DashboardSettingsComponent {
  @Input() newCurrency = 'USD';
  @Output() newCurrencyChange = new EventEmitter<string>();

  @Input() newIncome = 0;
  @Output() newIncomeChange = new EventEmitter<number>();

  @Input() newBudget = 0;
  @Output() newBudgetChange = new EventEmitter<number>();

  @Input() currencyOptions: DropdownOption[] = [];
  @Input() aiOptIn = false;

  @Output() toggleAiOptInEvent = new EventEmitter<any>();
  @Output() saveIncomeEvent = new EventEmitter<void>();
}
