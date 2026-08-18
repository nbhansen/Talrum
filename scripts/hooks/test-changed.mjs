// Claude Code Stop hook: run the tests related to uncommitted src/ or scripts/ changes.
// Silent on success; exit 2 sends the failures back to the agent.
import { spawnSync } from 'node:child_process';

const quietNpm = { ...process.env, npm_config_loglevel: 'error' };

const input = JSON.parse(await readStdin());
if (input.stop_hook_active) process.exit(0);

const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src', 'scripts'], {
  encoding: 'utf8',
});
if (dirty.stdout.trim() === '') process.exit(0);

const result = spawnSync(
  'npx',
  ['--no-install', 'vitest', 'run', '--changed', '--passWithNoTests', '--reporter=dot'],
  { encoding: 'utf8', env: quietNpm },
);
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
