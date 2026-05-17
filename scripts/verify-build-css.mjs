// Post-build assertion: design tokens and global reset rules are in dist/assets/*.css. See #218.
// Self-test: temporarily delete `--tal-font` from src/theme/tokens.css and re-run `npm run build`.
// The build must fail with `Missing: --tal-font token definition`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist/assets';
const css = readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

// Regexes anchor on the EXACT selectors we expect, not just substrings:
// a future single-component `box-sizing: border-box` rule must not satisfy
// the universal-selector reset check, and `.somebody{font-family:...}` must
// not satisfy the body check. Vite's minifier collapses `::before` to `:before`
// so the universal-selector pattern tolerates either form.
const required = [
  { name: '--tal-space-4 token definition', re: /--tal-space-4:/ },
  { name: '--tal-ink token definition', re: /--tal-ink:/ },
  { name: '--tal-font token definition', re: /--tal-font:/ },
  { name: 'body font-family rule', re: /(?:^|[},])body\s*\{[^}]*font-family/ },
  {
    name: 'universal-selector box-sizing reset',
    re: /\*\s*,\s*\*::?before\s*,\s*\*::?after\s*\{[^}]*box-sizing:\s*border-box/,
  },
  { name: 'html/body margin reset', re: /html\s*,\s*body\s*\{[^}]*margin/ },
];

const missing = required.filter(({ re }) => !re.test(css));

if (missing.length > 0) {
  console.error('Build CSS verification failed. Missing from dist/assets/*.css:');
  for (const { name } of missing) console.error('  - ' + name);
  console.error('\nProduction would render as unstyled HTML. See #218.');
  process.exit(1);
}

console.log('Build CSS verification passed.');
