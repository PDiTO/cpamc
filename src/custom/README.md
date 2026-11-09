# Fork customizations (PDiTO)

This fork adds a Quota Overview page and supports the CLIProxyAPI fork's quota-aware routing.
The upstream sync workflow merges and verifies both sets of changes before releasing.

## Rules

- Fork-only code lives in `src/custom/` and `tests/custom*.test.ts`. Upstream never touches
  these paths.
- Page integration touches upstream in two places, one line each plus an import:
  - `src/router/MainRoutes.tsx`: `...customRoutes,` before the catch-all route.
  - `src/components/layout/MainLayout.tsx`: `...customObserveNavItems,` at the top of the
    Observe group.
- The routing contract also needs small upstream changes in `types/visualConfig.ts`,
  `hooks/useVisualConfig.ts`, `services/api/routing.ts`, the network strategy selector,
  `features/routing/components/PolicyPanel.tsx` and routing preview logic. These preserve
  `soonest-reset-first` in both editors and avoid showing round-robin or invented traffic
  shares. Keep these edits narrow when resolving upstream conflicts. The policy is enabled
  only through the capability-gated control in Quota Overview; upstream editors show the
  custom option only when it is already configured.
- Text strings are registered at runtime in `src/custom/i18n.ts` under `pd_overview.*`,
  plus the routing editor's two custom strategy labels. Do not
  edit upstream locale files.
- Reuse upstream data hooks, stores and components by importing them. If an upstream rename
  breaks the build, fix the import here rather than editing upstream code.
- One temporary exception: `tests/authFileCooldowns.test.ts` pins its i18n language and compares
  the reset hint as React escapes it. Upstream's version passes or fails depending on which test
  files ran first. Drop the fork's change once upstream fixes the test; if a merge conflicts
  there, take upstream's version and reapply the fix only if the test still depends on order.

## Pages

- **Quota Overview** (`#/quota-overview`): a pool chart per provider (weekly capacity
  recorded and projected, with burn rate, first and pool empty, and next reset), a ledger of
  credentials in backend routing order with its next new-session choice marked, and
  upstream's cards and quota-window timeline. It shares the quota cache with the official
  Quota Management page, loads unloaded credentials on open and refreshes every 15 minutes
  while visible.
  - Between those refreshes it uses what CLIProxy already knows. CLIProxy reads the
    rate-limit headers of every response it proxies and returns
    the latest set per credential from `GET /credentials` (`quota.signals`);
    `quotaOverview/passiveQuota.ts` parses those. The page re-reads `/credentials`, which
    CLIProxy answers locally, every two minutes while visible. The newer of a live and a
    proxy reading wins.
  - CLIProxy keeps only the latest reading, so `quotaOverview/history.ts` saves each new one
    in `localStorage` (per backend address, three weeks) while the page is open. The
    recorded line has gaps wherever no browser had the page open.
  - The projection drains the pool at the chosen burn rate the way CPA routes: highest
    priority tier first, one credential at a time under `fill-first`, by the soonest weekly
    reset under `soonest-reset-first`, and spread evenly otherwise. Projections simulate new
    unbound traffic using displayed windows. They do not predict the effect of live affinity
    bindings, future quota freshness or model-specific limits.

## Backend routing status

The `PDiTO/CLIProxyAPI` backend exposes authenticated
`GET /v8/management/routing/status?provider=...&model=...&transport=...` with schema version 1.
The page reads its cached status every 30 seconds while visible; the backend independently
refreshes supported OAuth quotas every five minutes, even without an open dashboard. This
read never polls upstream. Codex previews use WebSocket by default, and each provider has a
model/transport preview form. A blank model is provider-wide and omits model-specific limits.

Join the result to credentials by opaque `auth_index`, never filename or email. Backend rank,
eligibility, skipped reasons, selected reset window, observation age and fallback reasons are
shown directly. The next badge means a new session in the selected context; no bound session
is inferred. Status reads use a captured connection and session-generation guards. Failed,
unsupported or expired snapshots show no prediction. Snapshots expire after 90 seconds,
checked on the shared minute clock. Older v8 backends still work and
fall back to priority/name display order without claiming that it is the backend's choice.
Home/plugin authority and non-predictable strategies also suppress local predictions.

The enable button changes only `routing.strategy`. It never changes authentication,
forwarded IP settings or affinity options. Existing usable bindings remain governed by the
backend's configured affinity. Strategy parsing and YAML writes preserve the custom value.

## Sync and release

`.github/workflows/pd-sync-release.yml` runs every six hours, on demand and on pushes to `main`.
It merges `router-for-me/Cli-Proxy-API-Management-Center` `main`, runs `bun run verify`, pushes
the merge and publishes `management.html` as the latest release, tagged
`pd-<upstream version>-<commit>`. A merge conflict, failed check or refused push publishes
nothing and comments on the open "Upstream sync or release failed" issue, naming which of the
three happened.

GitHub doesn't let a workflow's built-in token push changes to `.github/workflows/`, and
upstream edits its own workflows from time to time. The workflow therefore pushes with the
`SYNC_TOKEN` secret when it exists: a fine-grained personal access token for this repository
only, with Contents and Workflows set to read and write. To create or renew it, go to GitHub
Settings, Developer settings, Fine-grained tokens. Then run
`gh secret set SYNC_TOKEN -R PDiTO/cpamc` and paste it at the prompt.
When it expires, the failure issue says so.

Without the token, or to fix anything else by hand, merge locally:

```bash
git fetch upstream && git merge upstream/main && bun run verify && git push origin main
```

CLIProxyAPI serves this build when its config has
`management.panel-github-repository: "https://github.com/PDiTO/cpamc"`.
It checks for a new release every three hours. Pointing that setting back at the upstream
repository restores the official panel.
