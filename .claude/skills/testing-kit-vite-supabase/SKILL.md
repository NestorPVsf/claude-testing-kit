---
name: testing-kit-vite-supabase
description: TDD + E2E testing kit for Vite + React SPA + Supabase projects (including Lovable-generated codebases). Enforces the 6-cases-per-edge-function contract, a non-bypassable production-URL guard, the supabase-mock-builder pattern, and cross-platform gates. Use when setting up tests on a fresh Vite+Supabase repo, porting tests to a sibling project, hardening a Lovable export for production, or adding coverage to an existing project that lacks a testing story.
---

# Testing Kit — Vite + React SPA + Supabase (Lovable-friendly)

> Origen: Team Jerez (skill canónica) → Team BCN (segunda instalación validada, 117/117 tests).
> Este kit asume Vite 5+, React 19, React Router DOM, Supabase (self-hosted o cloud),
> Vitest + React Testing Library + jsdom para unit, Playwright para E2E, Husky para gates.

## Cuándo usar

- Empezar tests en un repo Lovable/Vite+Supabase que todavía no tiene suite
- Portar la suite a un proyecto hermano (p.ej. academias multi-tenant que comparten stack)
- Añadir cobertura de Edge Functions con TDD siguiendo el contrato 6-casos
- Endurecer un proyecto tras un incidente de escritura en producción

No usar en: Next.js (usa el kit main), proyectos sin Supabase, proyectos con Jest en vez de Vitest.

## Filosofía (no negociable)

1. **La guardia anti-producción es inviolable.** `src/test/production-guard.ts` aborta el proceso si la URL apunta a host blacklisteado o no matchea allowed patterns. Se llama antes de cualquier fetch, tanto desde Vitest como desde Playwright. Si hace falta un host nuevo → editar `.claude/testing-kit.config.json > productionGuard.allowedHosts`, nunca el setup.ts.
2. **6 casos mínimos por Edge Function.** 200 / 401 / 400 / 404 / 500 / custom. Ver [references/edge-function-contract.md](references/edge-function-contract.md).
3. **Un solo builder de mocks.** `mockSupabase()` cubre from/select/eq/single + auth.getUser + functions.invoke. No mockear ad-hoc.
4. **Pre-commit bloquea unit tests.** Pre-push es warning reactivo. CI es el gate autoritativo de E2E.
5. **Verificación triple tras cambios en test infra:** `npm test` + `npm run test:e2e` + self-heal boundary. Aprendido porque un refactor pasaba unit tests pero rompía Playwright por loader ESM diferente.

## Arquitectura de la suite

```
src/
  test/
    setup.ts                  # Vitest entry — cleanup + production-guard
    production-guard.ts       # Pura, reutilizable desde Vitest y Playwright
    supabase-mock.ts          # Builder chainable compartido
  lib/*.test.ts               # Tests puros (sin jsdom, sin mocks)
  hooks/*.test.tsx            # React Testing Library + renderHook + mockSupabase
tests/
  auth.setup.ts               # Playwright setup idempotente (probe → provision → login)
  fixtures/authenticated.ts   # Fixture que hereda storageState
  *.spec.ts                   # E2E Playwright
supabase/
  functions/<name>/index.test.ts   # 6 casos mínimos por función
.claude/
  testing-kit.config.json     # Fuente única de hosts, gates, contratos
.husky/
  pre-commit                  # Bloqueante: npm test
  pre-push                    # Reactivo no-bloqueante: E2E solo si entorno local arriba
.gitattributes                # LF para scripts .sh en checkouts Windows
.env.example / .env.test      # Variables de test con dotenv override
```

## Las 3 superficies de test (más E2E)

### 1. Libs puras — `src/lib/*.test.ts`
Sin mocks, sin jsdom. Directo input → output.

### 2. Hooks con TanStack Query — `src/hooks/*.test.tsx`
`renderHook` + `mockSupabase()`. Ejemplo en [examples/useCourses.test.tsx](../../../examples/vite-supabase-lovable/useCourses.test.tsx).

### 3. Edge Functions — `supabase/functions/<name>/index.test.ts`
**TDD obligatorio. 6 casos.** Ver contrato completo en [references/edge-function-contract.md](references/edge-function-contract.md) y ejemplo canónico `send-certificate` en [examples/send-certificate.test.ts](../../../examples/vite-supabase-lovable/send-certificate.test.ts).

### 4. E2E Playwright — `tests/*.spec.ts`
Usan `storageState` de `tests/.auth/user.json` escrito una vez por `auth.setup.ts`. Nunca login por test.

## Comandos

```bash
npm run test              # Vitest run único
npm run test:watch        # Watch mode
npm run test:e2e          # Playwright
npm run test:e2e:ui       # Playwright UI debug
```

## Claves del kit (cada una con ampliación en references/)

| Patrón | Archivo en references |
|--------|----------------------|
| Contrato 6-casos Edge Functions | [edge-function-contract.md](references/edge-function-contract.md) |
| Production guard + blacklist/allowlist | [production-guard.md](references/production-guard.md) |
| Supabase mock builder | [supabase-mock-builder.md](references/supabase-mock-builder.md) |
| shadcn FormControl/Slot gotcha | [gotchas.md](references/gotchas.md) |
| auth.setup idempotente (self-heal) | [auth-setup-idempotent.md](references/auth-setup-idempotent.md) |
| Gate activation (3-ciclos OK/blocked/restored) | [gate-activation.md](references/gate-activation.md) |
| dotenv override, LF/CRLF, env leak empty-string | [cross-platform.md](references/cross-platform.md) |
| Parametrización cliente Supabase env override | [supabase-client-env-override.md](references/supabase-client-env-override.md) |

## Portabilidad a un nuevo repo

Ver [PORTABILITY-CHECKLIST.md](../../../PORTABILITY-CHECKLIST.md) para el flujo completo paso a paso.

## Qué NO mockear

- `react-router-dom` → usar `<MemoryRouter>` en wrapper
- `@tanstack/react-query` → `new QueryClient({ defaultOptions: { queries: { retry: false } } })`
- Fechas globales → `vi.useFakeTimers()` scoped
- `console.error` — arreglar la warning, no silenciarla

## Qué SIEMPRE mockear

- `@/integrations/supabase/client` vía `mockSupabase()`
- `fetch` a APIs externas (N8N, OpenAI) vía `vi.spyOn(globalThis, 'fetch')`
- Env vars que varían por test → `vi.stubEnv('KEY', 'value')`

## Reglas de oro

1. Un test = una assertion principal
2. Arrange / Act / Assert separados con blank lines
3. Sin lógica en tests (no `for`, no `if`)
4. Los tests se leen, no se escriben — 10 segundos de lectura máximo
5. Fail-first (TDD) es obligatorio en Edge Functions, recomendado en el resto

## Lecciones de las dos instalaciones

- **Team Jerez (2026-04-12)**: refactor de `auth.setup.ts` pasaba 92 unit tests pero rompía E2E por `TypeError: Module needs import attribute of type: json`. Solución: `fs.readFileSync` + `JSON.parse` en `production-guard.ts`, evita el loader ESM de Playwright. Documentado como regla de verificación triple.
- **Team BCN (2026-04-12)**: el dev server lanzado por Playwright heredaba la URL de `.env` (producción) porque `VITE_SUPABASE_URL=""` pasaba por `??` sin activar el fallback. Solución: `webServer.env` en `playwright.config.ts` con `||` en vez de `??`. Ver [cross-platform.md](references/cross-platform.md).
