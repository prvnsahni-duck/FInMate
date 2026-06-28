import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { EncryptionService } from '../core/services/encryption.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';

describe('ExpensesController', () => {
  let controller: ExpensesController;
  const mockExpenseService = {
    createExpense: jest.fn().mockResolvedValue({ id: 'uuid', title: 'Lunch', amount: 12.5 }),
    updateExpense: jest.fn().mockResolvedValue({}),
    getExpenses: jest.fn().mockResolvedValue([]),
    restoreExpense: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: mockExpenseService },
        { provide: getRepositoryToken(Expense), useValue: {} },
        { provide: EncryptionService, useValue: {} },
      ],
    }).compile();
    controller = module.get<ExpensesController>(ExpensesController);
  });

  it('should create expense and return result', async () => {
    const dto = { title: 'Lunch', amount: 10 } as any;
    const result = await controller.createExpense(dto);
    expect(mockExpenseService.createExpense).toHaveBeenCalledWith(dto);
    expect(result.title).toBe('Lunch');
  });

  // Additional tests for update, pagination, RBAC, error handling can be added.
});
