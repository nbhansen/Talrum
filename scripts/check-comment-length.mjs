// Enforces the comment cap in AGENTS.md §4 (#450). A comment longer than four
// lines is where narration creeps in: LLM agents write the code, then write
// twice as many words about it, and every one of those words can go stale.
import { globSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 4;

const SOURCE_GLOBS = [
  '*.{ts,mjs,js}',
  'src/**/*.{ts,tsx}',
  'scripts/**/*.{ts,mjs}',
  'supabase/functions/**/*.ts',
];

// A marker line counts as prose whenever it carries any, so `/* one` and
// `* five */` are not free.
const BARE_OPEN = /^\/\*+$/;
const BARE_CLOSE = /^\*\/$/;

// Returns [{ line, length }] for every comment block over the cap. Only
// comments that start a line are inspected: telling `// x` apart from a `//`
// inside a string needs a lexer, and a false positive on a URL costs more than
// the trailing-comment case is worth. Pinned by tests.
export function findLongComments(source) {
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (text.startsWith('//')) {
      // A blank line ends the run: two comments on adjacent declarations are
      // two comments. That leaves splitting one comment with a blank line as a
      // way under the cap — deliberate evasion, and visible in review.
      let j = i;
      while (j + 1 < lines.length && lines[j + 1].trim().startsWith('//')) j++;
      const length = j - i + 1;
      if (length > MAX_LINES) out.push({ line: i + 1, length });
      i = j;
    } else if (text.startsWith('/*')) {
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) j++;
      const closed = j < lines.length;
      let length = (closed ? j : lines.length - 1) - i + 1;
      if (BARE_OPEN.test(text)) length--;
      if (closed && j > i && BARE_CLOSE.test(lines[j].trim())) length--;
      if (length > MAX_LINES) out.push({ line: i + 1, length });
      i = j;
    }
  }
  return out;
}

// Only run the check when invoked as a script, never when a test imports it.
const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  // Per glob, not on the total: one tree dropping out of enforcement would
  // otherwise stay green behind the others — the silent no-op
  // verify-boundaries.mjs exists to prevent.
  const files = SOURCE_GLOBS.flatMap((g) => {
    const matched = globSync(g);
    if (matched.length === 0) {
      console.error(`check-comment-length: the glob ${g} matched no files.`);
      process.exit(1);
    }
    return matched;
  });
  const failures = files.flatMap((file) =>
    findLongComments(readFileSync(file, 'utf8')).map(
      (f) => `${file}:${f.line} — ${f.length} lines`,
    ),
  );

  if (failures.length > 0) {
    console.error(`Comment blocks over ${MAX_LINES} lines (AGENTS.md §4):\n`);
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      `\n${failures.length} over the cap. Cut them to the why, or move the long form to docs/.`,
    );
    process.exit(1);
  }

  console.log(`No comment block over ${MAX_LINES} lines in ${files.length} files.`);
}
