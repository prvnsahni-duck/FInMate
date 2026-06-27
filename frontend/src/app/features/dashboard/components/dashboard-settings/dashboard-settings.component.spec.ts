import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardSettingsComponent } from './dashboard-settings.component';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('DashboardSettingsComponent', () => {
  let component: DashboardSettingsComponent;
  let fixture: ComponentFixture<DashboardSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardSettingsComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardSettingsComponent);
    component = fixture.componentInstance;
    component.newCurrency = 'USD';
    component.newIncome = 5000;
    component.newBudget = 2000;
    component.currencyOptions = [
      { value: 'USD', label: 'USD ($)' },
      { value: 'EUR', label: 'EUR (€)' },
    ];
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display setting inputs correctly', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const inputs = compiled.querySelectorAll('input[type="number"]');

    // Monthly Income input
    expect((inputs[0] as HTMLInputElement).value).toBe('5000');
    // Monthly Budget input
    expect((inputs[1] as HTMLInputElement).value).toBe('2000');
  });

  it('should emit saveIncomeEvent when save button is clicked', () => {
    fixture.detectChanges();
    const emitSpy = jest.spyOn(component.saveIncomeEvent, 'emit');

    const saveBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find(btn => (btn as HTMLButtonElement).textContent?.includes('Save Configuration')) as HTMLButtonElement;
    saveBtn.click();

    expect(emitSpy).toHaveBeenCalled();
  });
});
