import { describe, expect, test } from 'bun:test';
import i18n from '@/i18n';
import { BRAND_ICON, BRAND_NAME } from '@/custom/brand';

describe('Prox branding', () => {
  test('replaces the product name in every language', () => {
    for (const language of Object.keys(i18n.options.resources ?? {})) {
      const t = i18n.getFixedT(language);
      expect(t('title.login')).toBe(BRAND_NAME);
      expect(t('title.abbr')).toBe(BRAND_NAME);
      expect(t('splash.title')).toBe(BRAND_NAME);
      expect(t('system_info.about_title')).toBe(BRAND_NAME);
      expect(t('splash.subtitle')).toBe('Dashboard');
      expect(t('pd_brand.sign_in')).toBe('Sign in to Prox');
    }
  });

  test('keeps the backend name where a string refers to CLI Proxy API', () => {
    expect(i18n.getFixedT('en')('footer.api_version')).toBe('CLI Proxy API Version');
  });

  test('page title uses the brand', async () => {
    expect(await Bun.file('index.html').text()).toContain(`<title>${BRAND_NAME}</title>`);
  });

  test('the login and splash screens use the Prox palette', async () => {
    const palette = await Bun.file('src/pages/login/_palette.scss').text();
    expect(palette).toContain('--login-dot-color-end: #f2783a;');
    expect(palette).toContain('--login-loader-bar: linear-gradient(90deg, #4d8dff, #f2783a);');
    const hero = await Bun.file('src/pages/login/DotMatrixHero.tsx').text();
    expect(hero).toContain("getPropertyValue('--login-dot-color-end')");
  });

  test('every brand logo spot uses the Prox icon instead of the upstream JPEG', async () => {
    expect(BRAND_ICON).toContain('prox-icon');
    const files = [
      'src/main.tsx',
      'src/components/layout/MainLayout.tsx',
      'src/pages/LoginPage.tsx',
      'src/pages/SystemPage.tsx',
    ];
    for (const file of files) {
      const source = await Bun.file(file).text();
      expect(source).toContain('BRAND_ICON');
      expect(source).not.toContain('INLINE_LOGO_JPEG');
    }
  });
});
