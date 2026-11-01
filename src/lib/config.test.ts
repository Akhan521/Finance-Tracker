import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('config throws a clear error when the Supabase URL is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'k');
  await expect(import('./config')).rejects.toThrow(/VITE_SUPABASE_URL/);
});

test('APP_NAME is Bills', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://x');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'k');
  expect((await import('./config')).APP_NAME).toBe('Bills');
});

test('config throws a clear error when the Supabase publishable key is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://x');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
  await expect(import('./config')).rejects.toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
});
