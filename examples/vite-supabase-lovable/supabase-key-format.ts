/**
 * Shared validator for Supabase keys consumed by the testing-kit.
 *
 * Two formats are accepted because `supabase status -o env` emits both for
 * backward compatibility and the GoTrue server bundled with the local CLI
 * accepts either:
 *
 *   - **Legacy JWT** — starts with `eyJ`, exactly 3 dot-separated segments,
 *     >100 chars total. Used by every Supabase Cloud project today and by
 *     `supabase start` ANON_KEY / SERVICE_ROLE_KEY env vars.
 *   - **New API keys** — `sb_publishable_<22-char-random>_<8-char-checksum>`
 *     and `sb_secret_<22-char-random>_<8-char-checksum>`. The CLI's
 *     human-readable `supabase status` prints these by default in 2.85+.
 *
 * Self-hosted stacks that disable the new API keys (`SUPABASE_*_KEY` /
 * `JWT_KEYS` not configured) will still fail at the admin endpoint even
 * with a well-formed `sb_*` key. That's out of scope for this validator —
 * it's a server-side configuration concern, not a key-format concern.
 *
 * The validator's purpose is to fail loud on truncated or garbled keys
 * before any fetch happens, since GoTrue's `bad_jwt: invalid number of
 * segments` error points at the fetch and not at the env var.
 */

const SB_KEY_PATTERN = /^sb_(publishable|secret)_[A-Za-z0-9_-]{22,}_[A-Za-z0-9_-]{8,}$/;

export function isValidSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    return SB_KEY_PATTERN.test(key);
  }
  if (key.startsWith('eyJ')) {
    return key.split('.').length === 3 && key.length > 100;
  }
  return false;
}

export function describeKeyFormatProblem(key: string): string {
  if (key.startsWith('eyJ') && key.split('.').length !== 3) {
    return `looks like a truncated JWT (got ${key.split('.').length} segment(s), need 3)`;
  }
  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    return `sb_* key has unexpected shape (expected sb_<type>_<22-char-random>_<8-char-checksum>)`;
  }
  return `unrecognized key format (must start with eyJ for legacy JWT or sb_publishable_/sb_secret_ for new API keys)`;
}
