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

    await controller.findAll(undefined, undefined, 'cursor-1', 'group-1', 'Food', 'posted', '2026-06-01', '2026-06-10', {
      user: { id: 'user-1' },
    });

    expect(service.listExpenses).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 20,
      cursor: 'cursor-1',
      groupId: 'group-1',
      category: 'Food',
      status: 'posted',
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

  it('should forward get by id call', async () => {
    service.getExpenseById.mockResolvedValue({ id: 'exp-1' } as any);

    const result = await controller.findOne('exp-1', { user: { id: 'user-1' } });

    expect(result).toEqual({ id: 'exp-1' });
    expect(service.getExpenseById).toHaveBeenCalledWith('user-1', 'exp-1');
  });

  it('should forward update call', async () => {
    service.updateExpense.mockResolvedValue({ id: 'exp-1', title: 'Updated' } as any);

    const result = await controller.update('exp-1', { title: 'Updated', version: 1 } as any, {
      user: { id: 'user-1' },
    });

    expect(result).toEqual({ id: 'exp-1', title: 'Updated' });
    expect(service.updateExpense).toHaveBeenCalledWith('user-1', 'exp-1', {
      title: 'Updated',
      version: 1,
    });
  });
});
