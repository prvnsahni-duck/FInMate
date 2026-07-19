import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { EncryptionService } from '../core/services/encryption.service';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let repo: Repository<Expense>;
  let encryption: EncryptionService;

  const mockExpense = {
    id: 'exp-uuid',
    title: 'Dinner',
    amount: 45.5,
    notes: 'Team dinner',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockRepo = {
    save: jest
      .fn()
      .mockImplementation((e) => Promise.resolve({ ...e, id: 'exp-uuid' })),
    find: jest.fn().mockResolvedValue([mockExpense]),
    findOne: jest
      .fn()
      .mockImplementation((id) =>
        Promise.resolve(id ? { ...mockExpense, id } : null),
      ),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    restore: jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;

  const mockEncryption = {
    encrypt: jest.fn().mockImplementation((v) => `enc(${v})`),
    decrypt: jest
      .fn()
      .mockImplementation((v) => v.replace(/^enc\((.*)\)$/, '$1')),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepo },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();
    service = module.get<ExpensesService>(ExpensesService);
  });

  it('should create expense with encrypted fields', async () => {
    const dto = { title: 'Lunch', amount: 12.5, notes: 'Team lunch' } as any;
    const result = await service.createExpense(dto);
    expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(dto.title);
    expect(result.title).toBe('Lunch');
    expect(result.amount).toBe(12.5);
  });

  // Additional CRUD tests (update, get, restore) would follow similarly
});
