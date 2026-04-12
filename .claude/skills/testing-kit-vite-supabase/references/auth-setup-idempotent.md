# auth.setup.ts idempotente (self-heal tras db reset)

## Problema

Playwright `auth.setup.ts` loguea al usuario test con email/password y guarda `storageState` en `tests/.auth/user.json`. Pero si el dev acaba de ejecutar `supabase db reset`, `auth.users` está vacío y el login falla con "invalid credentials". Sin auto-healing, el dev tiene que crear el usuario a mano cada vez.

## Patrón

Antes de intentar el login por UI, hacer un probe HTTP contra `POST /auth/v1/token?grant_type=password`. Si devuelve un error que parece "invalid credentials" (400/401 + body matchea `/invalid|grant|credentials/`), provisionar el usuario vía `POST /auth/v1/admin/users` con el service role key (que auto-confirma email en local). Después intentar el login por UI.

## Flujo

```
1. dotenv.config({ path: '.env.test', override: true })
2. assertNotProduction()  ← el guard
3. probe password grant
   ├── ok → login UI → storageState
   ├── invalid creds → provision admin → login UI → storageState
   └── error desconocido → abort loud
```

## Implementación de referencia

Ver `examples/vite-supabase-lovable/auth.setup.ts` para la versión completa.

Puntos clave:

```ts
// 1. .env.test con override: true (no lo ganes al shell)
config({ path: resolve(process.cwd(), '.env.test'), override: true });

// 2. guard antes de cualquier fetch
assertNotProduction();

// 3. probe
const probe = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: anonKey },
  body: JSON.stringify({ email, password }),
});

// 4. detectar "invalid credentials" (no solo !ok — puede ser 500 network)
const looksLikeInvalidCreds =
  !probe.ok && (probe.status === 400 || probe.status === 401) &&
  /invalid|grant|credentials/i.test(await probe.text());

// 5. self-heal
if (looksLikeInvalidCreds) {
  await provisionTestUser(supabaseUrl, serviceRoleKey, email, password);
}

// 6. login UI
await page.goto('/login');
await page.getByTestId('login-email-input').fill(email);
await page.getByTestId('login-password-input').fill(password);
await page.getByTestId('login-submit').click();
await page.waitForURL(/\/dashboard|\/inicio|\/home/, { timeout: 15_000 });
await page.context().storageState({ path: 'tests/.auth/user.json' });
```

## Detalle crítico: distinguir `already exists` de `drift`

`POST /auth/v1/admin/users` puede devolver 422 "already registered". Si el probe anterior falló con invalid creds **y** admin dice "already exists", no es una db reset — es **drift de password** entre `.env.test` y lo que está en la DB. En ese caso no provisiones silenciosamente: lanza error claro que le diga al dev que corra `supabase db reset` o actualice `.env.test`.

```ts
const alreadyExists = res.status === 422 ||
  /already\s*registered|user_exists|already\s*exists/i.test(body);
if (alreadyExists) {
  throw new Error(
    `Test user ${email} already exists but sign-in failed — password drift between .env.test and local Supabase. ` +
    `Either run \`supabase db reset\` or update TEST_USER_PASSWORD in .env.test.`
  );
}
```

## Cuándo SKIP en vez de fallar

Si `.env.test` no tiene `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` → escribir storageState vacío y salir. Los tests E2E que requieren auth fallarán con mensaje propio, pero los unit tests siguen corriendo. Esto permite que el kit se instale antes de tener credenciales.

## Verificación (obligatoria tras tocar auth.setup)

Ver "Verificación triple" en `SKILL.md`:
1. `npm test` (unit)
2. `npm run test:e2e` (runtime Playwright — puede descubrir bugs de loader ESM)
3. **Self-heal boundary test**: borrar el user via admin API y re-correr E2E. Si no se auto-cura, el fix no está completo.

Solo cuando las 3 son verdes el cambio está listo.
