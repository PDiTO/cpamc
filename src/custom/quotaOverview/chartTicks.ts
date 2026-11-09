/** 1, 2 or 5 times a power of ten, at least `value`. */
export const niceCeil = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
};

/** Fifty-percent guides for small pools; bounded, round steps for larger pools. */
export function remainingQuotaTicks(capacity: number) {
  if (!Number.isFinite(capacity) || capacity <= 0) return [];
  const step = capacity <= 300 ? 50 : Math.max(100, niceCeil(capacity / 24));
  const labelStep = Math.max(100, niceCeil(capacity / 5));
  const ticks = Array.from({ length: Math.floor(capacity / step) + 1 }, (_, index) => {
    const value = index * step;
    return { value, label: value % labelStep === 0 || value === capacity };
  });
  if (ticks[ticks.length - 1].value !== capacity) ticks.push({ value: capacity, label: true });
  return ticks;
}
