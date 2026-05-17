import '@/theme/tokens.css';
import '@/theme/reset.css';

import { describe, expect, it } from 'vitest';

// Belt + braces alongside scripts/verify-build-css.mjs (#218): the build script
// proves tokens land in the CSS bytes; this proves they actually apply to the
// DOM. If either tokens.css or reset.css ever turns back into a CSS module
// (whose side-effect-imported rules can vanish in prod minification), tokens
// stop resolving on `:root` and this test fails fast.
describe('global theme CSS', () => {
  it('defines design tokens on :root', () => {
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--tal-ink').trim()).not.toBe('');
    expect(root.getPropertyValue('--tal-font').trim()).toMatch(/Nunito/i);
    expect(root.getPropertyValue('--tal-space-4').trim()).toBe('16px');
  });

  it('reset.css points body font-family at the --tal-font token', () => {
    // jsdom does not resolve var() — asserting the literal proves reset.css
    // applied; the previous test proves the token cascades to body.
    expect(getComputedStyle(document.body).fontFamily).toBe('var(--tal-font)');
    expect(getComputedStyle(document.body).getPropertyValue('--tal-font').trim()).toMatch(
      /Nunito/i,
    );
  });
});
