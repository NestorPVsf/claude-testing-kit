# Fail-loud on missing test env

**Rule**: at every configuration boundary between the test runner and the Supabase client, throw loud on missing or empty env. Never default, never warn-and-continue.

## Why

Silent defaults in test infra are the worst class of bug. They let production URLs, empty keys, or missing credentials through without raising a flag, and the failure surfaces far from the root cause — a 401 in an unrelated spec, an assertion against prod data, a storageState that passes auth but can't actually sign in.

The kit exists to prevent tests from hitting production. Any code path that silently defaults to a fallback defeats the entire point.

## Three enforcement points

### 1. `production-guard.ts::assertNotProduction()` — two layers

Checking only `process.env.VITE_SUPABASE_URL` is insufficient under Vitest. Vite/Vitest inject `import.meta.env.VITE_SUPABASE_URL` statically via `define()` from `loadEnv()`. If `.env.test` is missing, `loadEnv()` returns `{}` and the injected value is `""`. At runtime, `client.ts` resolves `"" || 'hardcoded-prod.supabase.co'` and the guard lets it through because `process.env` still has the local URL.

Mitigation — two layers:

```ts
// Layer 1 — process.env (Node, Vitest, Playwright)
const rawUrl = process.env?.VITE_SUPABASE_URL || '';
if (!rawUrl) throw new Error('VITE_SUPABASE_URL is not set...');

// Layer 2 — import.meta.env (only populated in Vite/Vitest)
const importMetaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
if (importMetaEnv && importMetaEnv.VITE_SUPABASE_URL === '') {
  throw new Error('import.meta.env.VITE_SUPABASE_URL is empty. Create .env.test...');
}
```

Layer 2 is guarded by `importMetaEnv &&` because Playwright/Node don't populate `import.meta.env`. Only fail when the property exists and is empty — distinguishes "Vitest didn't load a test env" from "we're not in a Vite context."

### 2. `playwright.config.ts` — fail at module load, not at first request

`playwright.config.ts` loads before `webServer.command` runs. Validate the anon key there so the dev server never boots with `''`:

```ts
loadDotenv({ path: resolve(process.cwd(), '.env.test'), override: true });

if (!process.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_ANON_KEY is empty in .env.test...');
}
```

Without this, the dev server starts with `VITE_SUPABASE_ANON_KEY: ''`, every request returns 401, and the failure surfaces as "login test timed out" — three layers away from the actual problem.

### 3. `auth.setup.ts` — throw, don't warn

Previous version logged `console.warn` and saved an empty `storageState` when `TEST_USER_EMAIL` was missing. Subsequent specs then ran auth-less and failed in confusing ways inside the dashboard route.

Replace the warn-and-skip path with a throw:

```ts
if (!email || !password) {
  throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.test...');
}
```

## The pattern, abstracted

Every env var the kit depends on has a **configuration boundary** (where it's read) and a **usage boundary** (where it's consumed). Silent defaults between these two is where bugs hide.

Rule: if a test-infra config loads an env var and the value can be empty or missing, throw immediately at the configuration boundary with a message that names the var, the file, and the remediation.

Bad:

```ts
const url = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
```

Good:

```ts
const url = process.env.VITE_SUPABASE_URL;
if (!url) throw new Error('VITE_SUPABASE_URL is not set. Run `supabase start` and populate .env.test.');
```

## When silent defaults ARE acceptable

Inside the `webServer.env` block of `playwright.config.ts`, fallback to `http://127.0.0.1:54321` for the URL is fine — but only because the module-level throw above already guaranteed the key is present. If you remove the module-level throw, the fallback silently enables the bug.

## Source

Derived from the ACA Global code review (2026-04-13). Three silent-default footguns surfaced post-install; all shared one pattern. Fix landed in ACA commit `bfbb7c8`, ported here as the canonical version for future installs.
