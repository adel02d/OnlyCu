import { describe, expect, it } from 'vitest';

import { calculateUsdtFee, decimalText, parsePositiveAmount } from '../src/lib/money';

describe('USDT platform billing', () => {
  it('calculates an exact 10 percent fee after rate conversion', () => {
    const result = calculateUsdtFee({
      sourceAmount: '1000',
      usdtPerUnit: '0.003',
      commissionBps: 1000,
    });

    expect(decimalText(result.grossUsdt)).toBe('3');
    expect(decimalText(result.feeUsdt)).toBe('0.3');
  });

  it('rejects malformed or non-positive money amounts', () => {
    expect(() => parsePositiveAmount('0')).toThrow();
    expect(() => parsePositiveAmount('-4')).toThrow();
    expect(() => parsePositiveAmount('1,2')).toThrow();
  });
});
