import { Test, TestingModule } from '@nestjs/testing';
import { RecurringExpensesController } from './recurring-expenses.controller';
import { RecurringExpensesService } from './services/recurring-expenses.service';
import { RecurringExpensesScheduler } from './services/recurring-expenses.scheduler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

describe('RecurringExpensesController', () => {
  let controller: RecurringExpensesController;
  let service: jest.Mocked<RecurringExpensesService>;
  let mockRecurringExpensesService: Record<string, jest.Mock>;
  let module: TestingModule;

  beforeEach(async () => {
    mockRecurringExpensesService = {
      createRecurringExpense: jest.fn(),
      listRecurringExpenses: jest.fn(),
      getRecurringExpenseById: jest.fn(),
      updateRecurringExpense: jest.fn(),
      deleteRecurringExpense: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [RecurringExpensesController],
      providers: [
        {
          provide: RecurringExpensesService,
          useValue: mockRecurringExpensesService,
        },
        {
          provide: RecurringExpensesScheduler,
          useValue: {
            processDueExpenses: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RecurringExpensesController>(
      RecurringExpensesController,
    );
    service = module.get(
      RecurringExpensesService,
    ) as jest.Mocked<RecurringExpensesService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward create call', async () => {
    const dto: any = { title: 'Rent' };
    service.createRecurringExpense.mockResolvedValue({ id: 'rec-1' } as any);

    const result = await controller.create(dto, {
      user: { id: 'user-1' },
    } as any);

    expect(result).toEqual(
      new SuccessResponse('Recurring expense created successfully', {
        id: 'rec-1',
      }),
    );
    expect(service.createRecurringExpense).toHaveBeenCalledWith('user-1', dto);
  });

  it('should forward list call', async () => {
    service.listRecurringExpenses.mockResolvedValue([{ id: 'rec-1' }] as any);

    const result = await controller.findAll('group-1', {
      user: { id: 'user-1' },
    } as any);

    expect(result).toEqual(
      new SuccessResponse('Recurring expenses retrieved successfully', [
        { id: 'rec-1' },
      ]),
    );
    expect(service.listRecurringExpenses).toHaveBeenCalledWith(
      'user-1',
      'group-1',
    );
  });

  it('should forward get by id call', async () => {
    service.getRecurringExpenseById.mockResolvedValue({ id: 'rec-1' } as any);

    const result = await controller.findOne('rec-1', {
      user: { id: 'user-1' },
    } as any);

    expect(result).toEqual(
      new SuccessResponse('Recurring expense retrieved successfully', {
        id: 'rec-1',
      }),
    );
    expect(service.getRecurringExpenseById).toHaveBeenCalledWith(
      'user-1',
      'rec-1',
    );
  });

  it('should forward update call', async () => {
    const dto: any = { title: 'Rent Update', version: 1 };
    service.updateRecurringExpense.mockResolvedValue({
      id: 'rec-1',
      title: 'Rent Update',
    } as any);

    const result = await controller.update('rec-1', dto, {
      user: { id: 'user-1' },
    } as any);

    expect(result).toEqual(
      new SuccessResponse('Recurring expense updated successfully', {
        id: 'rec-1',
        title: 'Rent Update',
      }),
    );
    expect(service.updateRecurringExpense).toHaveBeenCalledWith(
      'user-1',
      'rec-1',
      dto,
    );
  });

  it('should forward delete call', async () => {
    service.deleteRecurringExpense.mockResolvedValue();

    const result = await controller.remove('rec-1', {
      user: { id: 'user-1' },
    } as any);

    expect(result).toEqual(
      new SuccessResponse('Recurring expense deleted successfully', {}),
    );
    expect(service.deleteRecurringExpense).toHaveBeenCalledWith(
      'user-1',
      'rec-1',
    );
  });

  it('should trigger scheduler manually', async () => {
    const mockScheduler = module.get(RecurringExpensesScheduler);
    const result = await controller.triggerScheduler();
    expect(result).toEqual(
      new SuccessResponse('Scheduler triggered successfully', {}),
    );
    expect(mockScheduler.processDueExpenses).toHaveBeenCalled();
  });
});
