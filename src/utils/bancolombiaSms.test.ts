import { describe, it, expect } from 'vitest';
import { parseBancolombiaSms, parseSmsAmount } from './bancolombiaSms';

// Real messages (only the name and phone numbers are as received).
const CREDIT_PURCHASE = 'Bancolombia: Compraste COP30.000,00 en SAFARI SPORTS Y HOBB con tu T.Cred *1342, el 20/09/2026 a las 15:29. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.';
const DEBIT_PURCHASE = 'Bancolombia: Compraste $70.199,00 en CLUB CAMPESTRE con tu T.Deb *2240, el 14/09/2026 a las 15:17. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.';
const TRANSFER_OUT = 'Bancolombia: JUAN, transferiste $330,000.00 a la llave @valeriaa5609 desde tu cuenta *4992 a valeria arango el 17/09/26 a las 11:27. Con Bre-b es de una y gratis. Dudas al 018000912345';
const TRANSFER_IN = 'Bancolombia: Juan, recibiste una transferencia de MARTIN GONZALEZ LONDOÑO por $290,000.00 en tu cuenta *4992 conectada a la llave @isaza060 el 03/09/26 a las 18:35. Con llaves es de una y gratis. Dudas al 018000912345';

describe('parseSmsAmount', () => {
  it('reads Colombian format (dot thousands, comma decimals)', () => {
    expect(parseSmsAmount('30.000,00')).toBe(30000);
    expect(parseSmsAmount('70.199,50')).toBe(70199.5);
  });

  it('reads US format (comma thousands, dot decimals)', () => {
    expect(parseSmsAmount('330,000.00')).toBe(330000);
    expect(parseSmsAmount('1,234,567.89')).toBe(1234567.89);
  });

  it('treats a separator without two trailing digits as thousands', () => {
    expect(parseSmsAmount('30.000')).toBe(30000);
    expect(parseSmsAmount('1,500')).toBe(1500);
    expect(parseSmsAmount('950')).toBe(950);
  });

  it('returns null for garbage', () => {
    expect(parseSmsAmount('')).toBeNull();
    expect(parseSmsAmount('abc')).toBeNull();
  });
});

describe('parseBancolombiaSms', () => {
  it('parses a credit card purchase', () => {
    expect(parseBancolombiaSms(CREDIT_PURCHASE)).toEqual({
      kind: 'purchase',
      amount: 30000,
      currency: 'COP',
      counterparty: 'SAFARI SPORTS Y HOBB',
      source: 'credit',
      last4: '1342',
      date: '2026-09-20',
      time: '15:29',
    });
  });

  it('parses a debit card purchase with a bare $ amount', () => {
    expect(parseBancolombiaSms(DEBIT_PURCHASE)).toEqual({
      kind: 'purchase',
      amount: 70199,
      currency: 'COP',
      counterparty: 'CLUB CAMPESTRE',
      source: 'debit',
      last4: '2240',
      date: '2026-09-14',
      time: '15:17',
    });
  });

  it('parses an outgoing transfer with a two-digit year and US amount', () => {
    expect(parseBancolombiaSms(TRANSFER_OUT)).toEqual({
      kind: 'transfer_out',
      amount: 330000,
      currency: 'COP',
      counterparty: 'valeria arango',
      source: 'account',
      last4: '4992',
      date: '2026-09-17',
      time: '11:27',
    });
  });

  it('parses an incoming transfer', () => {
    expect(parseBancolombiaSms(TRANSFER_IN)).toEqual({
      kind: 'transfer_in',
      amount: 290000,
      currency: 'COP',
      counterparty: 'MARTIN GONZALEZ LONDOÑO',
      source: 'account',
      last4: '4992',
      date: '2026-09-03',
      time: '18:35',
    });
  });

  it('reads a USD purchase abroad', () => {
    const sms = 'Bancolombia: Compraste USD12,50 en AMAZON MKTPL con tu T.Cred *1342, el 01/10/2026 a las 09:05. Si tienes dudas, encuentranos aqui: 6045109095';
    expect(parseBancolombiaSms(sms)).toMatchObject({ kind: 'purchase', amount: 12.5, currency: 'USD' });
  });

  it('returns null for messages it does not recognise', () => {
    expect(parseBancolombiaSms('Bancolombia: Tu clave dinamica es 123456')).toBeNull();
    expect(parseBancolombiaSms('Hola, ¿nos vemos mañana?')).toBeNull();
  });
});
