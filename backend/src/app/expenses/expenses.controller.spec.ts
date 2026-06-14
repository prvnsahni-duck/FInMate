import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let service: jest.Mocked<ExpensesService>;

  beforeEach(async () => {
    const mockExpensesService = {
      createExpense: jest.fn(),
      listExpenses: jest.fn(),
      getExpenseById: jest.fn(),
      updateExpense: jest.fn(),
      deleteExpense: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: mockExpensesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExpensesController>(ExpensesController);
    service = module.get(ExpensesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should parse pagination defaults and pass filters to service', async () => {
    service.listExpenses.mockResolvedValue({} as any);

    await controller.findAll(undefined, undefined, 'cursor-1', 'group-1', 'Food', '2026-06-01', '2026-06-10', {
      user: { id: 'user-1' },
    });

    expect(service.listExpenses).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 20,
      cursor: 'cursor-1',
      groupId: 'group-1',
      category: 'Food',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
  });

  it('should forward create call', async () => {
    const dto: any = { title: 'Dinner' };
    service.createExpense.mockResolvedValue({ id: 'exp-1' });

    const result = await controller.create(dto, { user: { id: 'user-1' } });

    expect(result).toEqual({ id: 'exp-1' });
    expect(service.createExpense).toHaveBeenCalledWith('user-1', dto);
  });

  it('should forward delete call', async () => {
    service.deleteExpense.mockResolvedValue();

    await controller.remove('exp-1', { user: { id: 'user-1' } });

    expect(service.deleteExpense).toHaveBeenCalledWith('user-1', 'exp-1');
  });
});
