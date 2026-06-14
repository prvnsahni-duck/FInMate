import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';
import { UpdateExpenseDto } from './update-expense.dto';

describe('Expenses DTO validation', () => {
  const validCreatePayload = {
    title: 'Dinner',
    description: 'Team dinner',
    amountTotal: 120.5,
    currency: 'USD',
    category: 'Food',
    paidByUserId: '11111111-1111-4111-8111-111111111111',
    expenseDate: '2026-06-10',
    splits: [
      {
        participantUserId: '11111111-1111-4111-8111-111111111111',
        splitType: 'equal',
        shareValue: 1,
      },
      {
        participantUserId: '22222222-2222-4222-8222-222222222222',
        splitType: 'equal',
        shareValue: 1,
      },
    ],
  };

  it('accepts valid create payload', () => {
    const dto = plainToInstance(CreateExpenseDto, validCreatePayload);
    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid amount precision', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      amountTotal: 10.123,
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid currency format', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      currency: 'USDX',
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects empty category', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      category: '   ',
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-ISO date format', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      expenseDate: '10-06-2026',
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid split type', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      splits: [
        {
          participantUserId: '11111111-1111-4111-8111-111111111111',
          splitType: 'invalid',
          shareValue: 1,
        },
      ],
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects split payload with duplicate participants', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      splits: [
        {
          participantUserId: '11111111-1111-4111-8111-111111111111',
          splitType: 'equal',
          shareValue: 1,
        },
        {
          participantUserId: '11111111-1111-4111-8111-111111111111',
          splitType: 'equal',
          shareValue: 1,
        },
      ],
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects fixed split payload when sum differs from amountTotal', () => {
    const dto = plainToInstance(CreateExpenseDto, {
      ...validCreatePayload,
      amountTotal: 100,
      splits: [
        {
          participantUserId: '11111111-1111-4111-8111-111111111111',
          splitType: 'fixed',
          shareValue: 40,
        },
        {
          participantUserId: '22222222-2222-4222-8222-222222222222',
          splitType: 'fixed',
          shareValue: 50,
        },
      ],
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects update payload when split participants include both ids', () => {
    const dto = plainToInstance(UpdateExpenseDto, {
      version: 1,
      splits: [
        {
          participantUserId: '11111111-1111-4111-8111-111111111111',
          participantGroupMemberId: '33333333-3333-4333-8333-333333333333',
          splitType: 'equal',
          shareValue: 1,
        },
      ],
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
