import { Injectable, inject } from '@angular/core';
import { State, Action, StateContext, Selector } from '@ngxs/store';
import { RecurringExpensesService } from '../../features/groups/services/recurring-expenses.service';
import { tap } from 'rxjs/operators';

export class LoadRecurringExpenses {
  static readonly type = '[RecurringExpenses] Load';
  constructor(public groupId?: string) {}
}

export class CreateRecurringExpense {
  static readonly type = '[RecurringExpenses] Create';
  constructor(public payload: any) {}
}

export class UpdateRecurringExpense {
  static readonly type = '[RecurringExpenses] Update';
  constructor(public id: string, public payload: any) {}
}

export class DeleteRecurringExpense {
  static readonly type = '[RecurringExpenses] Delete';
  constructor(public id: string) {}
}

export interface RecurringExpensesStateModel {
  templates: any[];
  loading: boolean;
}

@State<RecurringExpensesStateModel>({
  name: 'recurringExpenses',
  defaults: {
    templates: [],
    loading: false
  }
})
@Injectable()
export class RecurringExpensesState {
  private service = inject(RecurringExpensesService);

  @Selector()
  static getTemplates(state: RecurringExpensesStateModel) {
    return state.templates;
  }

  @Selector()
  static isLoading(state: RecurringExpensesStateModel) {
    return state.loading;
  }

  @Action(LoadRecurringExpenses)
  load(ctx: StateContext<RecurringExpensesStateModel>, action: LoadRecurringExpenses) {
    ctx.patchState({ loading: true });
    return this.service.getRecurringExpenses(action.groupId).pipe(
      tap((templates) => {
        ctx.patchState({ templates, loading: false });
      })
    );
  }

  @Action(CreateRecurringExpense)
  create(ctx: StateContext<RecurringExpensesStateModel>, action: CreateRecurringExpense) {
    return this.service.createRecurringExpense(action.payload).pipe(
      tap((newTemplate) => {
        const state = ctx.getState();
        ctx.patchState({
          templates: [...state.templates, newTemplate]
        });
      })
    );
  }

  @Action(UpdateRecurringExpense)
  update(ctx: StateContext<RecurringExpensesStateModel>, action: UpdateRecurringExpense) {
    return this.service.updateRecurringExpense(action.id, action.payload).pipe(
      tap((updatedTemplate) => {
        const state = ctx.getState();
        const updatedTemplates = state.templates.map((t) =>
          t.id === action.id ? updatedTemplate : t
        );
        ctx.patchState({ templates: updatedTemplates });
      })
    );
  }

  @Action(DeleteRecurringExpense)
  delete(ctx: StateContext<RecurringExpensesStateModel>, action: DeleteRecurringExpense) {
    return this.service.deleteRecurringExpense(action.id).pipe(
      tap(() => {
        const state = ctx.getState();
        const filtered = state.templates.filter((t) => t.id !== action.id);
        ctx.patchState({ templates: filtered });
      })
    );
  }
}
