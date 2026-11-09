import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import '@/custom/i18n';
import { PoolChart, type PoolChartProps } from '@/custom/quotaOverview/PoolChart';
import type { PoolAccount } from '@/custom/quotaOverview/poolForecast';

const NOW = 1_800_000_000_000;
const account = (key: string, remaining: number): PoolAccount => ({
  key,
  name: key,
  label: key,
  priority: 0,
  enabled: true,
  remaining,
  resetAtMs: NOW + 86_400_000,
  periodMs: 604_800_000,
  blockedUntilMs: null,
  samples: [[NOW, remaining, NOW + 86_400_000]],
});
const base: PoolChartProps = {
  provider: 'claude',
  accounts: [account('a', 98), account('b', 97), account('c', 96)],
  fableAccounts: [account('fa', 95), account('fb', 94), account('fc', 93)],
  credentialCount: 3,
  nowMs: NOW,
  rangeStartMs: NOW - 86_400_000,
  rangeEndMs: NOW + 604_800_000,
  mode: 'remaining',
  burnHours: 3,
  futureUsage: 'current',
  routing: 'soonest-reset-first',
  resolvedTheme: 'light',
};
const render = (patch: Partial<PoolChartProps> = {}) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: i18n.cloneInstance({ lng: 'en', initImmediate: false }) },
      createElement(PoolChart, { ...base, ...patch })
    )
  );

describe('quota chart summary', () => {
  test('shows both pooled totals and one common capacity with just provider legend keys', () => {
    const html = render();
    // aria-hidden separator and a single denominator distinguish the two readings.
    expect(html).toContain('>291%</span>');
    expect(html).toContain('>282%</span>');
    expect(html).toContain('aria-hidden="true">/</span>');
    expect(html.match(/>of 300%<\/span>/g)).toHaveLength(1);
    const legend = html.match(/<footer[^>]*>(.*?)<\/footer>/)?.[1] ?? '';
    expect(legend).toContain('Claude');
    expect(legend).toContain('Fable');
    for (const removed of ['Weekly', 'Recorded', 'Projected', '282%']) {
      expect(legend).not.toContain(removed);
    }
  });

  test('keeps each capacity when fewer accounts report a Fable allowance', () => {
    const html = render({ fableAccounts: [account('fa', 95), account('fb', 94)] });
    expect(html).toContain('>291%</span>');
    expect(html).toContain('>189%</span>');
    expect(html).toContain('>of 300%</span>');
    expect(html).toContain('>of 200%</span>');
  });

  test('keeps one number and provider key when no Fable allowance is reported', () => {
    const html = render({ fableAccounts: [] });
    expect(html).toContain('>291%</span>');
    expect(html).not.toContain('aria-hidden="true">/</span>');
    const legend = html.match(/<footer[^>]*>(.*?)<\/footer>/)?.[1] ?? '';
    expect(legend).toContain('Claude');
    expect(legend).not.toContain('Fable');
  });
});
