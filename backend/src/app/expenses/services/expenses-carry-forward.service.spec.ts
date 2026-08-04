import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesCarryForwardService } from './expenses-carry-forward.service';
import { ExpensesService } from '../expenses.service';

describe('ExpensesCarryForwardService', () => {
  let service: ExpensesCarryForwardService;
  let mockExpensesService: jest.Mocked<ExpensesService>;

  beforeEach(async () => {
    mockExpensesService = {
      getCarryForwardSummary: jest.fn(),
      closeMonth: jest.fn(),
      listDeletedExpenses: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesCarryForwardService,
        {
          provide: ExpensesService,
          useValue: mockExpensesService,
        },
      ],
    }).compile();

    service = module.get<ExpensesCarryForwardService>(
      ExpensesCarryForwardService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should delegate getCarryForwardSummary to ExpensesService', async () => {
    mockExpensesService.getCarryForwardSummary.mockResolvedValue([
      { userId: '1', netBalance: 10 },
    ] as any);
    const res = await service.getCarryForwardSummary(
      'user-1',
      'group-1',
      '2026-06',
    );
    expect(res).toEqual([{ userId: '1', netBalance: 10 }]);
    expect(mockExpensesService.getCarryForwardSummary).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      '2026-06',
    );
  });

  it('should delegate closeMonth to ExpensesService', async () => {
    mockExpensesService.closeMonth.mockResolvedValue({
      nextLedgerMonth: '2026-07',
      carryForwardExpenseCount: 1,
    });
    const res = await service.closeMonth('user-1', 'group-1', '2026-06');
    expect(res).toEqual({
      nextLedgerMonth: '2026-07',
      carryForwardExpenseCount: 1,
    });
    expect(mockExpensesService.closeMonth).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      '2026-06',
    );
  });

  it('should delegate listDeletedExpenses to ExpensesService', async () => {
    mockExpensesService.listDeletedExpenses.mockResolvedValue({
      data: [],
      meta: {},
    } as any);
    const res = await service.listDeletedExpenses('user-1', 'group-1', 1, 20);
    expect(res).toEqual({ data: [], meta: {} });
    expect(mockExpensesService.listDeletedExpenses).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      1,
      20,
      undefined,
    );
  });
});
