import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import '@/custom/i18n';
import { ResetsCell } from '@/custom/quotaOverview/components';
import {
  backAtMs,
  buildOverviewCredential,
  buildProviderPools,
  historyKey,
  FABLE_WINDOW_ID,
  resetGrantKind,
  credentialLabel,
  maskEmails,
  resetUrgency,
  firstInLine,
  formatCountdown,
  formatTimeLeft,
  pickPrimaryWindow,
  sortCredentials,
  type OverviewWindow,
} from '@/custom/quotaOverview/model';
import { formatClaudeTier } from '@/custom/quotaOverview/useClaudeTiers';
import type { QuotaCardState } from '@/features/quota/providers';
import type { AuthFileItem } from '@/types';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

const claudeQuota = (weeklyUsed: number, fiveHourUsed: number, weeklyResetMs: number) =>
  ({
    status: 'success',
    planType: 'Max',
    windows: [
      {
        id: 'five-hour',
        label: '5-hour limit',
        usedPercent: fiveHourUsed,
        resetLabel: '',
        resetAtMs: NOW + 2 * HOUR,
        periodHours: 5,
      },
      {
        id: 'seven-day',
        label: '7-day limit',
        usedPercent: weeklyUsed,
        resetLabel: '',
        resetAtMs: weeklyResetMs,
        periodHours: 168,
      },
      {
        id: 'seven-day-fable',
        label: '7-day Fable 5',
        usedPercent: 0,
        resetLabel: '',
        resetAtMs: weeklyResetMs,
        periodHours: 168,
      },
    ],
  }) as unknown as QuotaCardState;

const credential = (
  name: string,
  quota: QuotaCardState | undefined,
  file: Partial<AuthFileItem> = {}
) =>
  buildOverviewCredential({ type: 'claude', file: { name, type: 'claude', ...file } }, quota, NOW);

const window = (patch: Partial<OverviewWindow>): OverviewWindow => ({
  id: 'w',
  label: 'w',
  remaining: 50,
  resetAtMs: null,
  periodHours: null,
  ...patch,
});

describe('quota overview model', () => {
  test('normalizes Claude windows to percent remaining and picks the 7-day limit', () => {
    const c = credential('a.json', claudeQuota(30, 90, NOW + 48 * HOUR));
    expect(c.windows.map((w) => w.remaining)).toEqual([10, 70, 100]);
    expect(c.primary?.id).toBe('seven-day');
    expect(c.plan).toBe('Max');
  });

  test('falls back to the longest window up to a week', () => {
    const picked = pickPrimaryWindow([
      window({ id: 'a', periodHours: 5 }),
      window({ id: 'b', periodHours: 24 }),
      window({ id: 'c', periodHours: 720 }),
    ]);
    expect(picked?.id).toBe('b');
  });

  test('back-at is the latest reset among exhausted limits', () => {
    expect(
      backAtMs(
        [
          window({ remaining: 0, resetAtMs: NOW + HOUR }),
          window({ remaining: 0, resetAtMs: NOW + 5 * HOUR }),
          window({ remaining: 40, resetAtMs: NOW + 9 * HOUR }),
        ],
        NOW
      )
    ).toBe(NOW + 5 * HOUR);
    expect(backAtMs([window({ remaining: 3, resetAtMs: NOW + HOUR })], NOW)).toBeNull();
  });

  test('routing order is priority first, then file name', () => {
    const list = [
      credential('b.json', claudeQuota(0, 0, NOW + HOUR)),
      credential('a.json', claudeQuota(0, 0, NOW + HOUR)),
      credential('z.json', claudeQuota(0, 0, NOW + HOUR), { priority: 10 }),
    ];
    expect(sortCredentials(list, 'routing', NOW).map((c) => c.entry.file.name)).toEqual([
      'z.json',
      'a.json',
      'b.json',
    ]);
  });

  test('frontend quota alone never predicts the next account', () => {
    const list = [
      credential('a.json', claudeQuota(100, 0, NOW + HOUR)),
      credential('b.json', claudeQuota(0, 0, NOW + HOUR), {
        cooldownSnapshot: {
          receivedAtMs: NOW,
          records: [
            {
              scope: 'credential',
              reason: 'quota',
              retryAt: new Date(NOW + HOUR).toISOString(),
              remainingSeconds: 3600,
            },
          ],
        },
      }),
      credential('c.json', claudeQuota(0, 0, NOW + HOUR), { disabled: true }),
      credential('d.json', claudeQuota(10, 0, NOW + HOUR)),
    ];
    expect([...firstInLine(list)]).toEqual([]);
  });

  test('provider pools keep loaded credentials in routing order with their history', () => {
    const list = [
      credential('b.json', claudeQuota(10, 0, NOW + 24 * HOUR)),
      credential('a.json', claudeQuota(40, 0, NOW + 48 * HOUR), { disabled: true }),
      credential('c.json', undefined),
    ];
    const history = { [historyKey('claude', 'a.json')]: [[NOW - HOUR, 70, null]] } as const;
    const [pool] = buildProviderPools(list, ['claude', 'codex'], history as never);
    expect(pool.credentialCount).toBe(3);
    expect(pool.accounts.map((account) => [account.name, account.remaining])).toEqual([
      ['a.json', 60],
      ['b.json', 90],
    ]);
    expect(pool.accounts[0].enabled).toBe(false);
    expect(pool.accounts[0].samples).toHaveLength(1);
    expect(pool.accounts[1].periodMs).toBe(168 * HOUR);
  });

  test('formats compact countdowns', () => {
    expect(formatCountdown(NOW + 51 * HOUR, NOW)).toBe('2d 3h');
    expect(formatCountdown(NOW + 4.5 * HOUR, NOW)).toBe('4h 30m');
    expect(formatCountdown(NOW + 12 * 60_000, NOW)).toBe('12m');
  });

  test('Fable allowance and history remain separate from shared weekly quota', () => {
    const c = credential('a.json', claudeQuota(30, 0, NOW + 48 * HOUR));
    const fable = c.windows.find((w) => w.id === FABLE_WINDOW_ID)!;
    fable.remaining = 20;
    const sharedKey = historyKey('claude', 'a.json');
    const fableKey = historyKey('claude', 'a.json', FABLE_WINDOW_ID);
    expect(fableKey).not.toBe(sharedKey);
    const history = {
      [sharedKey]: [[NOW - HOUR, 75, null]],
      [fableKey]: [[NOW - HOUR, 25, null]],
    } as const;
    const [pool] = buildProviderPools([c], ['claude'], history as never);
    expect(pool.accounts[0].remaining).toBe(70);
    expect(pool.fableAccounts[0].remaining).toBe(20);
    expect(pool.accounts[0].samples[0][1]).toBe(75);
    expect(pool.fableAccounts[0].samples[0][1]).toBe(25);
    expect(pool.fableAccounts[0].resetAtMs).toBe(NOW + 48 * HOUR);
  });

  test('missing Fable windows do not invent extra allowance', () => {
    const c = credential('a.json', claudeQuota(30, 0, NOW + 48 * HOUR));
    c.windows = c.windows.filter((w) => w.id !== FABLE_WINDOW_ID);
    const [pool] = buildProviderPools([c], ['claude'], {});
    expect(pool.fableAccounts).toEqual([]);
    expect(pool.accounts).toHaveLength(1);
  });

  test('Fable history uses its own observation time and retains the pre-reset reading', () => {
    const quota = {
      ...claudeQuota(30, 0, NOW - HOUR),
      observedAt: new Date(NOW - 2 * HOUR).toISOString(),
    } as QuotaCardState;
    (quota as { windows: { usedPercent: number }[] }).windows[2].usedPercent = 60;
    const c = credential('a.json', quota);
    expect(c.fableSample).toEqual([NOW - 2 * HOUR, 40, NOW - HOUR]);
    expect(c.fableObservedAtMs).toBe(NOW - 2 * HOUR);
    expect(c.windows.find((w) => w.id === FABLE_WINDOW_ID)?.remaining).toBe(100);
    expect(c.windows.find((w) => w.id === FABLE_WINDOW_ID)?.resetAtMs).toBeGreaterThan(NOW);
  });

  test('newer shared headers do not give an old Fable reading a new timestamp', () => {
    const quota = {
      ...claudeQuota(30, 0, NOW + 48 * HOUR),
      observedAt: new Date(NOW - 2 * HOUR).toISOString(),
    } as QuotaCardState;
    const c = credential('a.json', quota, {
      quota: {
        observed_at: new Date(NOW - HOUR).toISOString(),
        signals: {
          'Anthropic-Ratelimit-Unified-7d-Utilization': '0.42',
          'Anthropic-Ratelimit-Unified-7d-Reset': String((NOW + 48 * HOUR) / 1000),
        },
      },
    } as unknown as Partial<AuthFileItem>);
    expect(c.sample?.slice(0, 2)).toEqual([NOW - HOUR, 58]);
    expect(c.fableSample?.slice(0, 2)).toEqual([NOW - 2 * HOUR, 100]);
    expect(c.fableObservedAtMs).toBe(NOW - 2 * HOUR);
  });

  test('reset scope follows reported Fable labels or shared windows, never guessed IDs', () => {
    expect(resetGrantKind({ label: 'Fable 5 reset', clears: ['seven_day'] })).toBe('fable');
    expect(resetGrantKind({ label: 'Regular reset', clears: ['five_hour', 'seven_day'] })).toBe(
      'shared'
    );
    expect(resetGrantKind({ label: '', clears: ['seven_day_overage_included'] })).toBe('unknown');
    expect(resetGrantKind({ label: 'Available reset', clears: [] })).toBe('unknown');
  });

  test('reset credits show their scope without activating redemption', () => {
    const html = renderToStaticMarkup(
      createElement(ResetsCell, {
        credits: [
          { id: 'a', count: 1, label: 'Fable', expiresAtMs: null, kind: 'fable' },
          { id: 'b', count: 2, label: 'Regular', expiresAtMs: null, kind: 'shared' },
          { id: 'c', count: 1, label: null, expiresAtMs: null, kind: 'unknown' },
        ],
        nowMs: NOW,
        canUse: false,
        onUse: () => {
          throw new Error('render must not redeem a reset');
        },
      })
    );
    for (const scope of ['fable', 'shared', 'unknown']) {
      expect(html).toContain(i18n.t(`pd_overview.reset_${scope}`));
    }
    expect(html).toContain('disabled');
  });

  test('masks email local parts and prefers the account note', () => {
    expect(maskEmails('pdavis@example.com')).toBe('p•••@example.com');
    // Hyphens are valid in local parts, so a file-name prefix is hidden with the address.
    expect(maskEmails('claude-114cec5c-pdavis@example.com.json')).toBe('c•••@example.com.json');
    expect(maskEmails('no email here')).toBe('no email here');
    expect(credentialLabel({ name: 'a.json', email: 'x@y.com', note: ' Work Max ' })).toBe(
      'Work Max'
    );
    expect(credentialLabel({ name: 'a.json', email: 'x@y.com' })).toBe('x@y.com');
  });

  test('reset urgency: red within a day, yellow within a week', () => {
    expect(resetUrgency(NOW + 3 * HOUR, NOW)).toBe('day');
    expect(resetUrgency(NOW + 3 * 24 * HOUR, NOW)).toBe('week');
    expect(resetUrgency(NOW + 9 * 24 * HOUR, NOW)).toBe('later');
    expect(resetUrgency(null, NOW)).toBe('none');
  });

  test('formats Claude tiers from the profile rate_limit_tier', () => {
    expect(formatClaudeTier('default_claude_max_20x')).toBe('Max 20x');
    expect(formatClaudeTier('default_claude_max_5x')).toBe('Max 5x');
    expect(formatClaudeTier('default_claude_pro')).toBe('Pro');
    expect(formatClaudeTier(undefined)).toBeNull();
  });

  test('time left is the largest whole unit, without "in"', () => {
    expect(formatTimeLeft(NOW + 8.4 * 24 * HOUR, NOW, 'en')).toBe('8 days');
    expect(formatTimeLeft(NOW + 30 * HOUR, NOW, 'en')).toBe('30 hours');
    expect(formatTimeLeft(NOW + 40 * 60_000, NOW, 'en')).toBe('40 minutes');
  });
});
