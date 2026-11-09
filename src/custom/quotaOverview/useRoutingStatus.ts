import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { useAuthStore, useQuotaStore } from '@/stores';
import { defaultRoutingQuery, normalizeRoutingSnapshot, type RoutingLoads } from './routing';

/** Reads cached backend decisions. This endpoint never probes providers. */
export function useRoutingStatus(providerKey: string) {
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const generation = useQuotaStore((state) => state.cacheGeneration);
  const apiBase = useAuthStore((state) => state.apiBase);
  const revision = apiClient.getConnectionRevision();
  const queries = useMemo(
    () => providerKey.split(',').filter(Boolean).map(defaultRoutingQuery),
    [providerKey]
  );
  const scope = JSON.stringify([apiBase, revision, generation, queries, connected]);
  const [result, setResult] = useState<{ scope: string; loads: RoutingLoads }>({
    scope: '',
    loads: {},
  });

  useEffect(() => {
    let cancelled = false;
    const client = apiClient.captureConnection();
    let polling = false;
    const isCurrent = () =>
      !cancelled &&
      revision === apiClient.getConnectionRevision() &&
      generation === useQuotaStore.getState().cacheGeneration;
    if (!connected) return;
    const poll = async () => {
      if (polling) return;
      polling = true;
      await Promise.all(
        queries.map(async (query) => {
          try {
            const raw = await client.get('/routing/status', { params: query });
            const snapshot = normalizeRoutingSnapshot(raw, query, Date.now());
            if (isCurrent())
              setResult((previous) => ({
                scope,
                loads: {
                  ...(previous.scope === scope ? previous.loads : {}),
                  [query.provider]: { state: 'ready', snapshot },
                },
              }));
          } catch (error) {
            const status = (error as { status?: unknown })?.status;
            if (isCurrent())
              setResult((previous) => ({
                scope,
                loads: {
                  ...(previous.scope === scope ? previous.loads : {}),
                  [query.provider]: { state: status === 404 ? 'unsupported' : 'error' },
                },
              }));
          }
        })
      );
      polling = false;
    };
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connected, generation, queries, revision, scope]);

  return result.scope === scope ? result.loads : {};
}
