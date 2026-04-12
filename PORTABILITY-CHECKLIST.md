# Portability Checklist — Vite + Supabase + Lovable

Pasos para aplicar el testing kit a un nuevo repo. El orden importa: el guard entra primero, los tests después, los gates al final.

## Pre-requisitos

- Proyecto Vite 5+ con React 19 + React Router DOM
- Supabase local funcionando (`supabase start` → `http://127.0.0.1:54321`)
- Node.js 22+ (requerido por el loader ESM de Playwright)
- Git for Windows si aplica (para bash en Husky)

---

## Fase 0 — Dependencias (5 min)

```sh
npm i -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm i -D @playwright/test dotenv
npm i -D husky

npx playwright install chromium
npx husky init
```

Añadir scripts a `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "prepare": "husky"
  }
}
```

## Fase 1 — Guard y config (15 min)

- [ ] Copiar `examples/vite-supabase-lovable/production-guard.ts` → `src/test/production-guard.ts`
- [ ] Copiar `examples/vite-supabase-lovable/setup.ts` → `src/test/setup.ts`
- [ ] Copiar `examples/vite-supabase-lovable/supabase-mock.ts` → `src/test/supabase-mock.ts`
- [ ] Copiar `examples/vite-supabase-lovable/testing-kit.config.json` → `.claude/testing-kit.config.json`
- [ ] **Editar `productionGuard.blacklistedHosts`** con los hosts reales de tu proyecto (tu dominio en prod + tu project-ref de Supabase)
- [ ] Copiar `examples/vite-supabase-lovable/vitest.config.ts` → `vitest.config.ts` (raíz)

## Fase 2 — Parametrizar cliente Supabase (10 min)

- [ ] Abrir `src/integrations/supabase/client.ts`
- [ ] Cambiar los valores hardcoded a `import.meta.env.VITE_SUPABASE_URL ?? "<prod-url>"` + `import.meta.env.VITE_SUPABASE_ANON_KEY ?? "<anon-key>"`
- [ ] Exportar `SUPABASE_URL` para reusarlo en Edge Functions invocadas desde el cliente
- [ ] Ver detalles en `.claude/skills/testing-kit-vite-supabase/references/supabase-client-env-override.md`

## Fase 3 — `.env.test` + `.env.example` (5 min)

Crear `.env.test` (gitignored):

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<tu-anon-key-local>
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key-local>
TEST_USER_EMAIL=test@example.local
TEST_USER_PASSWORD=test1234
```

Añadir a `.env.example` (committeado) la misma lista con valores placeholder.

Añadir a `.gitignore`:

```
.env.test
tests/.auth/
playwright-report/
test-results/
```

## Fase 4 — Playwright + auth.setup (15 min)

- [ ] Copiar `examples/vite-supabase-lovable/playwright.config.ts` → `playwright.config.ts` (raíz)
- [ ] Copiar `examples/vite-supabase-lovable/auth.setup.ts` → `tests/auth.setup.ts`
- [ ] Crear `tests/fixtures/authenticated.ts`:
  ```ts
  import { test as base, expect } from '@playwright/test';
  export const test = base;
  export { expect };
  ```
- [ ] **Ajustar `playwright.config.ts > use.baseURL`** si tu Vite no corre en 8080
- [ ] **Añadir `data-testid` al `<Input>` y botón submit del login** — ver `references/gotchas.md` (shadcn FormControl/Slot)

## Fase 5 — Primer test verde por superficie (30 min)

Objetivo: 1 test por cada superficie, verde, antes de escalar.

- [ ] **Lib**: elegir un `src/lib/*.ts` puro (validador, formateador) y escribir 3-5 tests
- [ ] **Hook**: elegir un hook que lea una tabla con `supabase.from(...)` y escribir 1 happy path con `mockSupabase()`
- [ ] **Edge Function**: elegir una simple y escribir los 6 casos — TDD primero (tests rojos, luego implementación). Ver `references/edge-function-contract.md` + `examples/vite-supabase-lovable/send-certificate.test.ts`
- [ ] **E2E**: 1 spec que navegue a `/dashboard` y verifique que hay un botón/link "logout" visible

Correr `npm test` y `npm run test:e2e`. **Todo debe estar verde antes de la fase 6.**

## Fase 6 — LF/CRLF + Husky skeleton (10 min)

- [ ] Copiar `.gitattributes` a la raíz del proyecto (del root del testing-kit)
- [ ] `git add --renormalize .` + commit
- [ ] Copiar `.husky/pre-commit` y `.husky/pre-push` (sin activar bloqueo todavía — el pre-commit sólo tiene `exit 0` o `npm test` según preferencia)
- [ ] En Windows, verificar que los hooks corren: `git commit --allow-empty -m "test husky"`

## Fase 7 — Activar gate (3-ciclos) (20 min)

**NO activar sin haber demostrado que el gate funciona.** Seguir `references/gate-activation.md`:

- [ ] Cambiar `.husky/pre-commit` a `npm test`
- [ ] Cambiar `.claude/testing-kit.config.json > gates.preCommitBlocking: true` (con `reason` y fecha)
- [ ] Ciclo 1 — OK: commit trivial pasa
- [ ] Ciclo 2 — BLOCKED: romper un test, verificar que no se crea commit, restaurar
- [ ] Ciclo 3 — RESTORED: commit limpio pasa
- [ ] Documentar los 3 SHAs en `GATE-VERIFICATION.md` o en el commit message

Mantener pre-push como no-bloqueante hasta que CI tenga E2E estable.

## Fase 8 — CI (opcional, 30 min)

GitHub Actions, GitLab CI, o lo que uses. Mínimo:

```yaml
- run: npm ci
- run: npm test
- run: supabase start  # para E2E
- run: npm run test:e2e
```

CI es el gate E2E autoritativo. El pre-push local queda para feedback rápido.

---

## Checklist de validación final

Antes de decir "el kit está instalado":

- [ ] `npm test` verde (al menos 5 tests cubriendo lib + hook + edge fn)
- [ ] `npm run test:e2e` verde (al menos 1 E2E con auth)
- [ ] `.env.test` NO committeado
- [ ] `tests/.auth/` en `.gitignore`
- [ ] `production-guard` probado: temporalmente poner un host blacklisteado en `.env.test` → `npm test` debe abortar ruidosamente
- [ ] Pre-commit gate activado y verificado con 3 ciclos (si aplica)
- [ ] `.gitattributes` forzando LF en `.husky/*` y `*.sh`

## Si algo falla

| Síntoma | Mirar |
|---------|-------|
| Tests abortan con "TESTING AGAINST PRODUCTION" | `.env.test` tiene URL mal. Es el comportamiento correcto del guard |
| `getByLabel` timeout en E2E | `references/gotchas.md` §1 — añadir `data-testid` |
| `TypeError: Module needs import attribute of type: json` | `references/gotchas.md` §2 — usar `fs.readFileSync` |
| Playwright loguea contra prod | `references/cross-platform.md` §3/4 — `||` en `webServer.env`, `override: true` en dotenv |
| Husky hooks fallan con `bad interpreter` en Windows | `references/cross-platform.md` §2 — `.gitattributes` con `text eol=lf` |
| Tests E2E fallan tras `supabase db reset` | `references/auth-setup-idempotent.md` — probe + provision |
