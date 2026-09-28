import { describe, it, expect } from 'vitest';
import { processInbox, applyEntry, parseCaptureAmount, isRecordedIn, InboxItem } from './inbox';
import { AppData } from '../types';

const baseData = (): AppData => ({
  accounts: [
    { id: 'card', name: 'Black', balance: -100000, currency: 'COP', type: 'credit', matchKeys: ['1342', 'Black Mastercard'] },
    { id: 'savings', name: 'Ahorros', balance: 1000000, currency: 'COP', type: 'savings', matchKeys: ['4992', '2240', 'Debito Mastercard'] },
  ],
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  stocks: [],
  crypto: [],
  fixedIncome: [],
  variableInvestments: [],
  baseCurrency: 'COP',
});

// Apple Pay tap at 15:29 local time on 2026-09-20.
const TAP_AT = new Date(2026, 8, 20, 15, 29).toISOString();

const applePay = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id,
  source: 'applepay',
  amount: '30000',
  merchant: 'SAFARI SPORTS',
  card: 'Black Mastercard',
  category: 'Shopping',
  description: 'Regalo',
  at: TAP_AT,
  ...over,
});

const creditSms = (id: string, amount = 'COP30.000,00', time = '15:29'): InboxItem => ({
  id,
  source: 'sms',
  text: `Bancolombia: Compraste ${amount} en SAFARI SPORTS Y HOBB con tu T.Cred *1342, el 20/09/2026 a las ${time}. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.`,
});

describe('parseCaptureAmount', () => {
  it('reads plain numbers and Colombian-formatted amounts', () => {
    expect(parseCaptureAmount('30000')).toBe(30000);
    expect(parseCaptureAmount('30000.5')).toBe(30000.5);
    expect(parseCaptureAmount('$30.000,00')).toBe(30000);
    expect(parseCaptureAmount('COP 30.000')).toBe(30000);
    expect(parseCaptureAmount('')).toBeNull();
  });
});

describe('processInbox', () => {
  it('returns the same data object when the inbox is empty', () => {
    const data = baseData();
    const result = processInbox(data, []);
    expect(result.data).toBe(data);
    expect(result.deleteIds).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it('books a categorised Apple Pay capture straight away', () => {
    const { data, deleteIds, pending } = processInbox(baseData(), [applePay('a1')]);
    expect(pending).toEqual([]);
    expect(deleteIds).toEqual(['a1']);
    expect(data.expenses).toEqual([{
      id: 'inbox-a1',
      amount: 30000,
      currency: 'COP',
      description: 'Regalo',
      category: 'Shopping',
      date: '2026-09-20',
      accountId: 'card',
      capture: { via: 'applepay', at: TAP_AT },
    }]);
    // Card debt grows by the purchase.
    expect(data.accounts.find(a => a.id === 'card')!.balance).toBe(-130000);
  });

  it('falls back to the merchant when the shortcut sends no description', () => {
    const { data } = processInbox(baseData(), [applePay('a1', { description: '' })]);
    expect(data.expenses[0].description).toBe('SAFARI SPORTS');
  });

  it('is idempotent if the item was booked but not yet deleted', () => {
    const first = processInbox(baseData(), [applePay('a1')]).data;
    const second = processInbox(first, [applePay('a1')]);
    expect(second.data).toBe(first);
    expect(second.deleteIds).toEqual(['a1']);
  });

  it('matches cards case-insensitively', () => {
    const { data } = processInbox(baseData(), [applePay('a1', { card: 'black mastercard ' })]);
    expect(data.expenses[0].accountId).toBe('card');
  });

  it('holds Apple Pay captures for an unknown card or category for review', () => {
    const { data, pending, deleteIds } = processInbox(baseData(), [
      applePay('a1', { card: 'Otra Visa' }),
      applePay('a2', { category: 'Comida' }),
    ]);
    expect(data.expenses).toEqual([]);
    expect(deleteIds).toEqual([]);
    expect(pending.map(p => [p.itemId, p.accountId, p.category])).toEqual([
      ['a1', '', 'Shopping'],
      ['a2', 'card', ''],
    ]);
  });

  it('drops the bank SMS that pairs with an Apple Pay purchase', () => {
    const { data, deleteIds, pending } = processInbox(baseData(), [applePay('a1'), creditSms('s1')]);
    expect(pending).toEqual([]);
    expect(deleteIds.sort()).toEqual(['a1', 's1']);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].capture?.pairedItemId).toBe('s1');
    // The SMS must not debit the card a second time.
    expect(data.accounts.find(a => a.id === 'card')!.balance).toBe(-130000);
  });

  it('pairs an SMS that arrives after the Apple Pay expense was already booked', () => {
    const booked = processInbox(baseData(), [applePay('a1')]).data;
    const { data, deleteIds, pending } = processInbox(booked, [creditSms('s1', 'COP30.000,00', '15:31')]);
    expect(pending).toEqual([]);
    expect(deleteIds).toEqual(['s1']);
    expect(data.expenses[0].capture?.pairedItemId).toBe('s1');
  });

  it('pairs one SMS per purchase when the same amount is paid twice (split bill)', () => {
    const tap2 = new Date(2026, 8, 20, 15, 30).toISOString();
    const { data, pending, deleteIds } = processInbox(baseData(), [
      applePay('a1'),
      applePay('a2', { at: tap2 }),
      creditSms('s1', 'COP30.000,00', '15:29'),
      creditSms('s2', 'COP30.000,00', '15:30'),
    ]);
    expect(data.expenses).toHaveLength(2);
    expect(pending).toEqual([]);
    expect(deleteIds.sort()).toEqual(['a1', 'a2', 's1', 's2']);
    expect(data.accounts.find(a => a.id === 'card')!.balance).toBe(-160000);
  });

  it('keeps a second identical SMS pending when only one Apple Pay purchase exists', () => {
    const { data, pending } = processInbox(baseData(), [
      applePay('a1'),
      creditSms('s1', 'COP30.000,00', '15:29'),
      creditSms('s2', 'COP30.000,00', '15:31'),
    ]);
    expect(data.expenses).toHaveLength(1);
    expect(pending.map(p => p.itemId)).toEqual(['s2']);
  });

  it('does not pair when the amount or time window differs', () => {
    const { pending } = processInbox(baseData(), [
      applePay('a1'),
      creditSms('s1', 'COP31.000,00', '15:29'),
      creditSms('s2', 'COP30.000,00', '16:30'),
    ]);
    expect(pending.map(p => p.itemId).sort()).toEqual(['s1', 's2']);
  });

  it('lets an SMS pair with an Apple Pay capture that is itself waiting for review', () => {
    const { pending, deleteIds } = processInbox(baseData(), [
      applePay('a1', { category: '' }),
      creditSms('s1'),
    ]);
    expect(pending.map(p => p.itemId)).toEqual(['a1']);
    expect(deleteIds).toEqual(['s1']);
  });

  it('queues unmatched purchases and transfers for review with their account', () => {
    const { pending, deleteIds } = processInbox(baseData(), [
      { id: 's1', source: 'sms', text: 'Bancolombia: Compraste $70.199,00 en CLUB CAMPESTRE con tu T.Deb *2240, el 14/09/2026 a las 15:17. Si tienes dudas, encuentranos aqui: 6045109095' },
      { id: 's2', source: 'sms', text: 'Bancolombia: JUAN, transferiste $330,000.00 a la llave @valeriaa5609 desde tu cuenta *4992 a valeria arango el 17/09/26 a las 11:27. Con Bre-b es de una y gratis.' },
      { id: 's3', source: 'sms', text: 'Bancolombia: Juan, recibiste una transferencia de MARTIN GONZALEZ LONDOÑO por $290,000.00 en tu cuenta *4992 conectada a la llave @isaza060 el 03/09/26 a las 18:35. Con llaves es de una y gratis.' },
    ]);
    expect(deleteIds).toEqual([]);
    expect(pending.map(p => [p.itemId, p.kind, p.amount, p.accountId, p.description, p.date])).toEqual([
      // Oldest first.
      ['s3', 'income', 290000, 'savings', 'Transfer from MARTIN GONZALEZ LONDOÑO', '2026-09-03'],
      ['s1', 'expense', 70199, 'savings', 'CLUB CAMPESTRE', '2026-09-14'],
      ['s2', 'expense', 330000, 'savings', 'Transfer to valeria arango', '2026-09-17'],
    ]);
  });

  it('drops an SMS that was already booked from the review queue', () => {
    const sms: InboxItem = { id: 's3', source: 'sms', text: 'Bancolombia: Juan, recibiste una transferencia de MARTIN por $290,000.00 en tu cuenta *4992 conectada a la llave @isaza060 el 03/09/26 a las 18:35.' };
    const pending = processInbox(baseData(), [sms]).pending;
    const booked = applyEntry(baseData(), pending[0]);
    const again = processInbox(booked, [sms]);
    expect(again.pending).toEqual([]);
    expect(again.deleteIds).toEqual(['s3']);
    expect(again.data).toBe(booked);
  });

  it('discards SMS it cannot parse', () => {
    const { deleteIds, pending } = processInbox(baseData(), [
      { id: 'x', source: 'sms', text: 'Bancolombia: Tu clave dinamica es 123456' },
    ]);
    expect(deleteIds).toEqual(['x']);
    expect(pending).toEqual([]);
  });
});

describe('applyEntry', () => {
  const entry = {
    itemId: 's3',
    origin: 'sms' as const,
    kind: 'income' as const,
    amount: 290000,
    currency: 'COP' as const,
    description: 'Transfer from Martin',
    category: 'Other',
    date: '2026-09-03',
    time: '18:35',
    accountId: 'savings',
    reason: '',
  };

  it('books an income into the account', () => {
    const data = applyEntry(baseData(), entry);
    expect(data.incomes).toEqual([{
      id: 'inbox-s3', amount: 290000, currency: 'COP', description: 'Transfer from Martin',
      category: 'Other', date: '2026-09-03', accountId: 'savings',
    }]);
    expect(data.accounts.find(a => a.id === 'savings')!.balance).toBe(1290000);
  });

  it('books an expense and never twice', () => {
    const once = applyEntry(baseData(), { ...entry, kind: 'expense' });
    const twice = applyEntry(once, { ...entry, kind: 'expense' });
    expect(twice).toBe(once);
    expect(once.expenses).toHaveLength(1);
    expect(once.accounts.find(a => a.id === 'savings')!.balance).toBe(710000);
  });
});

describe('isRecordedIn', () => {
  it('finds a booked Apple Pay capture and a paired SMS', () => {
    const { data } = processInbox(baseData(), [applePay('a1'), creditSms('s1')]);
    expect(isRecordedIn(data, 'a1')).toBe(true);
    expect(isRecordedIn(data, 's1')).toBe(true);
  });

  it('finds a reviewed income', () => {
    const data = applyEntry(baseData(), {
      itemId: 's3', origin: 'sms', kind: 'income', amount: 1, currency: 'COP', description: 'x',
      category: 'Other', date: '2026-09-03', time: '18:35', accountId: 'savings', reason: '',
    });
    expect(isRecordedIn(data, 's3')).toBe(true);
  });

  it('is false for items that leave no trace (unreadable SMS)', () => {
    expect(isRecordedIn(baseData(), 'x')).toBe(false);
  });
});
