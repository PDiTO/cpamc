import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/i18n/index';
import { QuotaTimeline } from '../src/features/quota/components/QuotaTimeline';
import type { QuotaFileEntry } from '../src/features/quota/logic';
import { providerChartColor } from '../src/custom/quotaOverview/PoolChart';

const entries: QuotaFileEntry[] = [
  { file: { name: 'claude.json', type: 'claude' }, type: 'claude' },
  { file: { name: 'codex.json', type: 'codex' }, type: 'codex' },
];

const render = (theme: 'light' | 'dark') =>
  renderToStaticMarkup(
    createElement(QuotaTimeline, {
      entries,
      displayNameFor: (name: string) => name,
      resolvedTheme: theme,
      now: new Date(2026, 6, 29, 12).getTime(),
      accentFor: (provider) => providerChartColor(provider, theme),
      quotaFor: () => ({
        status: 'success',
        windows: [
          {
            label: '7-day',
            usedPercent: 25,
            resetAtMs: new Date(2026, 7, 1, 12).getTime(),
            periodHours: 168,
          },
        ],
      }),
    })
  );

describe('quota windows timeline on Quota Overview', () => {
  test('colors Claude and Codex lanes like the pool chart in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const markup = render(theme);
      expect(markup).toContain(`--provider-accent:${providerChartColor('claude', theme)}`);
      expect(markup).toContain(`--provider-accent:${providerChartColor('codex', theme)}`);
    }
  });
});
