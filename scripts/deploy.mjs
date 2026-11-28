// Build, add security headers, check the bundle for secrets, then deploy or preview.
//   node scripts/deploy.mjs          production: needs .env.production.local, deploys a Cloudflare Worker (static assets)
//   node scripts/deploy.mjs --check  the production pipeline with `wrangler deploy --dry-run` (no upload)
//   node scripts/deploy.mjs --local  local only: uses .env.local, serves dist with the headers on :8788
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import {
  ConfigError,
  SECRET_PATTERN,
  generateWranglerConfig,
  assertDeployableGitState,
  assertProductionEnvFile,
  buildWranglerEnv,
  findAutoAnswer,
  parseMode,
  redactOutput,
  renderHeaders,
  validateLocalEnv,
  validateProductionEnv,
} from './deploy-lib.mjs';

const root = process.cwd();
const configDir = join(root, '.wrangler', 'deploy');
const configFile = join(configDir, 'wrangler.jsonc');

// Removes the generated config folder (and a stale one from an earlier run).
function cleanup() {
  rmSync(configDir, { recursive: true, force: true });
}
process.on('exit', cleanup);
const children = new Set();
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM');
    cleanup();
    process.exit(code);
  });
}
cleanup();

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

// stdin is never connected: wrangler can't be answered by anything but its own defaults.
function run(cmd, args, env) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env });
  if (result.status !== 0) fail(`${cmd} ${args[0] ?? ''} failed.`);
}

// Async so the signal handlers above can run while wrangler is up (spawnSync would block them).
function runAsync(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env });
    children.add(child);
    child.on('close', (code) => {
      children.delete(child);
      resolve(code);
    });
  });
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

let mode;
let config;
try {
  ({ mode } = parseMode(process.argv.slice(2)));
  if (mode === 'local') {
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

// An allowlisted environment for every child: wrangler must not see anything that
// makes it think an AI agent is driving it (it would silently register a subdomain).
const env = buildWranglerEnv(process.env, {
  VITE_SUPABASE_URL: config.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
});

run('npm', ['run', 'build'], env);

const template = readFileSync(join(root, '_headers.template'), 'utf8');
writeFileSync(join(root, 'dist', '_headers'), renderHeaders(template, config.supabaseUrl));

checkBundle();

// The Worker config is generated into a git-ignored folder and removed afterwards,
// so the Worker name never lingers on disk.
const workerName = mode === 'local' ? 'bills-local' : config.workerName;
mkdirSync(configDir, { recursive: true });
writeFileSync(configFile, generateWranglerConfig(workerName, join(root, 'dist')), { mode: 0o600 });

// Runs wrangler with stdin disconnected, streaming its output with values redacted
// while also collecting it. Resolves to { code, output } (output is already redacted).
function runCaptured(args) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env });
    children.add(child);
    let output = '';
    const pending = { out: '', err: '' };
    const emit = (key, stream, chunk, final) => {
      pending[key] += chunk;
      const lines = pending[key].split('\n');
      pending[key] = final ? '' : lines.pop();
      for (const line of final ? lines.filter((l, i) => l !== '' || i < lines.length - 1) : lines) {
        const clean = redactOutput(line, [workerName, root, homedir()]);
        output += `${clean}\n`;
        stream.write(`${clean}\n`);
      }
    };
    child.stdout.on('data', (d) => emit('out', process.stdout, d.toString(), false));
    child.stderr.on('data', (d) => emit('err', process.stderr, d.toString(), false));
    child.on('close', (code) => {
      children.delete(child);
      emit('out', process.stdout, '', true);
      emit('err', process.stderr, '', true);
      resolve({ code, output });
    });
  });
}

// Wrangler answers its own prompts when stdin is not a TTY, so refuse if one appeared.
const AUTO_ANSWER_MESSAGE =
  'wrangler auto-confirmed a prompt. Nothing more was run if this was the dry run. Check the Cloudflare account and the deployment manually.';


// fail() calls process.exit, which runs the exit handler (cleanup).
try {
  if (mode === 'local') {
    console.log('deploy: serving dist locally with the security headers (no Cloudflare account needed).');
    const code = await runAsync('npx', ['wrangler', 'dev', '--config', configFile, '--port', '8788']);
    if (code !== 0 && code !== null) fail('wrangler dev failed.');
  } else {
    console.log('deploy: dry run first, nothing is uploaded.');
    const dry = await runCaptured(['deploy', '--dry-run', '--strict', '--config', configFile]);
    if (dry.code !== 0) fail('wrangler dry run failed.');
    if (findAutoAnswer(dry.output)) fail(AUTO_ANSWER_MESSAGE);
    if (mode === 'production') {
      console.log('deploy: dry run was clean, deploying.');
      const real = await runCaptured(['deploy', '--strict', '--config', configFile]);
      if (findAutoAnswer(real.output)) {
        fail('LOUD WARNING: wrangler auto-confirmed a prompt during the real deploy. Check the Cloudflare account and the deployment manually.');
      }
      if (real.code !== 0) fail('wrangler deploy failed.');
    }
  }
} finally {
  cleanup();
}
