import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ROUTING_STRATEGIES, type RoutingSettings, type RoutingStrategy } from '@/types/routing';
import styles from '../RoutingPage.module.scss';

const strategyKey = (strategy: RoutingStrategy) => strategy.replace(/-/g, '_');

const RETRY_MAX = 100;
const CREDENTIALS_MAX = 1000;

export interface PolicyPanelProps {
  settings: RoutingSettings;
  disabled?: boolean;
  onChange: (next: RoutingSettings) => void;
}

export function PolicyPanel({ settings, disabled = false, onChange }: PolicyPanelProps) {
  const { t } = useTranslation();
  const id = useId();
  const update = (patch: Partial<RoutingSettings>) => onChange({ ...settings, ...patch });

  const readCount = (value: string, max: number): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(max, Math.max(0, parsed));
  };

  return (
    <aside
      className={styles.policy}
      aria-labelledby={`${id}-title`}
      // The floating save bar lines up with this column (see RoutingSaveBar).
      data-routing-policy-column=""
    >
      <div className={styles.policyHead}>
        <h2 id={`${id}-title`} className={styles.policyTitle}>
          {t('routing.policy_title')}
        </h2>
        <p className={styles.policySubtitle}>{t('routing.policy_subtitle')}</p>
      </div>

      <section className={styles.policySection}>
        <h3 id={`${id}-strategy`} className={styles.policyLabel}>
          {t('routing.strategy_label')}
        </h3>
        <Select
          value={settings.strategy}
          options={ROUTING_STRATEGIES.map((strategy) => ({
            value: strategy,
            label: t(`routing.strategy_${strategyKey(strategy)}`),
          }))}
          disabled={disabled}
          ariaLabelledBy={`${id}-strategy`}
          ariaDescribedBy={`${id}-strategy-desc`}
          onChange={(strategy) => update({ strategy: strategy as RoutingStrategy })}
        />
        <p id={`${id}-strategy-desc`} className={styles.policyHint}>
          {t(`routing.strategy_${strategyKey(settings.strategy)}_desc`)}
        </p>
      </section>

      <section className={styles.policyRow}>
        <div className={styles.policyRowText}>
          <span id={`${id}-affinity`} className={styles.policyRowLabel}>
            {t('routing.affinity_label')}
          </span>
          <span id={`${id}-affinity-desc`} className={styles.policyHint}>
            {t('routing.affinity_desc')}
          </span>
        </div>
        <ToggleSwitch
          checked={settings.sessionAffinity}
          disabled={disabled}
          onChange={(sessionAffinity) => update({ sessionAffinity })}
          ariaLabel={t('routing.affinity_label')}
          ariaDescribedBy={`${id}-affinity-desc`}
        />
      </section>

      <section className={styles.policySection}>
        <h3 className={styles.policyLabel}>{t('routing.retry_label')}</h3>
        <label className={styles.numberField}>
          <span className={styles.policyRowText}>
            <span className={styles.policyRowLabel}>{t('routing.request_retry')}</span>
            <span className={styles.policyHint}>{t('routing.request_retry_desc')}</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={RETRY_MAX}
            step={1}
            value={settings.requestRetry}
            disabled={disabled}
            onChange={(event) => update({ requestRetry: readCount(event.target.value, RETRY_MAX) })}
          />
        </label>
        <label className={styles.numberField}>
          <span className={styles.policyRowText}>
            <span className={styles.policyRowLabel}>{t('routing.max_retry_credentials')}</span>
            <span className={styles.policyHint}>{t('routing.max_retry_credentials_desc')}</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={CREDENTIALS_MAX}
            step={1}
            value={settings.maxRetryCredentials}
            disabled={disabled}
            onChange={(event) =>
              update({ maxRetryCredentials: readCount(event.target.value, CREDENTIALS_MAX) })
            }
          />
        </label>
      </section>
    </aside>
  );
}
