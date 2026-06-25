import { TestBed } from '@angular/core/testing';
import { NgxsModule, Store } from '@ngxs/store';
import {
  RecurringExpensesState,
  LoadRecurringExpenses,
  CreateRecurringExpense,
  UpdateRecurringExpense,
  DeleteRecurringExpense,
} from './recurring-expenses.state';
import { RecurringExpensesService } from '../../features/groups/services/recurring-expenses.service';
import { of } from 'rxjs';

describe('RecurringExpensesState', () => {
  let store: Store;
  let serviceSpy: jest.Mocked<RecurringExpensesService>;

  beforeEach(() => {
    const spy = {
      getRecurringExpenses: jest
        .fn()
        .mockReturnValue(of([{ id: '1', title: 'Schedule' }])),
      createRecurringExpense: jest
        .fn()
        .mockReturnValue(of({ id: '2', title: 'New Schedule' })),
      updateRecurringExpense: jest
        .fn()
        .mockReturnValue(of({ id: '1', title: 'Updated Schedule' })),
      deleteRecurringExpense: jest.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([RecurringExpensesState])],
      providers: [{ provide: RecurringExpensesService, useValue: spy }],
    });

    store = TestBed.inject(Store);
    serviceSpy = TestBed.inject(
      RecurringExpensesService,
    ) as jest.Mocked<RecurringExpensesService>;
  });

  it('should load recurring expenses', () => {
    store.dispatch(new LoadRecurringExpenses('group-1'));
    const templates = store.selectSnapshot(RecurringExpensesState.getTemplates);
    expect(templates).toHaveLength(1);
    expect(templates[0].title).toBe('Schedule');
  });

  it('should create recurring expense', () => {
    store.dispatch(new CreateRecurringExpense({ title: 'New Schedule' }));
    const templates = store.selectSnapshot(RecurringExpensesState.getTemplates);
    expect(templates).toContainEqual({ id: '2', title: 'New Schedule' });
  });

  it('should update recurring expense', () => {
    // pre-load state
    store.dispatch(new LoadRecurringExpenses('group-1'));
    store.dispatch(
      new UpdateRecurringExpense('1', { title: 'Updated Schedule' }),
    );
    const templates = store.selectSnapshot(RecurringExpensesState.getTemplates);
    expect(templates[0].title).toBe('Updated Schedule');
  });

  it('should delete recurring expense', () => {
    store.dispatch(new LoadRecurringExpenses('group-1'));
    store.dispatch(new DeleteRecurringExpense('1'));
    const templates = store.selectSnapshot(RecurringExpensesState.getTemplates);
    expect(templates).toHaveLength(0);
  });
});
