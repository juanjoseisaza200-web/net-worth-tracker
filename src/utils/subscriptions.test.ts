import { describe, it, expect } from 'vitest';
import { AppData, Subscription } from '../types';
import {
  billingDate,
  initialChargedPeriod,
  nextChargeDate,
  periodForDate,
  processSubscriptions,
  claimSubscriptionCharge,
  monthlyCost,
} from './subscriptions';

const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'netflix',
  name: 'Netflix',
  amount: 40000,
  currency: 'COP',
  accountId: 'card',
  category: 'Entertainment',
  frequency: 'monthly',
  billingDay: 15,
  isActive: true,
  lastChargedPeriod: '2026-08',
  ...over,
});

const data = (subs: Subscription[], over: Partial<AppData> = {}): AppData => ({
  accounts: [
    { id: 'card', name: 'Black', balance: -100000, currency: 'COP', type: 'credit' },
    { id: 'usd', name: 'USD', balance: 1000, currency: 'USD', type: 'checking' },
  ],
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  subscriptions: subs,
  stocks: [],
  crypto: [],
  fixedIncome: [],
  variableInvestments: [],
  baseCurrency: 'COP',
  ...over,
});

describe('billing dates', () => {
  it('clamps the day to short months', () => {
    expect(billingDate(sub({ billingDay: 31 }), '2026-02')).toBe('2026-02-28');
    expect(billingDate(sub({ billingDay: 31 }), '2026-03')).toBe('2026-03-31');
  });

  it('uses the billing month for yearly subscriptions', () => {
    expect(billingDate(sub({ frequency: 'yearly', billingMonth: 3, billingDay: 10 }), '2027')).toBe('2027-03-10');
  });

  it('next charge is the period after the last one charged', () => {
    expect(nextChargeDate(sub())).toBe('2026-09-15');
    expect(nextChargeDate(sub({ frequency: 'yearly', billingMonth: 1, billingDay: 5, lastChargedPeriod: '2026' }))).toBe('2027-01-05');
  });

  it('a new subscription counts this period as paid only once its day has passed', () => {
    expect(initialChargedPeriod(sub({ billingDay: 15 }), day('2026-10-20'))).toBe('2026-10');
    expect(initialChargedPeriod(sub({ billingDay: 15 }), day('2026-10-04'))).toBe('2026-09');
    expect(initialChargedPeriod(sub({ billingDay: 15 }), day('2026-01-04'))).toBe('2025-12');
    const yearly = sub({ frequency: 'yearly', billingMonth: 6, billingDay: 1 });
    expect(initialChargedPeriod(yearly, day('2026-10-04'))).toBe('2026');
    expect(initialChargedPeriod(yearly, day('2026-05-31'))).toBe('2025');
  });

  it('maps a charge date to the nearest billing period, across month ends', () => {
    expect(periodForDate(sub({ billingDay: 1 }), '2026-09-30')).toBe('2026-10');
    expect(periodForDate(sub({ billingDay: 15 }), '2026-09-16')).toBe('2026-09');
    expect(periodForDate(sub({ frequency: 'yearly', billingMonth: 1, billingDay: 2 }), '2026-12-31')).toBe('2027');
  });

  it('monthly cost spreads yearly plans over 12 months', () => {
    expect(monthlyCost(sub({ frequency: 'yearly', amount: 120000 }))).toBe(10000);
    expect(monthlyCost(sub())).toBe(40000);
  });
});

describe('processSubscriptions', () => {
  it('books every missed charge on its billing date and deducts the account', () => {
    const { newData, messages } = processSubscriptions(data([sub()]), day('2026-10-20'));
    const charges = newData.expenses;
    expect(charges.map(e => e.date)).toEqual(['2026-09-15', '2026-10-15']);
    expect(charges[0]).toMatchObject({
      amount: 40000, currency: 'COP', description: 'Netflix', category: 'Entertainment',
      accountId: 'card', subscription: { id: 'netflix', period: '2026-09' },
    });
    expect(newData.accounts[0].balance).toBe(-180000);
    expect(newData.subscriptions![0].lastChargedPeriod).toBe('2026-10');
    expect(messages).toHaveLength(2);
  });

  it('does nothing before the billing day and returns the same data', () => {
    const input = data([sub({ lastChargedPeriod: '2026-09' })]);
    expect(processSubscriptions(input, day('2026-10-14')).newData).toBe(input);
  });

  it('converts to the account currency', () => {
    const input = data([sub({ accountId: 'usd', amount: 40000, currency: 'COP', lastChargedPeriod: '2026-09' })]);
    const { newData } = processSubscriptions(input, day('2026-10-15'));
    expect(newData.accounts[1].balance).toBeLessThan(1000);
    expect(newData.accounts[1].balance).toBeGreaterThan(980);
  });

  it('skips paused subscriptions and ones whose account is gone', () => {
    const input = data([sub({ isActive: false }), sub({ id: 'x', accountId: 'deleted' })]);
    expect(processSubscriptions(input, day('2026-10-20')).newData).toBe(input);
  });

  it('starts a subscription with no history without charging past periods', () => {
    const { newData } = processSubscriptions(data([sub({ lastChargedPeriod: undefined })]), day('2026-10-20'));
    expect(newData.expenses).toHaveLength(0);
    expect(newData.subscriptions![0].lastChargedPeriod).toBe('2026-10');
  });

  it('gives an SMS-matched subscription 3 days for its SMS before charging it', () => {
    const input = data([sub({ smsMatch: 'NETFLIX', lastChargedPeriod: '2026-09' })]);
    expect(processSubscriptions(input, day('2026-10-17')).newData).toBe(input);
    expect(processSubscriptions(input, day('2026-10-18')).newData.expenses).toHaveLength(1);
  });

  it('is idempotent', () => {
    const once = processSubscriptions(data([sub()]), day('2026-10-20')).newData;
    expect(processSubscriptions(once, day('2026-10-20')).newData).toBe(once);
  });
});

describe('claimSubscriptionCharge', () => {
  const charge = { itemId: 'sms1', merchant: 'NETFLIX.COM', accountId: 'card', amount: 44900, currency: 'COP' as const, date: '2026-10-15' };

  it('books an SMS charge as the subscription payment with the real amount', () => {
    const out = claimSubscriptionCharge(data([sub({ smsMatch: 'netflix', lastChargedPeriod: '2026-09' })]), charge)!;
    expect(out.expenses).toEqual([expect.objectContaining({
      id: 'inbox-sms1', amount: 44900, description: 'Netflix', category: 'Entertainment',
      date: '2026-10-15', accountId: 'card', subscription: { id: 'netflix', period: '2026-10' },
    })]);
    expect(out.accounts[0].balance).toBe(-144900);
    expect(out.subscriptions![0].lastChargedPeriod).toBe('2026-10');
  });

  it('returns null when no active subscription matches the merchant', () => {
    expect(claimSubscriptionCharge(data([sub({ smsMatch: 'spotify' })]), charge)).toBeNull();
    expect(claimSubscriptionCharge(data([sub()]), charge)).toBeNull();
    expect(claimSubscriptionCharge(data([sub({ smsMatch: 'netflix', isActive: false })]), charge)).toBeNull();
  });

  it('replaces a scheduled charge already booked for that period, refunding it', () => {
    const booked = processSubscriptions(data([sub({ smsMatch: 'netflix', lastChargedPeriod: '2026-09' })]), day('2026-10-19')).newData;
    expect(booked.accounts[0].balance).toBe(-140000);
    const out = claimSubscriptionCharge(booked, charge)!;
    expect(out.expenses.map(e => e.id)).toEqual(['inbox-sms1']);
    expect(out.accounts[0].balance).toBe(-144900);
    expect(out.subscriptions![0].lastChargedPeriod).toBe('2026-10');
  });

  it('never moves lastChargedPeriod backwards', () => {
    const out = claimSubscriptionCharge(data([sub({ smsMatch: 'netflix', lastChargedPeriod: '2026-11' })]), charge)!;
    expect(out.subscriptions![0].lastChargedPeriod).toBe('2026-11');
  });
});
