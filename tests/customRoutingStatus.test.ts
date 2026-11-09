import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import '@/custom/i18n';
import {
  currentRoutingSnapshot,
  defaultRoutingQuery,
  normalizeRoutingSnapshot,
  routingAccountFor,
  type RoutingLoads,
} from '@/custom/quotaOverview/routing';
import { PolicyPanel } from '@/features/routing/components/PolicyPanel';
import { ROUTING_STRATEGIES } from '@/types/routing';
import {
  buildOverviewCredential,
  firstInLine,
  sortCredentials,
} from '@/custom/quotaOverview/model';
import { normalizeRoutingStrategy, readRoutingSettings } from '@/services/api/routing';
import { parseRoutingStrategy, useVisualConfig } from '@/hooks/useVisualConfig';
import type { AuthFileItem } from '@/types';

const NOW = 1_800_000_000_000;
const query = defaultRoutingQuery('codex');
const rawAccount = (index: string, rank: number) => ({
  auth_index: index,
  priority: 0,
  eligible: rank > 0,
  skipped_reason: rank ? '' : 'disabled',
  rank,
  quota_state: 'fresh',
  age_seconds: 12,
  window: { key: 'weekly', resets_at: new Date(NOW + 3_600_000).toISOString(), used_percent: 25 },
});
const rawStatus = () => ({
  schema_version: 1,
  prediction_scope: 'new_session',
  strategy: 'soonest-reset-first',
  provider: query.provider,
  model: query.model,
  transport: query.transport,
  generated_at: new Date(NOW).toISOString(),
  next_auth_index: 'second',
  fallback_reason: '',
  session_affinity: true,
  accounts: [rawAccount('first', 2), rawAccount('second', 1)],
});
const loads = (): RoutingLoads => ({
  codex: {
    state: 'ready',
    snapshot: normalizeRoutingSnapshot(rawStatus(), query, NOW),
  },
});
const file = (name: string, index: string): AuthFileItem => ({
  name,
  type: 'codex',
  authIndex: index,
});

describe('backend routing contract', () => {
  test('joins by opaque account index and uses backend rank, independent of filename order', () => {
    const credentials = [file('a.json', 'first'), file('z.json', 'second')].map((file) => ({
      ...buildOverviewCredential({ type: 'codex', file }, undefined, NOW),
      routing: routingAccountFor(file, 'codex', loads(), NOW),
    }));
    expect(
      sortCredentials(credentials, 'routing', NOW).map((item) => item.entry.file.name)
    ).toEqual(['z.json', 'a.json']);
    expect([...firstInLine(credentials)]).toEqual(['codex:z.json']);
    expect(routingAccountFor(file('second', 'unknown'), 'codex', loads(), NOW)).toBeUndefined();
    expect(routingAccountFor(file('a.json', 'second'), 'claude', loads(), NOW)).toBeUndefined();
  });

  test('never predicts from unsupported, failed or expired snapshots', () => {
    for (const load of [{ state: 'unsupported' }, { state: 'error' }] as const) {
      expect(currentRoutingSnapshot(load, NOW)).toBeNull();
    }
    expect(
      routingAccountFor(file('a.json', 'second'), 'codex', loads(), NOW + 90_001)
    ).toBeUndefined();
    expect(
      routingAccountFor(file('a.json', 'second'), 'codex', loads(), NOW + 5_000)?.ageSeconds
    ).toBe(17);
    // A response received between shared minute-clock ticks is immediately usable.
    expect(
      routingAccountFor(file('a.json', 'second'), 'codex', loads(), NOW - 59_000)?.ageSeconds
    ).toBe(12);
  });

  test('an over-limit account does not discard the healthy account ranking', () => {
    const exhausted = rawAccount('first', 0);
    exhausted.skipped_reason = 'quota_exhausted';
    exhausted.window.used_percent = 100.4;
    const snapshot = normalizeRoutingSnapshot(
      { ...rawStatus(), accounts: [exhausted, rawAccount('second', 1)] },
      query,
      NOW
    );
    expect(snapshot.accounts[0].window?.usedPercent).toBe(100);
    expect(snapshot.accounts[0].eligible).toBe(false);
    expect(snapshot.nextAuthIndex).toBe('second');
    expect(
      routingAccountFor(
        file('z.json', 'second'),
        'codex',
        { codex: { state: 'ready', snapshot } },
        NOW
      )?.next
    ).toBe(true);
    for (const usedPercent of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      exhausted.window.used_percent = usedPercent;
      expect(() =>
        normalizeRoutingSnapshot(
          { ...rawStatus(), accounts: [exhausted, rawAccount('second', 1)] },
          query,
          NOW
        )
      ).toThrow();
    }
  });

  test('Home, plugins and unpredictable strategies suppress next-account and rank claims', () => {
    for (const reason of ['home_authoritative', 'plugin_scheduler', 'strategy_not_predictable']) {
      const snapshot = normalizeRoutingSnapshot(
        { ...rawStatus(), fallback_reason: reason, next_auth_index: undefined },
        query,
        NOW
      );
      expect(
        routingAccountFor(
          file('a.json', 'second'),
          'codex',
          { codex: { state: 'ready', snapshot } },
          NOW
        )
      ).toBeUndefined();
    }
  });

  test('rejects mismatched context, unsafe schema and impossible next-account claims', () => {
    for (const patch of [
      { schema_version: 2 },
      { prediction_scope: 'bound_session' },
      { model: 'other-model' },
      { provider: 'claude' },
      { transport: 'http' },
      { next_auth_index: 'missing' },
      { next_auth_index: 'first' },
      { accounts: [rawAccount('second', 1), rawAccount('second', 2)] },
      { accounts: [{ ...rawAccount('second', 1), rank: -1 }] },
    ]) {
      expect(() => normalizeRoutingSnapshot({ ...rawStatus(), ...patch }, query, NOW)).toThrow();
    }
  });

  test('does not turn an existing affinity binding into a frontend selection claim', () => {
    const snapshot = normalizeRoutingSnapshot(rawStatus(), query, NOW);
    expect(snapshot.sessionAffinity).toBe(true);
    expect(snapshot.nextAuthIndex).toBe('second');
    // The contract contains no bound-session identity, and none is inferred.
    expect(snapshot).not.toHaveProperty('activeAuthIndex');
  });
});

describe('routing controls and configuration compatibility', () => {
  test('the normal policy picker includes soonest reset first before it is enabled', () => {
    expect(ROUTING_STRATEGIES).toContain('soonest-reset-first');
    const html = renderToStaticMarkup(
      createElement(PolicyPanel, {
        settings: {
          strategy: 'soonest-reset-first',
          sessionAffinity: true,
          requestRetry: 3,
          maxRetryCredentials: 0,
        },
        onChange: () => {},
      })
    );
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Soonest reset first');
  });

  test('both editors preserve the fork strategy instead of showing round-robin', () => {
    expect(parseRoutingStrategy('soonest-reset-first')).toBe('soonest-reset-first');
    expect(normalizeRoutingStrategy('soonest-reset-first')).toBe('soonest-reset-first');
    expect(normalizeRoutingStrategy(' Soonest-Reset-First ')).toBe('soonest-reset-first');
    expect(readRoutingSettings({ routing: { strategy: 'soonest-reset-first' } }).strategy).toBe(
      'soonest-reset-first'
    );
  });

  test('selecting the custom strategy preserves affinity and credential WebSocket settings', () => {
    const yaml = `routing:
  strategy: fill-first
  session-affinity: true
  session-affinity-ttl: 1h
api-keys:
  codex:
    - websockets: true
`;
    function Harness() {
      const config = useVisualConfig();
      const [phase, setPhase] = useState(0);
      if (phase === 0) {
        config.setVisualValues({ routingStrategy: 'soonest-reset-first' });
        setPhase(1);
        return null;
      }
      return createElement('pre', null, config.applyVisualChangesToYaml(yaml));
    }
    const html = renderToStaticMarkup(createElement(Harness));
    const original = parseYaml(yaml);
    expect(parseYaml(html.slice(5, -6))).toEqual({
      ...original,
      routing: { ...original.routing, strategy: 'soonest-reset-first' },
    });
  });
});
