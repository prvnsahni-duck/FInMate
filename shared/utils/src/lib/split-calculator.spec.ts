import { SplitCalculator, SplitInput } from './split-calculator';

describe('SplitCalculator', () => {
  it('should calculate equal splits correctly', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'equal' },
      { id: '2', type: 'equal' },
      { id: '3', type: 'equal' },
    ];
    // 10 / 3 = 3.33 with 0.01 remainder
    const result = SplitCalculator.calculate(10, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 3.34 }, // First person gets the remainder
      { id: '2', amount: 3.33 },
      { id: '3', amount: 3.33 },
    ]);
  });

  it('should calculate fixed splits exactly', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'fixed', value: 4.50 },
      { id: '2', type: 'fixed', value: 5.50 },
    ];
    const result = SplitCalculator.calculate(10, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 4.50 },
      { id: '2', amount: 5.50 },
    ]);
  });

  it('should throw an error if fixed splits do not match total amount', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'fixed', value: 4.50 },
      { id: '2', type: 'fixed', value: 5.00 },
    ];
    
    expect(() => SplitCalculator.calculate(10, splits)).toThrow(
      'Total amount does not match the sum of fixed amounts'
    );
  });

  it('should throw an error if fixed splits exceed total amount', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'fixed', value: 6.00 },
      { id: '2', type: 'fixed', value: 5.00 },
    ];
    
    expect(() => SplitCalculator.calculate(10, splits)).toThrow(
      'Fixed amounts exceed total amount'
    );
  });

  it('should handle percentage splits correctly', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'percent', value: 33.33 },
      { id: '2', type: 'percent', value: 33.33 },
      { id: '3', type: 'percent', value: 33.34 },
    ];
    
    const result = SplitCalculator.calculate(100, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 33.33 },
      { id: '2', amount: 33.33 },
      { id: '3', amount: 33.34 },
    ]);
  });

  it('should handle mixed splits (fixed + equal)', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'fixed', value: 5 },
      { id: '2', type: 'equal' },
      { id: '3', type: 'equal' },
    ];
    
    // Remaining is 5. 5 / 2 = 2.50
    const result = SplitCalculator.calculate(10, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 5.00 },
      { id: '2', amount: 2.50 },
      { id: '3', amount: 2.50 },
    ]);
  });

  it('should handle share splits correctly with remainder', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'share', value: 1 },
      { id: '2', type: 'share', value: 2 },
    ];
    
    // Total 3 shares. 10 / 3 = 3.33. Person 1 gets 1 share (3.33), Person 2 gets 2 shares (6.66).
    // Total allocated = 9.99. Remainder 0.01 goes to first eligible person.
    const result = SplitCalculator.calculate(10, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 3.34 },
      { id: '2', amount: 6.66 },
    ]);
  });

  it('should handle mixed percentage and shares', () => {
    const splits: SplitInput[] = [
      { id: '1', type: 'percent', value: 50 },
      { id: '2', type: 'share', value: 1 },
    ];
    // Person 1 gets 50% of 10 = 5.00
    // Remaining 5.00 goes to shares. Person 2 has 1 share out of 1. So they get 5.00.
    const result = SplitCalculator.calculate(10, splits);
    
    expect(result).toEqual([
      { id: '1', amount: 5.00 },
      { id: '2', amount: 5.00 },
    ]);
  });
});
