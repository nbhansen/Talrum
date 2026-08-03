// Canary for the layer map (#397). The boundaries/dependencies rule fails
// SILENTLY if import resolution breaks: an unresolved `@/*` import
// reclassifies as an external module, the blanket external allow permits it,
// and the whole layer map no-ops with zero lint errors. This script writes a
// temporary file with three imports that MUST each produce a boundaries
// error and fails the build if any of them lints clean.
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Sweep leftovers from a SIGKILLed run first: eslint does not read
// .gitignore, so a stale canary would fail the next `npm run lint`. The
// random mkdtemp suffix means a leftover is never reused.
for (const stale of globSync('src/ui/boundary-canary-*/')) {
  rmSync(stale, { recursive: true, force: true });
}

// Inside src/ui/ so the file classifies as the `ui` element. No leading dot
// (eslint skips dotfolders); the name must not match the test globs.
const canaryDir = mkdtempSync(join('src/ui', 'boundary-canary-'));
const canary = join(canaryDir, 'canary.ts');

// Line numbers matter: one expected violation per line, asserted below.
const cases = [
  { line: "import '@/lib/supabase';", why: 'alias import of the supabase client' },
  { line: "import '../../lib/supabase';", why: 'relative import of the supabase client' },
  { line: "import '@/app/SessionProvider';", why: 'reverse import of app/' },
];

writeFileSync(canary, cases.map((c) => c.line).join('\n') + '\n');

// try/finally does not unwind on signals; without this, Ctrl-C during the
// eslint call would orphan the canary inside src/ui/.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    rmSync(canaryDir, { recursive: true, force: true });
    process.exit(1);
  });
}

let report;
try {
  let out;
  try {
    out = execFileSync('npx', ['eslint', '--format', 'json', '--no-warn-ignored', canary], {
      encoding: 'utf8',
    });
  } catch (err) {
    // eslint exits non-zero when it finds errors — that is the expected path.
    out = err.stdout;
    if (!out) throw err;
  }
  report = JSON.parse(out);
} finally {
  rmSync(canaryDir, { recursive: true, force: true });
}

const boundaryErrors = (report[0]?.messages ?? []).filter(
  (m) => m.ruleId === 'boundaries/dependencies',
);
const failures = cases.filter((c, i) => !boundaryErrors.some((m) => m.line === i + 1));

if (failures.length > 0) {
  for (const c of failures) {
    console.error(`Boundary canary NOT flagged: ${c.why} (\`${c.line}\`).`);
  }
  console.error(
    'The layer map is not enforcing. Most likely cause: `@/*` resolution broke ' +
      '(tsconfig.app.json paths, eslint-import-resolver-typescript), so local ' +
      'imports classify as external and the blanket external allow permits them. ' +
      'See eslint.config.js (#397).',
  );
  process.exit(1);
}

console.log('Boundary canary verification passed.');
