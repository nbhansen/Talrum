// Enforces the comment cap in AGENTS.md §4 (#450). A comment longer than four
// lines is where narration creeps in: LLM agents write the code, then write
// twice as many words about it, and every one of those words can go stale.
import { globSync, readFileSync } from 'node:fs';

const MAX_LINES = 4;

// Returns [{ line, length }] for every comment block over the cap.
export function findLongComments(source) {
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (text.startsWith('//')) {
      let j = i;
      while (j + 1 < lines.length && lines[j + 1].trim().startsWith('//')) j++;
      const length = j - i + 1;
      if (length > MAX_LINES) out.push({ line: i + 1, length });
      i = j;
    } else if (text.startsWith('/*')) {
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) j++;
      // Content lines only: the opening and closing markers carry no prose.
      const length = j - i - 1;
      if (length > MAX_LINES) out.push({ line: i + 1, length });
      i = j;
    }
  }
  return out;
}

const files = globSync('src/**/*.{ts,tsx}');
const failures = files.flatMap((file) =>
  findLongComments(readFileSync(file, 'utf8')).map((f) => `${file}:${f.line} — ${f.length} lines`),
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
