// Build, add security headers, check the bundle for secrets, then deploy or preview.
//   node scripts/deploy.mjs          production: needs .env.production.local, deploys to Cloudflare Pages
//   node scripts/deploy.mjs --local  local only: uses .env.local, serves dist with the headers on :8788
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import {
  ConfigError,
  SECRET_PATTERN,
  assertDeployableGitState,
  assertProductionEnvFile,
  parseMode,
  renderHeaders,
  validateLocalEnv,
  validateProductionEnv,
} from './deploy-lib.mjs';

const root = process.cwd();

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env });
  if (result.status !== 0) fail(`${cmd} ${args[0] ?? ''} failed.`);
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// Same pattern as CI. Prints file names only, never the matched text.
function checkBundle() {
  const re = new RegExp(SECRET_PATTERN);
  const hits = listFiles(join(root, 'dist')).filter((f) => re.test(readFileSync(f, 'latin1')));
  if (hits.length > 0) {
    fail(`secret-looking text found in the build output (${hits.map((f) => f.slice(root.length + 1)).join(', ')}). Aborting.`);
  }
}

let local;
let config;
try {
  ({ local } = parseMode(process.argv.slice(2)));
  if (local) {
    // .env.local (shell values also count); both are validated.
    config = validateLocalEnv(loadEnv('development', root, ''));
  } else {
    // Production reads ONLY .env.production.local, never the merged env.
    const file = join(root, '.env.production.local');
    assertProductionEnvFile(existsSync(file));
    config = validateProductionEnv(parseEnv(readFileSync(file, 'utf8')));
    const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const status = git(['status', '--porcelain']);
    if (branch.status !== 0 || status.status !== 0) throw new ConfigError('Could not read the git state.');
    assertDeployableGitState(branch.stdout.trim(), status.stdout);
  }
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: config.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  WRANGLER_SEND_METRICS: 'false',
};

run('npm', ['run', 'build'], env);

const template = readFileSync(join(root, '_headers.template'), 'utf8');
writeFileSync(join(root, 'dist', '_headers'), renderHeaders(template, config.supabaseUrl));

checkBundle();

if (local) {
  console.log('deploy: serving dist locally with the security headers (no Cloudflare account needed).');
  run('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', '8788'], env);
} else {
  run('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', config.pagesProject, '--branch', 'main'], env);
}
