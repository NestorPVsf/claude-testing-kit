# Claude Testing Kit v1.1

Kit de testing y **quality gate** drop-in para proyectos Next.js con [Claude Code](https://claude.ai/code).

Pegale este repo a Claude Code dentro de tu proyecto y el se encarga de todo — sin que tengas que saber programar tests.

---

## Instalacion (una sola linea)

Abre Claude Code **dentro de tu proyecto Next.js** y pega esto:

```
Instala el testing kit desde https://github.com/fermonterom/claude-testing-kit
```

Eso es todo. Claude clona el repo, lee las instrucciones de abajo, y configura todo en tu proyecto.

---

## Instrucciones de instalacion

> Claude Code: si un usuario te pidio instalar este kit, sigue estos pasos en orden.
> Clona el repo a `/tmp/testing-kit` y ejecuta cada paso en el proyecto del usuario.

### Paso 1 — Clonar a temporal

```bash
git clone https://github.com/fermonterom/claude-testing-kit.git /tmp/testing-kit
```

### Paso 2 — Detectar package manager

```bash
if [ -f "pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "yarn.lock" ]; then PM="yarn"
elif [ -f "bun.lockb" ]; then PM="bun"
else PM="npm"; fi
```

Usar `$PM` en todos los comandos siguientes.

### Paso 3 — Detectar estructura del proyecto

```bash
if [ -d "src/app" ]; then APP_DIR="src/app"
elif [ -d "app" ]; then APP_DIR="app"
fi
```

Guardar `$APP_DIR` para configurar Vitest.

### Paso 4 — Copiar archivos .claude/

**Si NO existe `.claude/`** en el proyecto:

```bash
cp -r /tmp/testing-kit/.claude .claude
```

**Si YA existe `.claude/`** — mergear sin sobrescribir:

```bash
mkdir -p .claude/rules .claude/skills .claude/commands
cp -n /tmp/testing-kit/.claude/rules/testing.md .claude/rules/
cp -rn /tmp/testing-kit/.claude/skills/testing-kit .claude/skills/
cp -n /tmp/testing-kit/.claude/commands/check-tests.md .claude/commands/
```

**Si ya existe `.claude/CLAUDE.md`** — agregar al final (verificar que no este ya):

```markdown
## Testing (claude-testing-kit)

- **API routes** (`route.ts`): TDD obligatorio — test ANTES del codigo
- **Paginas** (`page.tsx`): E2E test DESPUES del codigo, ANTES del commit
- **Minimo 6 tests** por endpoint: 200, 401, 400, 404, 500 + uno extra
- **Nunca** commitear codigo sin sus tests
- `/check-tests` — Quality gate: build, env vars, seguridad, tests, lint. Score 0-100 con semaforo. Genera tests faltantes
```

Si NO existe `.claude/CLAUDE.md` → copiar el del kit.

### Paso 5 — Instalar dependencias

```bash
$PM install -D vitest @playwright/test husky  # o "add -D" para pnpm/yarn
npx playwright install chromium
```

### Paso 6 — Agregar scripts a package.json

Agregar **solo los que NO existan**. Si ya existe un script `"test"` con otro runner (jest, mocha), **preguntar al usuario** antes de reemplazarlo:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

### Paso 7 — Crear vitest.config.ts (solo si NO existe)

Adaptar el `include` y `alias` segun la estructura detectada en Paso 3:

- Si `$APP_DIR` es `src/app`: `include: ['src/**/*.test.ts']`, alias `'@' → './src'`
- Si `$APP_DIR` es `app`: `include: ['app/**/*.test.ts']`, alias `'@' → '.'`

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'], // adaptar segun estructura
    clearMocks: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }, // adaptar segun estructura
  },
})
```

### Paso 8 — Crear playwright.config.ts (solo si NO existe)

Adaptar `command` al package manager detectado:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: '$PM run dev', // usar el PM detectado
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
```

### Paso 9 — Configurar Husky

```bash
npx husky init
```

Si `.husky/pre-commit` ya existe, **agregar** `$PM run test` al final sin borrar el contenido existente. Si no existe, copiar del kit.

Si `.husky/pre-push` ya existe, **agregar** el bloque de build + E2E al final. Si no existe, copiar del kit. El pre-push ahora ejecuta `$PM run build` primero (bloquea si falla) y luego E2E condicional.

En ambos hooks, reemplazar `npm` por el PM detectado.

Asegurar permisos de ejecucion:

```bash
chmod +x .husky/pre-commit .husky/pre-push
```

### Paso 10 — Crear estructura y actualizar .gitignore

```bash
mkdir -p tests
```

Agregar al `.gitignore` (si no estan ya):

```
tests/.auth/
test-results/
playwright-report/
.env
.env.local
.env*.local
```

### Paso 11 — Copiar .env.example

```bash
cp -n /tmp/testing-kit/.env.example .env.example
```

Si ya existe `.env.example`, agregar las variables E2E al final si no estan presentes.

### Paso 12 — Limpiar

```bash
rm -rf /tmp/testing-kit
```

### Paso 13 — Confirmar

Informar al usuario:
- Que archivos se crearon/mergearon
- Que puede usar `/check-tests` para escanear y generar tests
- Si el proyecto esta vacio (sin routes ni pages), `/check-tests` reportara "sin archivos" — eso es correcto

---

## Que obtienes despues de instalar

- Cada vez que creas un `route.ts` → Claude escribe los tests **antes** que el codigo (TDD)
- Cada vez que creas un `page.tsx` → Claude escribe el test E2E antes de commitear
- Cada commit ejecuta los unit tests automaticamente (Husky pre-commit)
- Cada push ejecuta `npm run build` primero (bloquea si falla) + E2E tests si el server esta corriendo (Husky pre-push)
- Con `/check-tests` puedes escanear todo el proyecto y generar los tests que falten de golpe

## Como funciona

Tu solo pides lo que necesitas en lenguaje natural. Claude aplica TDD automaticamente.

```
Tu:     "Crea un endpoint POST /api/users"
Claude: 1. Escribe route.test.ts PRIMERO (6 casos minimos)
        2. Ejecuta tests → fallan (RED)
        3. Escribe route.ts → tests pasan (GREEN)
        4. Limpia el codigo (REFACTOR)
```

Para paginas:
```
Tu:     "Crea la pagina de settings"
Claude: 1. Construye page.tsx
        2. Escribe tests/settings.spec.ts (E2E)
        3. Verifica que Playwright pasa
```

## /check-tests — Quality gate completo

Escribe `/check-tests` en Claude Code y obtendras un **score 0-100 con semaforo**:

1. **Build** (30 pts) — Compila sin errores? Detecta TypeScript roto
2. **Env vars** (20 pts) — Tienes todas las variables? Detecta faltantes y placeholders
3. **Seguridad** (15 pts) — API keys expuestas? Endpoints sin auth?
4. **Tests** (25 pts) — Cobertura de unit tests y E2E
5. **Lint** (10 pts) — Calidad del codigo

Despues del score, pregunta si quieres que genere los tests faltantes automaticamente.

```
UNIT TESTS (API routes):
  ✅ src/app/api/posts/route.ts
  ❌ src/app/api/users/route.ts

E2E TESTS (Paginas):
  ✅ src/app/(dashboard)/posts/page.tsx
  ❌ src/app/(dashboard)/settings/page.tsx

RESUMEN: Unit 8/10 (80%) | E2E 3/5 (60%)

Faltan 2 unit tests y 1 E2E test. ¿Los genero? (si/no)
```

## Que hace Husky

- **pre-commit** → ejecuta unit tests. Si fallan, el commit se bloquea.
- **pre-push** → ejecuta `npm run build` primero (bloquea si falla) + E2E tests si el dev server esta corriendo en localhost:3000.

## Que incluye el kit

```
.claude/
  CLAUDE.md                            ← Configuracion base de testing
  rules/
    testing.md                         ← Regla: TDD + E2E + 6 casos minimos
  skills/
    testing-kit/
      SKILL.md                         ← Skill completa (TDD + Vitest + Playwright)
  commands/
    check-tests.md                     ← /check-tests — escanea y genera tests
.husky/
  pre-commit                           ← Bloquea commit si unit tests fallan
  pre-push                             ← Ejecuta E2E si el dev server esta corriendo
examples/
  route.test.example.ts                ← Ejemplo completo de unit test (6 casos)
  page.spec.example.ts                 ← Ejemplo completo de E2E test
.env.example                           ← Variables para E2E con auth
```

## Filosofia

> "Tu no programas tests. Defines las reglas. La IA hace el trabajo."

Este kit nace de un proyecto real con cientos de tests mantenidos al 100% por Claude Code. La clave no es saber escribir tests — es darle a la IA las reglas correctas.

## Requisitos

- [Claude Code](https://claude.ai/code)
- Node.js 18+
- Next.js 14+ (App Router)
- TypeScript
- Estructura de proyecto con `src/app/` o `app/` (no monorepos por ahora)

## Licencia

MIT — Usa, modifica y comparte libremente.

---

Creado por [Fernando Montero](https://fersora.com) — Fersora Solutions

Preguntas, sugerencias o colaboraciones: **info@fersora.com**
