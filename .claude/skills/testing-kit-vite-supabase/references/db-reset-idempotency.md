# DB reset idempotency

**Rule**: every migration must be safe to run against a freshly initialized local database. If `supabase db reset` fails, the testing kit cannot run E2E and the quality gate stalls before the first test.

## Why

Migrations typically run in three environments with very different preconditions:

1. **Production**: applied incrementally on top of accumulated state (existing users, policies, tables).
2. **CI / fresh checkout**: applied sequentially on an empty database.
3. **Local dev via `supabase db reset`**: same as CI but run repeatedly every working day.

A migration that assumes prod-like state — referencing a specific user UUID, a policy created by a previous migration, a table already populated with seed data — works in case 1 but breaks in 2 and 3. The failure mode is identical in both: `supabase start` errors out halfway through, Playwright cannot boot its webServer, and the testing-kit score shows `E2E blocked by upstream blocker`.

Two anti-patterns surface repeatedly: non-idempotent policy creation and FK-violating data-fix INSERTs.

## Anti-pattern 1: `CREATE POLICY` without idempotency guard

Storage buckets created via Supabase Studio UI emit default policies (`"Users can upload own avatar"`, `"Users can view own avatar"`, etc.). Migrations that later reference the same bucket often re-create those policies verbatim:

```sql
-- Breaks on fresh db reset — policy already exists from Storage defaults
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid);
```

On prod (where the policy already exists from earlier state) this errors with `policy already exists` but is usually caught during initial dev. On `supabase db reset`, Storage's default policies re-emerge during initialization, and the migration fails at the same line.

**Fix**: wrap every `CREATE POLICY` in a `DROP POLICY IF EXISTS` sentinel:

```sql
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid);
```

`IF NOT EXISTS` on `CREATE POLICY` is not portable across Postgres versions. `DROP POLICY IF EXISTS` + `CREATE POLICY` is the portable idempotent pattern and preserves intent: "this migration defines the canonical shape of this policy, overwriting any prior version."

**Defensive application**: when you find one policy with this problem, audit all policies on the same table in the same migration and apply the same guard to every one. Policies hunt in packs.

## Anti-pattern 2: `INSERT VALUES` that references non-existent rows by FK

Data-fix migrations often target a specific production user or record by UUID:

```sql
-- Breaks on fresh db reset — user_id references a row that doesn't exist
INSERT INTO aca_subscriptions (user_id, product_id, status, current_period_start, current_period_end)
VALUES (
  '486c4f48-ea4f-4d6f-87e6-505d4797a9c7',
  '3f4a9ca5-4210-405d-9f74-59acb367b4be',
  'active',
  '2026-02-04T12:23:47.883Z',
  '2026-03-04T12:23:47.883Z'
);
```

On prod the referenced user and product both exist. On a fresh db reset neither does, and the `INSERT` fails with a foreign key violation.

**Fix**: rewrite `INSERT VALUES` as `INSERT SELECT` with `WHERE EXISTS` guards for every foreign key:

```sql
INSERT INTO aca_subscriptions (user_id, product_id, status, current_period_start, current_period_end)
SELECT
  '486c4f48-ea4f-4d6f-87e6-505d4797a9c7'::uuid,
  '3f4a9ca5-4210-405d-9f74-59acb367b4be'::uuid,
  'active',
  '2026-02-04T12:23:47.883Z'::timestamptz,
  '2026-03-04T12:23:47.883Z'::timestamptz
WHERE EXISTS (
  SELECT 1 FROM aca_users WHERE id = '486c4f48-ea4f-4d6f-87e6-505d4797a9c7'
)
  AND EXISTS (
  SELECT 1 FROM aca_products WHERE id = '3f4a9ca5-4210-405d-9f74-59acb367b4be'
);
```

On prod: both `EXISTS` checks pass, `SELECT` returns one row, `INSERT` runs as before. On fresh DB: at least one `EXISTS` check fails, `SELECT` returns zero rows, `INSERT` is a no-op. Semantics preserved in the environment that matters, safety added in the environments that didn't work.

Add explicit type casts (`::uuid`, `::timestamptz`) because `SELECT` constant values infer string types by default, which can surprise comparisons downstream.

**When to guard what**:

- `INSERT` with FK columns → guard with `WHERE EXISTS` on each FK target.
- `UPDATE` with a WHERE clause → fresh-safe by nature (UPDATE on zero matching rows is a no-op, not an error).
- `DELETE` → fresh-safe by nature (same reason).
- `INSERT` without FK but with a `UNIQUE` constraint → `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`.
- `CREATE TABLE` / `ALTER TABLE ADD COLUMN` → `IF NOT EXISTS` where supported.

## Auditing an existing migration set

For each migration file, scan for:

```bash
grep -n "CREATE POLICY" supabase/migrations/*.sql
grep -n "INSERT INTO.*VALUES" supabase/migrations/*.sql
```

Each hit is a candidate for the guards above. A migration that passes `supabase start` in CI today but references data created by a migration below it in the chain is still broken — it only works because the chain happens to run in a specific order. Guard them regardless.

## Interaction with `supabase migration repair`

Editing a migration that already ran in prod changes its hash. The next `supabase db pull` or push will detect the mismatch and complain. Repair is a one-line manual step post-merge:

```bash
supabase migration repair 20260111133417 --status applied --linked
```

This tells Supabase "yes, this hash is the current shape of a migration that was already applied" — no re-execution. It's not a workaround; it's the supported mechanism for correcting idempotency after the fact.

## Source

Distilled from two ACA Global install blockers (2026-04-13): `CREATE POLICY` without `IF NOT EXISTS` bricking the storage bucket init, and an `INSERT VALUES` data-fix migration violating FK constraints on fresh DB. Both were edit-in-place fixed with `supabase migration repair` post-merge since neither had any incremental effect on prod.
