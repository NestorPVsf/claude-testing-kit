# Gotchas conocidos

Problemas reales que consumieron tiempo en Team Jerez y Team BCN. Leer antes de toparse con ellos.

## 1. shadcn FormControl + Slot hace `getByLabel` invisible

**Síntoma**: tests E2E Playwright con `page.getByLabel(/email/i)` hacen timeout silencioso aunque el `<Label for="email">` y el `<Input id="email">` parecen bien conectados.

**Causa**: shadcn `<FormControl>` usa Radix `<Slot>`. Slot pasa el `id` generado al **primer hijo**. Si hay un wrapper `<div className="relative">` (típico para poner un icono dentro del input), el `id` acaba en el div, no en el `<Input>`, y Playwright no puede resolver la asociación `for`/`aria-labelledby`.

**Fix**: añadir `data-testid` explícito al `<Input>` cuando hay wrapper de icono, y usar `page.getByTestId(...)` en los E2E:

```tsx
<FormControl>
  <div className="relative">
    <Mail className="absolute ..." />
    <Input data-testid="login-email-input" {...field} />
  </div>
</FormControl>
```

```ts
await page.getByTestId('login-email-input').fill(email);
```

## 2. JSON imports entre Vitest y Playwright

**Síntoma**: unit tests verdes, Playwright falla con `TypeError: Module needs import attribute of type: json`.

**Causa**: Playwright usa el loader ESM nativo de Node 22 que exige la sintaxis `import cfg from './x.json' with { type: 'json' };`. Vitest usa otro loader que acepta el import clásico. Si usas un solo módulo compartido entre ambos runners y ese módulo importa JSON, romperá en uno de los dos.

**Fix**: leer el JSON con `fs.readFileSync` + `JSON.parse`. Misma sintaxis funciona en los dos. Ver `production-guard.md`.

## 3. `auth.setup.ts` no es idempotente tras `supabase db reset`

**Síntoma**: después de `supabase db reset` el login E2E falla con "invalid credentials" y no se auto-recupera — hay que crear el usuario a mano.

**Fix**: patrón probe → provision → login. Ver `auth-setup-idempotent.md`.

## 4. `dotenv.config()` sin `{ override: true }` deja pasar env de producción

**Síntoma**: tienes `.env.test` bien configurado con `VITE_SUPABASE_URL=http://127.0.0.1:54321`, pero tu shell tiene `VITE_SUPABASE_URL=https://prod.supabase.co` exportado, y los tests van contra prod (protegidos por el guard, pero no deberían ni acercarse).

**Causa**: por defecto, `dotenv.config()` **no sobreescribe** variables ya presentes en `process.env`. Si tu shell las tiene, ganan.

**Fix**: siempre `dotenv.config({ path: ..., override: true })` en archivos de test infra. El guard es belt + suspenders, pero override: true es la primera línea de defensa.

## 5. `??` vs `||` con empty-string en `webServer.env`

**Síntoma**: Playwright arranca el dev server, pero el navegador dispara fetch a `/rest/v1/...` relativos al propio dev server en vez de a Supabase local, porque Vite inyectó `VITE_SUPABASE_URL=""`.

**Causa**: `process.env.VITE_SUPABASE_URL` era `""` (no undefined). En código del cliente, `import.meta.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321"` devuelve `""`, porque `??` solo cae al default con nullish (null/undefined), no con empty string.

**Fix**: en `playwright.config.ts > webServer.env` usar `||`, que también captura `""`:

```ts
webServer: {
  // ...
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
  },
},
```

El `|| ''` de anon key es intencional — si falta, el guard abortará el arranque con mensaje claro, mejor que un `undefined` silencioso.

## 6. Scripts `.sh` con CRLF en Windows (Husky)

**Síntoma**: en Windows, git clona `.husky/pre-commit` con line endings CRLF, y bash lo ejecuta con error críptico tipo `bad interpreter: No such file or directory`.

**Fix**: `.gitattributes` en la raíz:

```
*.sh text eol=lf
.husky/* text eol=lf
```

Forzar LF en el checkout de scripts. El resto del repo mantiene autocrlf normal. Ver `cross-platform.md`.

## 8. `bad_jwt: invalid number of segments` en `provisionTestUser`

**Síntoma**: `auth.setup.ts` falla con
```
403 {"code":403,"error_code":"bad_jwt","msg":"invalid JWT: ... token contains an invalid number of segments"}
```
en la primera llamada a `POST /auth/v1/admin/users`.

**Causa**: `.env.test` tiene la `SUPABASE_SERVICE_ROLE_KEY` (o `VITE_SUPABASE_ANON_KEY`) **truncada**. Casi siempre por copy-paste del output humano de `supabase status` (que recorta las keys para display) en vez de `supabase status -o env`. Un JWT válido tiene 3 segmentos separados por `.`; el truncado tiene 1 ó 2.

**Cómo confirmar sin imprimir secrets**:
```bash
awk -F= '$1=="SUPABASE_SERVICE_ROLE_KEY" {
  v=$2; gsub(/^"|"$/,"",v); dots=gsub(/\./,".",v);
  printf "dots=%d len=%d\n", dots, length(v)
}' .env.test
# Esperado: dots=2, len>100 (JWT) o prefix sb_*
```

**Fix**: regenerar `.env.test` desde `supabase status -o env`. El kit incluye `assertValidKey()` en `auth.setup.ts` que detecta esto antes del fetch y lanza un mensaje accionable. No silenciar; el error apunta a la causa raíz (env malformada), no al endpoint.

**Por qué no se reproduce siempre**: la CLI ~2.85+ emite `Publishable sb_publishable_*` y `Secret sb_secret_*` en el output humano, pero `-o env` sigue emitiendo ANON_KEY/SERVICE_ROLE_KEY como JWT legacy. Si el dev copia del output humano cree estar pegando un JWT y obtiene basura.

## 7. `import.meta.env` vacío en tests de hooks

**Síntoma**: un hook lee `import.meta.env.VITE_SUPABASE_URL` para algo, y en tests unit devuelve undefined.

**Causa**: Vitest no inyecta `import.meta.env.VITE_*` automáticamente desde `.env.test`.

**Fix**: en `vitest.config.ts` usar `loadEnv` + `define`:

```ts
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode === 'test' ? 'test' : mode, process.cwd(), '');
  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
    // ...
  };
});
```

Nota: `loadEnv` se importa de `'vite'`, no de `'vitest/config'`.
