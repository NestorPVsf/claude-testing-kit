import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { isValidSupabaseKey, describeKeyFormatProblem } from './src/test/supabase-key-format';

// Load .env.test with override so webServer uses local Supabase, not the prod
// URL that Lovable hardcoded in src/integrations/supabase/client.ts.
loadDotenv({ path: resolve(process.cwd(), '.env.test'), override: true });

// Fail loud if the anon key is missing or malformed — empty/truncated key
// means the dev server boots and Supabase auth returns 401/403 (bad_jwt) on every
// request, which surfaces as confusing test failures far from the root cause.
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) {
  throw new Error(
    '[testing-kit] VITE_SUPABASE_ANON_KEY is empty in .env.test. ' +
      'Playwright webServer would start with an empty key and every request would 401. ' +
      'Fill it in .env.test (see .env.test.example) from `supabase status -o env`.',
  );
}
if (!isValidSupabaseKey(anonKey)) {
  throw new Error(
    `[testing-kit] VITE_SUPABASE_ANON_KEY in .env.test is malformed: ` +
      `${describeKeyFormatProblem(anonKey)} ` +
      `(starts with "${anonKey.slice(0, 3)}", ${anonKey.length} chars). ` +
      'Regenerate from `supabase status -o env`; the human-readable `supabase status` ' +
      'output truncates keys. See .env.test.example.',
  );
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // || (not ??) captures empty string too — ver references/cross-platform.md
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    },
  },
});
