# Changelog

## [vite-supabase-lovable] — 2026-04-13 (update 2)

### Added

- **`examples/vite-supabase-lovable/supabase-key-format.ts`** — shared validator exportando `isValidSupabaseKey` + `describeKeyFormatProblem`. Acepta JWT legacy (3 segmentos, prefix `eyJ`, >100 chars) y nuevas API keys (`sb_publishable_*` / `sb_secret_*` con pattern estricto). Regex: `^sb_(publishable|secret)_[A-Za-z0-9_-]{22,}_[A-Za-z0-9_-]{8,}$`.
- **`examples/vite-supabase-lovable/.env.test.example`** — template explícito con instrucciones sobre usar `supabase status -o env` (no el output humano que trunca).
- **`references/db-reset-idempotency.md`** — patrón `DROP POLICY IF EXISTS` + `INSERT SELECT WHERE EXISTS` para migrations fresh-safe. Derivado de los blockers #1 y #2 de ACA Global.
- **gotcha #8** en `references/gotchas.md` — `bad_jwt: invalid number of segments` por keys truncadas en `.env.test`. Causa raíz: copy-paste del output humano de `supabase status` (recorta para display) en vez de `supabase status -o env`.

### Changed

- **`examples/vite-supabase-lovable/playwright.config.ts`** — añadido import de `supabase-key-format` y validación early de `VITE_SUPABASE_ANON_KEY` con mensaje accionable que incluye prefix y longitud del valor malformado.
- **`examples/vite-supabase-lovable/auth.setup.ts`** — helper `assertValidKey(name, value)` que centraliza validation. `SUPABASE_SERVICE_ROLE_KEY` se valida diferida dentro del branch self-heal (no antes), evita falsos positivos cuando login feliz no necesita service role.

### Origen

Cuarta instalación real del kit (ACA Global Academy PR #3, 2026-04-13). Codex + Gemini convergieron en el review, ambos aprobaron después del refactor del commit 3. Causa raíz sorprendente: no era incompatibilidad `sb_*` vs JWT (el server local acepta ambos), era key truncada por copy-paste — `.env.test` tenía 1 segmento en vez de 3 porque el dev copió del output humano.

---

## [vite-supabase-lovable] — 2026-04-13 (update)

### Added

- **`references/failloud-test-env.md`** — patrón fail-loud en configuration boundaries de test infra (production-guard, playwright.config, auth.setup). Derivado del code review de ACA Global post-install.

### Changed

- **`examples/vite-supabase-lovable/production-guard.ts`** — `assertNotProduction()` ahora valida también `import.meta.env.VITE_SUPABASE_URL` (Layer 2). Cierra el gap donde `.env.test` ausente en CI dejaba pasar tests con fallback a la URL prod hardcoded de `client.ts`.
- **`examples/vite-supabase-lovable/playwright.config.ts`** — throw a module-load si `VITE_SUPABASE_ANON_KEY` está vacía. Evita que el dev server arranque con key `''` y todos los requests devuelvan 401 (error confuso tres capas alejado del root cause).
- **`examples/vite-supabase-lovable/auth.setup.ts`** — fail-fast con throw si faltan `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`. Antes hacía `console.warn` + storageState vacío → specs corrían auth-less y fallaban confusamente. Ahora error explícito al inicio.

### Origen

Tercera instalación real del kit (ACA Global Academy, 2026-04-13). Code review post-install surfaced tres silent-default footguns con un patrón común: en cualquier boundary entre test runner y Supabase client, un default silencioso deja pasar producción. Fix original en ACA commit `bfbb7c8`; portado aquí como versión canónica del kit.

---

## [vite-supabase-lovable] — 2026-04-13

Branch dedicado al stack Vite 5 + React 19 + React Router DOM + Supabase (Lovable-friendly). Los entries anteriores corresponden al kit original de Next.js.

### Added

- **Skill consolidada** `testing-kit-vite-supabase` en `.claude/skills/testing-kit-vite-supabase/` con SKILL.md + 8 referencias: edge-function-contract, production-guard, supabase-mock-builder, gotchas, auth-setup-idempotent, gate-activation, cross-platform, supabase-client-env-override.
- **Ejemplos drop-in** en `examples/vite-supabase-lovable/`: production-guard.ts, setup.ts, supabase-mock.ts, auth.setup.ts, vitest.config.ts, playwright.config.ts (con `||` fix), testing-kit.config.json, send-certificate.test.ts (6-casos + 2 bonus).
- **PORTABILITY-CHECKLIST.md** — 8 fases ordenadas para aplicar el kit a un nuevo repo.
- **.gitattributes** — fuerza LF en `*.sh` y `.husky/*` para Windows.
- **Husky hooks reescritos**: `pre-commit` = `npm test`; `pre-push` = gate reactivo no-bloqueante con curl probes.

### Changed

- **README.md** reescrito: documenta layout Vite+Supabase, referencias, PORTABILITY-CHECKLIST.

### Removed

- Contenido específico Next.js: `.claude/commands/check-tests.md`, `.claude/rules/testing.md`, `.claude/skills/testing-kit/`, `examples/page.spec.example.ts`, `examples/route.test.example.ts`, `docs/claude-testing-kit.html`.

### Lecciones de las dos instalaciones

- **Team Jerez (2026-04-12)**: refactor de auth.setup.ts pasaba 92 unit tests pero rompía Playwright por loader ESM diferente. Solución: `fs.readFileSync` + `JSON.parse`.
- **Team BCN (2026-04-12)**: dev server heredaba URL de producción porque `VITE_SUPABASE_URL=""` pasaba por `??` sin caer al fallback. Solución: `||` en `webServer.env`.
- Verificación triple tras tocar test infra: `npm test` + `npm run test:e2e` + self-heal boundary.

---

## [1.1.1] — 2026-04-07

### Fixed

- **Lint fallback**: `next lint` falla en Next.js 16.2.1 con "Invalid project directory". Ahora check-tests documenta la cadena de fallback explicita: `next lint` → `eslint` → skip

## [1.1.0] — 2026-04-07

Quality gate completo integrado en `/check-tests`. Basado en feedback de Angel Aparicio y su skill quality-gate para la comunidad Vive Coders.

### Added

- **Score 0-100 con semaforo** — `/check-tests` ahora da un score visual con veredicto (verde/amarillo/naranja/rojo) y acciones concretas para subir la puntuacion
- **Validacion de build** (30 pts) — ejecuta `npm run build` y traduce errores de TypeScript a lenguaje claro
- **Deteccion de env vars** (20 pts) — escanea `process.env.*` y `import.meta.env.*` en el codigo, verifica contra `.env.local`/`.env`, detecta placeholders y prefijos `NEXT_PUBLIC_` incorrectos
- **Security check** (15 pts) — detecta API keys hardcodeadas (Stripe, JWT, Supabase service role), endpoints sin auth, y service role keys en frontend
- **Lint check** (10 pts) — ejecuta `next lint` o `eslint` como fase adicional
- **Build en pre-push** — el hook `.husky/pre-push` ahora ejecuta `npm run build` antes de los E2E tests; bloquea el push si el build falla
- **Regla de seguridad** en `testing.md` — nunca hardcodear secrets, verificar auth en endpoints, validar prefijos NEXT_PUBLIC_

### Changed

- `/check-tests` pasa de 8 a 11 pasos (scan + 5 fases de quality gate + generacion + reporte final con delta de score)
- El reporte final muestra el score antes y despues de generar tests, con el delta de puntos
- Problemas de build/env/seguridad se reportan con acciones concretas pero NO se auto-arreglan
- Rule `testing.md` ahora activa tambien para `.test.tsx`, `.spec.tsx`, `vitest.config.*`, `playwright.config.*`
- Lista de endpoints publicos ampliada y unificada en los 3 archivos (check-tests, SKILL.md, testing.md)
- Mock patterns para Prisma anadidos al SKILL.md (ademas de Supabase)
- Nota sobre auth providers alternativos (Clerk, Auth0, NextAuth) en auth.setup.ts
- Playwright config del README incluye proyecto `setup` con auth (coherente con SKILL.md)

### Fixed

- **pre-push hook**: `npm run build 2>&1 | tail -5` con `$?` capturaba el exit code de `tail` (siempre 0), no el de build. Reescrito con `if ! npm run build`
- **pre-push hook**: E2E tests no bloqueaban push si fallaban. Anadido `|| exit 1`
- **grep portability**: Patrones `\w\+` (GNU-only) reemplazados por ERE `-roEh` con `[A-Za-z_][A-Za-z0-9_]*` para compatibilidad macOS
- **grep exclusions**: Anadido `--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist` a todos los greps
- **Security grep**: Reescrito en ERE para compatibilidad BSD, excluye archivos de test
- **.gitignore**: Anadido `.env` y `.env*.local` (antes solo `.env.local`)
- **README Paso 10**: Instrucciones de gitignore actualizadas con `.env`

### Credits

- Sugerencias de [Ángel Aparicio](https://github.com/angelapaia) y su skill quality-gate para Vive Coders
- Inspirado en el Cafe Camaleonico del 6 de abril de 2026

## [1.0.0] — 2026-04-06

Release inicial.

### Added

- Skill `testing-kit` con TDD + Vitest patterns + Playwright E2E
- Comando `/check-tests` para escanear cobertura y generar tests faltantes
- Rule `testing.md` con activacion contextual por paths
- Git hooks: pre-commit (unit tests) + pre-push (E2E condicional)
- Ejemplos: `route.test.example.ts` (6 casos) + `page.spec.example.ts` (4 tests)
- Instalacion automatica via README con instrucciones para Claude
- Soporte para npm/pnpm/yarn/bun
- Deteccion automatica de estructura `src/app/` o `app/`
