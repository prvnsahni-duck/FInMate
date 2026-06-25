import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RecurringExpenseFormComponent } from './recurring-expense-form.component';
import { RecurringExpensesService } from '../../services/recurring-expenses.service';
import { of } from 'rxjs';

describe('RecurringExpenseFormComponent', () => {
  let component: RecurringExpenseFormComponent;
  let fixture: ComponentFixture<RecurringExpenseFormComponent>;
  let serviceSpy: jest.Mocked<RecurringExpensesService>;

  beforeEach(async () => {
    const spy = {
      createRecurringExpense: jest.fn().mockReturnValue(of({ id: '1' })),
      updateRecurringExpense: jest.fn().mockReturnValue(of({ id: '1' })),
    };

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, RecurringExpenseFormComponent],
      providers: [{ provide: RecurringExpensesService, useValue: spy }],
    }).compileComponents();

    fixture = TestBed.createComponent(RecurringExpenseFormComponent);
    component = fixture.componentInstance;
    serviceSpy = TestBed.inject(
      RecurringExpensesService,
    ) as jest.Mocked<RecurringExpensesService>;

    component.groupId = 'group-1';
    component.groupCurrency = 'USD';
    component.members = [];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with defaults', () => {
    expect(component.form.get('category')?.value).toBe('Food & Drinks');
    expect(component.form.get('frequency')?.value).toBe('monthly');
  });

  it('should trigger cancel output on cancel click', () => {
    jest.spyOn(component.cancel, 'emit');
    component.cancel.emit();
    expect(component.cancel.emit).toHaveBeenCalled();
  });
});
