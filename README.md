# Claude Testing Kit — Vite + Supabase + Lovable (branch `vite-supabase-lovable`)

> Fork del kit original [fermonterom/claude-testing-kit](https://github.com/fermonterom/claude-testing-kit) adaptado a Vite + React SPA + Supabase (Lovable-friendly).
> Para el kit original de Next.js, ver el branch `main`.

TDD + E2E testing kit para proyectos Vite + React SPA + Supabase, validado en dos instalaciones reales (Team Jerez y Team BCN, 117/117 tests verdes, 2026-04-12).

## Qué hay aquí

- **`.claude/skills/testing-kit-vite-supabase/SKILL.md`** — skill consolidada que Claude Code activa automáticamente. Lee esto primero.
- **`.claude/skills/testing-kit-vite-supabase/references/`** — 8 documentos que amplían cada patrón:
  - `edge-function-contract.md` — 6 casos mínimos por Edge Function
  - `production-guard.md` — blacklist + allowed patterns, no bypasear
  - `supabase-mock-builder.md` — builder reutilizable para tests de hooks
  - `gotchas.md` — 7 gotchas reales (shadcn FormControl, JSON imports, ??/||, etc.)
  - `auth-setup-idempotent.md` — self-heal tras `supabase db reset`
  - `gate-activation.md` — verificación 3-ciclos OK/blocked/restored
  - `cross-platform.md` — dotenv override, LF/CRLF, empty-string leaks
  - `supabase-client-env-override.md` — parametrizar el cliente que Lovable genera
- **`examples/vite-supabase-lovable/`** — ficheros listos para copiar: `production-guard.ts`, `setup.ts`, `supabase-mock.ts`, `auth.setup.ts`, `vitest.config.ts`, `playwright.config.ts`, `testing-kit.config.json`, `send-certificate.test.ts`
- **`PORTABILITY-CHECKLIST.md`** — los 8 pasos para aplicar el kit a un nuevo repo, con checklists

## Qué NO hay

- No hay tests de Next.js — ese kit está en el branch `main` del fork upstream
- No hay instalador automático — la skill y el checklist guían la instalación manual (más predecible en stacks heterogéneos)

## Cómo usar en un nuevo proyecto

1. Clonar este branch del fork en cualquier parte
2. Seguir `PORTABILITY-CHECKLIST.md` paso a paso en el proyecto target
3. Copiar los ficheros de `examples/vite-supabase-lovable/` a las rutas indicadas
4. La skill `testing-kit-vite-supabase` se activa automáticamente al abrir Claude Code en un proyecto con este layout

## Filosofía

> Cobertura no es el objetivo. **Confianza** es el objetivo.

5 principios inviolables:

1. La guardia anti-producción nunca se bypasea
2. 6 casos mínimos por Edge Function, siempre los mismos
3. Un solo builder de mocks de Supabase (nunca ad-hoc)
4. Pre-commit bloquea unit tests; pre-push es reactivo; CI es el gate E2E autoritativo
5. Verificación triple tras tocar test infra: `npm test` + `npm run test:e2e` + self-heal boundary

Todo lo demás vive en las referencias de la skill.

## Origen

Kit validado en:
- **Team Jerez** (`D:/Antigravity/Proyectos/Team Jerez/team-jerez`) — instalación original, 92 unit + E2E
- **Team BCN** (`D:/Antigravity/Proyectos/Team BCN/team-bcn`) — segunda instalación, 108 unit + 3 E2E, pre-commit gate ACTIVO

## Licencia

MIT — ver `LICENSE`.
