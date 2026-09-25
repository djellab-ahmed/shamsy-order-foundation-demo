import { describe, expect, it } from 'vitest';
import { calculateLine, calculateOrder, fingerprint, MIN_RATE, parseUsd, products, validateSave, WORKED_EXAMPLE, type Draft } from '../src/lib/finance';

describe('worked example financial facts', () => {
  const draft: Draft = structuredClone(WORKED_EXAMPLE);
  it('uses exact fixed prices, discounts, percentages, and thresholds', () => {
    const [first, second, third] = draft.lines.map(calculateLine);
    expect(products[0].priceCents * 4).toBe(206000);
    expect(first.subtotalCents).toBe(206000);
    expect(first.totalCents).toBe(202000);
    expect(first.bps).toBe(194);
    expect(first.status).toBe('sand');
    expect(second.subtotalCents).toBe(162000);
    expect(second.bps).toBe(432);
    expect(second.status).toBe('red');
    expect(third.subtotalCents).toBe(207000);
    expect(third.bps).toBe(725);
    expect(third.status).toBe('blocked');
  });
  it('rejects the unapproved line, then saves $3,570 and 29,274,000 SDG without it', () => {
    expect(() => validateSave(draft)).toThrow(/Owner approval is required/);
    const result = validateSave({ ...draft, lines: draft.lines.slice(0, 2) });
    expect(result.totalCents).toBe(357000);
    expect(result.totalSdg).toBe(29274000);
  });
  it('calculates $5,490 and 45,018,000 SDG with exact-line owner approval', () => {
    const approved = structuredClone(draft);
    approved.lines[2].approval = { fingerprint: fingerprint(approved.lines[2]), approvedAt: '2026-09-22T00:00:00Z', approvedBy: 'Owner', note: '' };
    const result = validateSave(approved);
    expect(result.totalCents).toBe(549000);
    expect(result.totalSdg).toBe(45018000);
    approved.lines[2].discountCents = 16000;
    expect(() => validateSave(approved)).toThrow(/Owner approval/);
  });
  it('rejects a rate below the minimum and keeps an 8,200 historical snapshot when current rate changes', () => {
    expect(MIN_RATE).toBe(8000);
    expect(() => calculateOrder({ ...draft, rate: 7900 })).toThrow(/at least/);
    const saved = structuredClone(draft);
    const currentSetting = 9000;
    expect(currentSetting).toBe(9000);
    expect(saved.rate).toBe(8200);
    expect(calculateOrder(saved).totalSdg).toBe(45018000);
  });
  it('uses exact threshold comparisons even where rounded basis points could cross a boundary', () => {
    const line = { id: 'x', productId: products[0].id, quantity: 1, discountCents: 1546 };
    expect(calculateLine(line).status).toBe('red');
  });
  it('parses USD cents without floating-point multiplication', () => {
    expect(parseUsd('0.01')).toBe(1);
    expect(parseUsd('2070.99')).toBe(207099);
    expect(parseUsd('1.234')).toBe(0);
  });
});
