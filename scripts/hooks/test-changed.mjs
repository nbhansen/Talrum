// Claude Code Stop hook: run the tests related to uncommitted src/ or scripts/ changes.
// Silent on success; exit 2 sends the failures back to the agent.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const input = JSON.parse(await readStdin());
if (input.stop_hook_active) process.exit(0);

const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src', 'scripts'], {
  encoding: 'utf8',
});
if (dirty.stdout.trim() === '') process.exit(0);

const bin = 'node_modules/.bin/vitest';
if (!existsSync(bin)) {
  process.stderr.write(`${bin} is missing - run npm install; related tests were not run.\n`);
  process.exit(2);
}
const result = spawnSync(bin, ['run', '--changed', '--passWithNoTests', '--reporter=dot'], {
  encoding: 'utf8',
});
if (result.status === 0) process.exit(0);
process.stderr.write(`vitest --changed failed:\n${result.stdout}${result.stderr}`);
process.exit(2);

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => done(data));
  });
}
