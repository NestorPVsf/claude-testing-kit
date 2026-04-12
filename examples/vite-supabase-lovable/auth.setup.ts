/**
 * Playwright global auth setup. Idempotente tras `supabase db reset`:
 * probe → provision si hace falta → login UI → storageState.
 */
import { test as setup, expect } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { assertNotProduction } from '../src/test/production-guard';

// override: true — .env.test debe ganar al shell env
config({ path: resolve(process.cwd(), '.env.test'), override: true });

// Fail closed antes de cualquier fetch
assertNotProduction();

const authFile = 'tests/.auth/user.json';

async function trySupabasePasswordGrant(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function provisionTestUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return;

  const body = await res.text();
  const alreadyExists =
    res.status === 422 || /already\s*registered|user_exists|already\s*exists/i.test(body);
  if (alreadyExists) {
    throw new Error(
      `[testing-kit] Test user ${email} exists but sign-in failed — password drift. ` +
        'Run `supabase db reset` or update TEST_USER_PASSWORD in .env.test.',
    );
  }
  throw new Error(`[testing-kit] Failed to provision test user ${email}: ${res.status} ${body}`);
}

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn('[testing-kit] Missing TEST_USER_EMAIL/PASSWORD in .env.test — skipping.');
    if (!existsSync('tests/.auth')) mkdirSync('tests/.auth', { recursive: true });
    await page.context().storageState({ path: authFile });
    return;
  }

  if (supabaseUrl && anonKey) {
    const probe = await trySupabasePasswordGrant(supabaseUrl, anonKey, email, password);
    const looksLikeInvalidCreds =
      !probe.ok &&
      (probe.status === 400 || probe.status === 401) &&
      /invalid|grant|credentials/i.test(probe.body);

    if (looksLikeInvalidCreds) {
      if (!serviceRoleKey) {
        throw new Error(
          '[testing-kit] Sign-in failed and SUPABASE_SERVICE_ROLE_KEY not set — cannot self-heal.',
        );
      }
      await provisionTestUser(supabaseUrl, serviceRoleKey, email, password);
    } else if (!probe.ok) {
      throw new Error(`[testing-kit] Unexpected Supabase Auth response: ${probe.status} ${probe.body}`);
    }
  }

  await page.goto('/login');
  // data-testid porque shadcn FormControl/Slot rompe getByLabel — ver references/gotchas.md
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit').click();

  await page.waitForURL(/\/dashboard|\/inicio|\/home/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard|\/inicio|\/home/);

  if (!existsSync('tests/.auth')) mkdirSync('tests/.auth', { recursive: true });
  await page.context().storageState({ path: authFile });
});
