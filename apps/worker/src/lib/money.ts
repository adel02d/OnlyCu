import Decimal from 'decimal.js';

import type { Currency } from './base';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export function parsePositiveAmount(value: unknown, label = 'Amount'): Decimal {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.lte(0) || amount.gt('1000000000000')) {
    throw new Error(`${label} is out of range`);
  }
  return amount;
}

export function decimalText(value: Decimal.Value): string {
  return new Decimal(value).toFixed().replace(/\.0+$/, '');
}

export function calculateUsdtFee(input: {
  sourceAmount: Decimal.Value;
  usdtPerUnit: Decimal.Value;
  commissionBps: number;
}) {
  const grossUsdt = new Decimal(input.sourceAmount).mul(input.usdtPerUnit);
  const feeUsdt = grossUsdt.mul(input.commissionBps).div(10_000).toDecimalPlaces(8);
  return { grossUsdt, feeUsdt };
}

export const decimalsForCurrency: Record<Currency, number> = {
  CUP: 2,
  USD: 2,
  USDT: 6,
  TON: 9,
};
