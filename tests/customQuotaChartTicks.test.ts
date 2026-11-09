import { describe, expect, test } from 'bun:test';
import { niceCeil, remainingQuotaTicks } from '@/custom/quotaOverview/chartTicks';

describe('remaining quota chart guides', () => {
  test('shows 50% guides and 100% labels for a three-account pool', () => {
    const ticks = remainingQuotaTicks(300);
    expect(ticks.map((tick) => tick.value)).toEqual([0, 50, 100, 150, 200, 250, 300]);
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.value)).toEqual([
      0, 100, 200, 300,
    ]);
  });

  test('keeps a single-account pool on its actual 100% scale', () => {
    expect(remainingQuotaTicks(100)).toEqual([
      { value: 0, label: true },
      { value: 50, label: false },
      { value: 100, label: true },
    ]);
  });

  test('bounds large pools and keeps their full capacity visible', () => {
    for (const capacity of [600, 1900, 2500, 10_000, 100_000]) {
      const ticks = remainingQuotaTicks(capacity);
      expect(ticks.length).toBeLessThanOrEqual(26);
      expect(ticks.at(-1)).toEqual({ value: capacity, label: true });
      expect(new Set(ticks.map((tick) => tick.value)).size).toBe(ticks.length);
      expect(ticks.every((tick) => tick.value >= 0 && tick.value <= capacity)).toBe(true);
    }
  });

  test('does not generate axes from invalid capacity', () => {
    for (const capacity of [0, -100, Infinity, NaN])
      expect(remainingQuotaTicks(capacity)).toEqual([]);
  });
});

test('burn-rate axes still round fractional rates without percent-capacity steps', () => {
  expect(niceCeil(0.13)).toBe(0.2);
  expect(niceCeil(3.7)).toBe(5);
  expect(niceCeil(0)).toBe(1);
});
