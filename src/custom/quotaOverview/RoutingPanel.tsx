import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  currentRoutingSnapshot,
  defaultRoutingQuery,
  QUOTA_STRATEGY,
  routingReasonKey,
  type RoutingLoads,
  type RoutingQuery,
  type RoutingTransport,
} from './routing';
import styles from './QuotaOverviewPage.module.scss';

function ContextForm({
  query,
  onChange,
  disabled,
}: {
  query: RoutingQuery;
  onChange: (query: RoutingQuery) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [model, setModel] = useState(query.model);
  const [transport, setTransport] = useState<RoutingTransport>(query.transport);
  return (
    <form
      className={styles.routingContext}
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...query, model: model.trim(), transport });
      }}
    >
      <label>
        {t('pd_overview.routing_model')}
        <input
          value={model}
          maxLength={256}
          disabled={disabled}
          placeholder={t('pd_overview.routing_all_models')}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      <Select
        value={transport}
        disabled={disabled}
        options={[
          { value: 'http', label: 'HTTP' },
          { value: 'websocket', label: 'WebSocket' },
        ]}
        onChange={(value) => setTransport(value as RoutingTransport)}
        ariaLabel={t('pd_overview.routing_transport')}
        size="sm"
      />
      <Button type="submit" size="sm" disabled={disabled}>
        {t('pd_overview.routing_preview')}
      </Button>
    </form>
  );
}

export function RoutingPanel({
  providers,
  contexts,
  loads,
  nowMs,
  disabled,
  saving,
  onContextChange,
  onEnable,
}: {
  providers: string[];
  contexts: Record<string, RoutingQuery>;
  loads: RoutingLoads;
  nowMs: number;
  disabled: boolean;
  saving: boolean;
  onContextChange: (query: RoutingQuery) => void;
  onEnable: () => void;
}) {
  const { t } = useTranslation();
  const snapshots = providers.map((provider) => currentRoutingSnapshot(loads[provider], nowMs));
  const supported = snapshots.some(Boolean);
  const alreadyEnabled = snapshots.some((snapshot) => snapshot?.strategy === QUOTA_STRATEGY);
  return (
    <section className={styles.routingPanel} aria-label={t('pd_overview.routing_title')}>
      <div className={styles.routingHead}>
        <strong>{t('pd_overview.routing_title')}</strong>
        <Button
          size="sm"
          disabled={disabled || !supported || alreadyEnabled}
          loading={saving}
          onClick={onEnable}
        >
          {t('pd_overview.routing_enable')}
        </Button>
      </div>
      <p>{t('pd_overview.routing_scope')}</p>
      <p>{t('pd_overview.routing_fallback_hint')}</p>
      {providers.map((provider) => {
        const load = loads[provider];
        const snapshot = currentRoutingSnapshot(load, nowMs);
        const query = contexts[provider] ?? defaultRoutingQuery(provider);
        const message =
          load?.state === 'unsupported'
            ? 'routing_unsupported'
            : load?.state === 'error'
              ? 'routing_error'
              : load?.state === 'ready' && !snapshot
                ? 'routing_stale'
                : 'routing_loading';
        return (
          <div key={provider} className={styles.routingProvider}>
            <div className={styles.routingHead}>
              <strong>{provider}</strong>
              <span>{snapshot ? snapshot.strategy : t(`pd_overview.${message}`)}</span>
            </div>
            <ContextForm query={query} disabled={disabled} onChange={onContextChange} />
            {snapshot && (
              <div className={styles.routingDetails}>
                <span>
                  {t(
                    snapshot.sessionAffinity
                      ? 'pd_overview.routing_affinity_on'
                      : 'pd_overview.routing_affinity_off'
                  )}
                </span>
                {snapshot.fallbackReason && (
                  <span>{t(routingReasonKey(snapshot.fallbackReason))}</span>
                )}
                {!query.model && <span>{t('pd_overview.routing_model_hint')}</span>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
