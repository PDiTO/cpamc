/**
 * Fork branding. The dashboard is called Prox; the backend it manages is still CLI Proxy API,
 * so strings that name the backend (upgrade hints, version labels) keep that name.
 *
 * Brand-name locale keys are overridden here at runtime so upstream locale files stay untouched.
 * Upstream files that hard-code the name or logo import `BRAND_NAME` and `BRAND_ICON` instead.
 */

import i18n from '@/i18n';
import proxIcon from '../../brand/prox-icon.svg';

export const BRAND_NAME = 'Prox';
export const BRAND_HERO_TITLE = 'Welcome to Prox.';
/** App icon: blue and orange lines blending into white on a dark tile. Source: brand/. */
export const BRAND_ICON: string = proxIcon;

const brandOverrides = {
  title: { login: BRAND_NAME, abbr: BRAND_NAME },
  splash: { title: BRAND_NAME, subtitle: 'Dashboard' },
  pd_brand: { sign_in: `Sign in to ${BRAND_NAME}` },
  system_info: { about_title: BRAND_NAME },
};

for (const language of Object.keys(i18n.options.resources ?? {})) {
  i18n.addResourceBundle(language, 'translation', brandOverrides, true, true);
}
