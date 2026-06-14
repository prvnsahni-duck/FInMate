import { BadRequestException } from '@nestjs/common';
import { calculateDeterministicSplits } from './split-calculator.util';

describe('split-calculator.util', () => {
  it('should split equal amounts and allocate remainder to payer first', () => {
    const result = calculateDeterministicSplits(
      10.0,
      [
        { participantUserId: 'aaaa', splitType: 'equal', shareValue: 1 },
        { participantUserId: 'bbbb', splitType: 'equal', shareValue: 1 },
        { participantUserId: 'cccc', splitType: 'equal', shareValue: 1 },
      ],
      'aaaa',
    );

    expect(result).toHaveLength(3);
    expect(result.find((s) => s.participantUserId === 'aaaa')?.amountOwed).toBe(3.34);
    expect(result.find((s) => s.participantUserId === 'bbbb')?.amountOwed).toBe(3.33);
    expect(result.find((s) => s.participantUserId === 'cccc')?.amountOwed).toBe(3.33);
  });

  it('should use lexical order fallback when payer is not present', () => {
    const result = calculateDeterministicSplits(
      10.01,
      [
        { participantUserId: 'bbbb', splitType: 'share', shareValue: 1 },
        { participantUserId: 'cccc', splitType: 'share', shareValue: 1 },
      ],
      'zzzz',
    );

    expect(result.find((s) => s.participantUserId === 'bbbb')?.amountOwed).toBe(5.01);
    expect(result.find((s) => s.participantUserId === 'cccc')?.amountOwed).toBe(5.0);
  });

  it('should reject fixed split when total does not match amount', () => {
    expect(() =>
      calculateDeterministicSplits(10, [
        { participantUserId: 'aaaa', splitType: 'fixed', shareValue: 3 },
        { participantUserId: 'bbbb', splitType: 'fixed', shareValue: 3 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('should reject percent split when sum is not 100', () => {
    expect(() =>
      calculateDeterministicSplits(100, [
        { participantUserId: 'aaaa', splitType: 'percent', shareValue: 40 },
        { participantUserId: 'bbbb', splitType: 'percent', shareValue: 50 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('should reject split entries without exactly one participant id', () => {
    expect(() =>
      calculateDeterministicSplits(100, [
        {
          participantUserId: 'aaaa',
          participantGroupMemberId: 'member-1',
          splitType: 'equal',
          shareValue: 1,
        },
      ]),
    ).toThrow(BadRequestException);
  });
});
