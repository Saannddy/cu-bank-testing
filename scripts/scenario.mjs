#!/usr/bin/env node
// Run only the scenarios you pick:
//   npm run scenario -- 1 3 5
//   npm run scenario -- 2,6 --headed=false   (other arguments go to Playwright)
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2).flatMap((arg) => arg.split(',')).filter(Boolean);
const isScenario = (arg) => /^s?[1-8]$/i.test(arg);
const picked = [...new Set(args.filter(isScenario).map((arg) => arg.replace(/^s/i, '')))];
const rest = args.filter((arg) => !isScenario(arg));

if (picked.length === 0) {
  console.error('Pick one or more scenarios (1-8), for example:  npm run scenario -- 1 3 5');
  process.exit(1);
}

console.log(`Running scenario ${picked.join(', ')}`);
const result = spawnSync('playwright', ['test', ...picked.map((n) => `scenario-${n}-`), ...rest], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) {
  console.error(`Could not start Playwright: ${result.error.message}. Run "npm install" first.`);
}
process.exit(result.status ?? 1);
