// Claude Code PostToolUse hook (Edit|Write): eslint/stylelint the edited
// file. Silent on success; exit 2 sends the failure back to the agent.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = relative(resolve('.'), resolve(filePath));
if (rel.startsWith('..')) process.exit(0);

let cmd;
if (/\.(ts|tsx)$/.test(rel)) cmd = ['eslint', '--max-warnings', '0', '--no-warn-ignored', rel];
else if (/\.module\.css$/.test(rel)) cmd = ['stylelint', rel];
else process.exit(0);

const [tool, ...args] = cmd;
const bin = `node_modules/.bin/${tool}`;
if (!existsSync(bin)) {
  process.stderr.write(`${bin} is missing - run npm install; ${rel} was not linted.\n`);
  process.exit(2);
}
const result = spawnSync(bin, args, { encoding: 'utf8' });
if (result.status === 0) process.exit(0);
process.stderr.write(`${tool} failed for ${rel}:\n${result.stdout}${result.stderr}`);
process.exit(2);
