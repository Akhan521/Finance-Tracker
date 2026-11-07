import { execFileSync } from 'node:child_process';

// Vitest globalSetup: read the local stack's connection details once and pass
// them to test files through process.env. Keys are never printed.
export default function setup(): void {
  let out: string;
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(
      'The local Supabase stack is not running. Start it with `npx supabase start`.',
    );
  }

  const vars: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) vars[m[1]] = m[2];
  }

  // Prefer the new-style keys (D30); fall back to the legacy JWT keys only if
  // this CLI version doesn't print them.
  const publishable = vars.PUBLISHABLE_KEY ?? vars.ANON_KEY;
  const secret = vars.SECRET_KEY ?? vars.SERVICE_ROLE_KEY;
  const required = {
    API_URL: vars.API_URL,
    DB_URL: vars.DB_URL,
    MAILPIT_URL: vars.MAILPIT_URL ?? vars.INBUCKET_URL,
    PUBLISHABLE_KEY: publishable,
    SECRET_KEY: secret,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `\`supabase status -o env\` is missing: ${missing.join(', ')}. Is the stack fully started?`,
    );
  }
  for (const [k, v] of Object.entries(required)) process.env[`TEST_${k}`] = v;
}
