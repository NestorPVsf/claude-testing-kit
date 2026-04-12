/**
 * Production guard — pure function, no framework deps.
 *
 * Reusable from both Vitest (via src/test/setup.ts) and Playwright
 * (via tests/auth.setup.ts). Source of truth for allowed/blacklisted
 * hosts is .claude/testing-kit.config.json > productionGuard.
 *
 * NEVER bypass. If you need a new host, add it to the config.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ALLOWED_HOST_PATTERNS: RegExp[] = [
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
  /^host\.docker\.internal(:\d+)?$/,
  /\.staging\.supabase\.co$/,
];

// Read config via fs (not JSON import) so this module works under both
// Vitest's loader and Playwright's native ESM loader.
function loadBlacklistedHosts(): string[] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(here, '..', '..', '.claude', 'testing-kit.config.json');
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      productionGuard?: { blacklistedHosts?: string[] };
    };
    return parsed?.productionGuard?.blacklistedHosts ?? [];
  } catch {
    return [];
  }
}

const BLACKLISTED_HOSTS: string[] = loadBlacklistedHosts();

export function assertNotProduction(): void {
  const rawUrl =
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
    '';

  if (!rawUrl) {
    throw new Error(
      '[testing-kit] VITE_SUPABASE_URL is not set. Did you run `supabase start` and create .env.test?',
    );
  }

  let hostname: string;
  try {
    hostname = new URL(rawUrl).host;
  } catch {
    throw new Error(`[testing-kit] VITE_SUPABASE_URL is not a valid URL: ${rawUrl}`);
  }

  for (const bad of BLACKLISTED_HOSTS) {
    if (hostname === bad || hostname.endsWith('.' + bad)) {
      throw new Error(
        `\n\n⛔ TESTING AGAINST PRODUCTION IS FORBIDDEN ⛔\n` +
          `VITE_SUPABASE_URL resolves to "${hostname}" which is in the blacklist.\n` +
          `Configured blacklist: ${BLACKLISTED_HOSTS.join(', ')}\n\n` +
          `Run \`supabase start\` and point VITE_SUPABASE_URL to http://127.0.0.1:54321 before running tests.\n`,
      );
    }
  }

  const isAllowed = ALLOWED_HOST_PATTERNS.some((rx) => rx.test(hostname));
  if (!isAllowed) {
    throw new Error(
      `\n\n⛔ TESTING AGAINST UNKNOWN HOST IS FORBIDDEN ⛔\n` +
        `VITE_SUPABASE_URL resolves to "${hostname}" which does not match any allowed pattern.\n` +
        `Allowed: localhost, 127.0.0.1, host.docker.internal, *.staging.supabase.co.\n\n` +
        `Add legitimate staging hosts to .claude/testing-kit.config.json under productionGuard.\n`,
    );
  }
}
