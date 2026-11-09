import { describe, expect, test } from 'bun:test';
import { buildOverviewCredential, rollPastResets } from '@/custom/quotaOverview/model';
import { readPassiveQuota } from '@/custom/quotaOverview/passiveQuota';
import i18n from '@/i18n';
import '@/custom/i18n';
import type { QuotaCardState } from '@/features/quota/providers';
import type { AuthFileItem } from '@/types';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const OBSERVED = NOW - 2 * HOUR;
const seconds = (ms: number) => String(Math.round(ms / 1000));

const fileWith = (type: string, signals: Record<string, string>, observedAt = OBSERVED) =>
  ({
    name: `${type}.json`,
    type,
    quota: { observed_at: new Date(observedAt).toISOString(), signals },
  }) as unknown as AuthFileItem;

const claudeSignals = {
  'Anthropic-Ratelimit-Unified-5h-Utilization': '0.1',
  'Anthropic-Ratelimit-Unified-5h-Reset': seconds(NOW + HOUR),
  'Anthropic-Ratelimit-Unified-7d-Utilization': '0.42',
  'Anthropic-Ratelimit-Unified-7d-Reset': seconds(NOW + 48 * HOUR),
};

describe('passive quota from CLIProxy observations', () => {
  test('reads Claude utilization fractions and reset instants', () => {
    const passive = readPassiveQuota('claude', fileWith('claude', claudeSignals));
    expect(passive?.observedAtMs).toBe(OBSERVED);
    expect(passive?.windows.map((w) => [w.id, w.remaining, w.resetAtMs])).toEqual([
      ['five-hour', 90, NOW + HOUR],
      ['seven-day', 58, NOW + 48 * HOUR],
    ]);
  });

  test('reads Codex windows by length, resolving relative resets', () => {
    const passive = readPassiveQuota(
      'codex',
      fileWith('codex', {
        'X-Codex-Primary-Used-Percent': '20',
        'X-Codex-Primary-Window-Minutes': '300',
        'X-Codex-Secondary-Used-Percent': '35',
        'X-Codex-Secondary-Window-Minutes': '10080',
        'X-Codex-Secondary-Reset-After-Seconds': '3600',
      })
    );
    expect(passive?.windows.map((w) => [w.id, w.remaining, w.resetAtMs, w.periodHours])).toEqual([
      ['five-hour', 80, null, 5],
      ['weekly', 65, OBSERVED + HOUR, 168],
    ]);
    expect(passive?.windows.map((w) => w.label)).toEqual([
      i18n.t('codex_quota.primary_window'),
      i18n.t('codex_quota.secondary_window'),
    ]);
  });

  test('a weekly-only primary window shows 89% weekly remaining without an inactive second limit', () => {
    const credential = buildOverviewCredential(
      {
        type: 'codex',
        file: fileWith('codex', {
          'x-codex-primary-used-percent': '11',
          'x-codex-primary-window-minutes': '10080',
          'x-codex-primary-reset-at': seconds(NOW + 48 * HOUR),
          'x-codex-secondary-used-percent': '0',
          'x-codex-secondary-window-minutes': '0',
        }),
      },
      undefined,
      NOW
    );
    expect(credential.windows).toEqual([
      {
        id: 'weekly',
        label: i18n.t('codex_quota.secondary_window'),
        remaining: 89,
        resetAtMs: NOW + 48 * HOUR,
        periodHours: 168,
      },
    ]);
    expect(credential.primary?.id).toBe('weekly');
    expect(credential.sample).toEqual([OBSERVED, 89, NOW + 48 * HOUR]);
  });

  test('swapped primary and secondary slots keep their own duration labels and percentages', () => {
    const passive = readPassiveQuota(
      'codex',
      fileWith('codex', {
        'x-codex-primary-used-percent': '11',
        'x-codex-primary-window-minutes': '10080',
        'x-codex-secondary-used-percent': '20',
        'x-codex-secondary-window-minutes': '300',
      })
    );
    expect(passive?.windows.map((w) => [w.id, w.label, w.remaining, w.periodHours])).toEqual([
      ['weekly', i18n.t('codex_quota.secondary_window'), 89, 168],
      ['five-hour', i18n.t('codex_quota.primary_window'), 80, 5],
    ]);
  });

  test('monthly, unfamiliar and missing durations never assume a five-hour or weekly limit', () => {
    for (const [minutes, id, label, hours] of [
      ['40320', 'monthly', i18n.t('codex_quota.team_secondary_window'), 672],
      ['90', 'codex-primary', i18n.t('pd_overview.codex_window_minutes', { minutes: 90 }), 1.5],
      [undefined, 'codex-primary', i18n.t('pd_overview.codex_window_unknown'), null],
    ] as const) {
      const passive = readPassiveQuota(
        'codex',
        fileWith('codex', {
          'x-codex-primary-used-percent': '11',
          ...(minutes === undefined ? {} : { 'x-codex-primary-window-minutes': minutes }),
        })
      );
      expect(passive?.windows.map((w) => [w.id, w.label, w.remaining, w.periodHours])).toEqual([
        [id, label, 89, hours],
      ]);
    }
  });

  test('ignores missing or malformed observations and other providers', () => {
    expect(readPassiveQuota('claude', { name: 'a', type: 'claude' } as AuthFileItem)).toBeNull();
    expect(readPassiveQuota('claude', fileWith('claude', {}))).toBeNull();
    expect(readPassiveQuota('kimi', fileWith('kimi', claudeSignals))).toBeNull();
  });

  test('a credential with no live quota uses the proxy reading', () => {
    const credential = buildOverviewCredential(
      { type: 'claude', file: fileWith('claude', claudeSignals) },
      undefined,
      NOW
    );
    expect(credential.source).toBe('proxy');
    expect(credential.primary?.remaining).toBe(58);
    expect(credential.sample).toEqual([OBSERVED, 58, NOW + 48 * HOUR]);
  });

  test('the newer reading wins; live-only limits survive a newer proxy reading', () => {
    const live = (observedAt: number) =>
      ({
        status: 'success',
        observedAt: new Date(observedAt).toISOString(),
        windows: [
          {
            id: 'seven-day',
            label: '7d',
            usedPercent: 10,
            resetAtMs: NOW + 48 * HOUR,
            periodHours: 168,
          },
          {
            id: 'seven-day-fable',
            label: 'Fable',
            usedPercent: 5,
            resetAtMs: null,
            periodHours: 168,
          },
        ],
      }) as unknown as QuotaCardState;
    const file = fileWith('claude', claudeSignals);
    const newerLive = buildOverviewCredential({ type: 'claude', file }, live(NOW - HOUR), NOW);
    expect(newerLive.source).toBe('live');
    expect(newerLive.primary?.remaining).toBe(90);

    const olderLive = buildOverviewCredential({ type: 'claude', file }, live(NOW - 5 * HOUR), NOW);
    expect(olderLive.source).toBe('proxy');
    expect(olderLive.windows.map((w) => [w.id, w.remaining])).toEqual([
      ['seven-day', 58],
      ['seven-day-fable', 95],
      ['five-hour', 90],
    ]);
  });

  test('readings taken before a reset count as full, with the next reset', () => {
    const [rolled] = rollPastResets(
      [{ id: 'seven-day', label: '', remaining: 20, resetAtMs: NOW - HOUR, periodHours: 168 }],
      NOW
    );
    expect(rolled.remaining).toBe(100);
    expect(rolled.resetAtMs).toBe(NOW + 167 * HOUR);
  });
});
