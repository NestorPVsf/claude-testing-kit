# /check-tests — Verificar cobertura, seguridad y deploy-readiness

Escanea el proyecto, valida build, env vars, seguridad, tests, y da un score 0-100 con semaforo.

## Paso 1: Detectar estructura del proyecto

Antes de buscar archivos, detectar donde esta la carpeta `app/`:

```bash
# Detectar ruta base
if [ -d "src/app" ]; then
  APP_DIR="src/app"
elif [ -d "app" ]; then
  APP_DIR="app"
else
  echo "ERROR: No se encontro carpeta app/ ni src/app/"
  exit 1
fi
```

Usar `$APP_DIR` en todos los comandos siguientes.

## Paso 2: Validar build (30 puntos)

Ejecutar `npm run build` (o el PM del proyecto). Esto captura errores de TypeScript, imports rotos y problemas de sintaxis — las razones mas comunes de deploys fallidos.

- Build pasa → 30/30
- Build falla → 0/30 (blocker)

Si falla, traducir los errores a lenguaje claro. En vez de mostrar la salida cruda del compilador, decir cosas como: "Error de TypeScript en src/app/page.tsx linea 42 — estas tratando un numero como string."

Si el script `build` no existe en `package.json`, omitir este paso y asignar 30/30 con nota: "No hay script de build configurado".

## Paso 3: Escanear variables de entorno (20 puntos)

Las env vars faltantes son la causa #1 de deploys rotos — el proyecto funciona local pero se rompe en Vercel.

### 3.1 Buscar todas las referencias

```bash
# Buscar process.env.* e import.meta.env.* en archivos TS/TSX/JS (excluyendo node_modules, .next, dist)
grep -roEh 'process\.env\.[A-Za-z_][A-Za-z0-9_]*' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist . 2>/dev/null | sort -u
grep -roEh 'import\.meta\.env\.[A-Za-z_][A-Za-z0-9_]*' --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null | sort -u
```

Excluir de la busqueda:
- `node_modules/`, `.next/`, `dist/`, `build/`
- Archivos de config (vitest.config.ts, playwright.config.ts, next.config.*)
- Variables estandar de Node/Next que no necesitan `.env`: `NODE_ENV`, `CI`, `VERCEL`, `NEXT_RUNTIME`, `ANALYZE`

### 3.2 Verificar contra .env

Buscar archivos de env en este orden: `.env.local`, `.env`, `.env.development`.

Para cada variable encontrada en el codigo, verificar si tiene un valor definido (no vacio) en alguno de los archivos `.env*`.

### 3.3 Verificar prefijos de Next.js

Si el proyecto es Next.js:
- Variables usadas en componentes de cliente (`'use client'`, archivos en `components/`) deben tener prefijo `NEXT_PUBLIC_`
- Variables sin `NEXT_PUBLIC_` NO deben usarse en codigo del cliente (serian `undefined` en el navegador)

### 3.4 Clasificar resultados

Agrupar en 3 categorias:
- **Definida**: la variable existe en `.env*` con un valor real
- **Faltante**: la variable se referencia en el codigo pero NO existe en ningun `.env*`
- **Placeholder**: la variable existe pero tiene un valor de ejemplo (`your-key-here`, `xxx`, `TODO`, `changeme`, cadena vacia)

### 3.5 Puntuacion

- Todas las vars definidas → 20/20
- Vars faltantes → restar proporcionalmente (cada var faltante resta puntos)
- Placeholders → restar la mitad que una faltante (son menos criticos)
- Si no hay variables de entorno en el proyecto → 20/20

## Paso 4: Security check (15 puntos)

Buscar problemas de seguridad comunes que podrian exponer datos o permitir acceso no autorizado.

### 4.1 API keys hardcodeadas

Buscar en archivos `.ts`, `.tsx`, `.js` (excluyendo `.env*`, `node_modules`):

```bash
# Strings largos que parecen tokens/keys (32+ chars alfanumericos)
grep -rEnl '["][A-Za-z0-9_-]{32,}["]' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude='*.test.ts' --exclude='*.test.tsx' . 2>/dev/null
```

Excluir falsos positivos: UUIDs en tests, hashes en configs conocidos, IDs de ejemplo.

Verificar especificamente:
- `sk_live_`, `sk_test_` (Stripe)
- `eyJ` (JWT tokens hardcodeados)
- `supabase_service_role` o service role key en archivos del frontend
- `SUPABASE_SERVICE_ROLE_KEY` usado en archivos con `'use client'`

### 4.2 Endpoints sin auth

Para cada `route.ts` en `$APP_DIR/api/`:
- Leer el archivo y verificar si importa algun modulo de auth (`getUser`, `auth`, `getSession`, `createClient` de supabase, middleware de auth, etc.)
- Si un endpoint NO tiene ninguna referencia a auth, marcarlo como "sin proteccion"
- Excluir endpoints que logicamente son publicos: `auth/callback`, `webhook`, `health`, `cron`, `revalidate`, `og`, `login`, `register`, `signup`, `verify`, `reset-password`, `stripe/webhook`

### 4.3 Puntuacion

- Sin problemas de seguridad → 15/15
- API key hardcodeada encontrada → 0/15 (blocker)
- Service role key en frontend → 0/15 (blocker)
- Endpoints sin auth (no publicos) → restar 3 puntos por cada uno (minimo 0)

## Paso 5: Escanear cobertura de tests (25 puntos)

### 5.1 Escanear API routes

```bash
# Encontrar todos los route.ts (excluyendo archivos de test)
find $APP_DIR/api -name "route.ts" -not -name "*.test.ts" 2>/dev/null | sort

# Encontrar los que ya tienen test
find $APP_DIR/api -name "route.test.ts" 2>/dev/null | sort
```

Para cada `route.ts` que NO tenga un `route.test.ts` adyacente, marcarlo como pendiente.

Si `$APP_DIR/api` no existe → reportar "No se encontraron API routes" y pasar a paginas.

### 5.2 Escanear paginas

```bash
# Encontrar todas las page.tsx
find $APP_DIR -name "page.tsx" | sort

# Encontrar los spec.ts en tests/
find tests -name "*.spec.ts" 2>/dev/null | sort
```

Si `tests/` no existe → reportar "Carpeta tests/ no existe. Se creara al generar E2E tests."

Para cada `page.tsx` que NO tenga un `.spec.ts` correspondiente en `tests/`, marcarlo como pendiente.

### Convencion de nombres para specs

El nombre del `.spec.ts` se construye asi:

1. Quitar `$APP_DIR/` del path
2. Quitar route groups (carpetas entre parentesis como `(dashboard)`)
3. Quitar `/page.tsx`
4. Reemplazar `/` con `-`
5. Caso especial: si es el root `page.tsx` → `home`

Ejemplos:
- `src/app/(dashboard)/posts/page.tsx` → `tests/posts.spec.ts`
- `src/app/(dashboard)/settings/profile/page.tsx` → `tests/settings-profile.spec.ts`
- `src/app/(auth)/login/page.tsx` → `tests/login.spec.ts`
- `src/app/page.tsx` → `tests/home.spec.ts`

### Paginas que NO necesitan E2E

Omitir y reportar como "excluidas":
- `layout.tsx` (no son paginas)
- `error.tsx`, `not-found.tsx`, `loading.tsx` (paginas del sistema)
- Paginas que solo hacen `redirect()` sin UI

### 5.3 Puntuacion

- 100% de cobertura (unit + E2E) → 25/25
- Cobertura parcial → proporcional (ej: 80% cobertura → 20/25)
- Sin tests pero existen archivos → 5/25
- Sin archivos que testear → 25/25

## Paso 6: Lint (10 puntos)

Ejecutar `npx next lint` (o `npx eslint .` si no es Next.js).

- Sin errores → 10/10
- Solo warnings → 8/10
- Errores → restar proporcionalmente
- No hay linter configurado → 10/10 con nota: "No hay linter configurado"

Si el comando falla porque no esta instalado, omitir y dar 10/10.

## Paso 7: Mostrar reporte con score

Sumar los puntos de las 5 fases y mostrar el reporte con semaforo:

```
================================================================
  CHECK-TESTS — Reporte de calidad
================================================================

  Score: XX/100  [SEMAFORO]

  Build .............. XX/30  [estado]
  Env vars ........... XX/20  [estado]
  Seguridad .......... XX/15  [estado]
  Tests .............. XX/25  [estado]
  Lint ............... XX/10  [estado]

================================================================

  UNIT TESTS (API routes):
  ────────────────────────────────────────
  Con test:
    ✅ src/app/api/posts/route.ts
    ✅ src/app/api/auth/callback/route.ts

  Sin test:
    ❌ src/app/api/health/route.ts
    ❌ src/app/api/users/route.ts

  E2E TESTS (Paginas):
  ────────────────────────────────────────
  Con test:
    ✅ src/app/(dashboard)/posts/page.tsx → tests/posts.spec.ts

  Sin test:
    ❌ src/app/(dashboard)/settings/page.tsx

  Excluidas:
    ⊘ src/app/not-found.tsx — pagina del sistema

  ENV VARS:
  ────────────────────────────────────────
  Definidas:
    ✅ NEXT_PUBLIC_SUPABASE_URL
    ✅ SUPABASE_SERVICE_ROLE_KEY

  Faltantes:
    ❌ STRIPE_SECRET_KEY — usado en src/app/api/billing/route.ts
    ❌ RESEND_API_KEY — usado en src/lib/email.ts

  Placeholders:
    ⚠️  NEXT_PUBLIC_SITE_URL = "your-url-here"

  SEGURIDAD:
  ────────────────────────────────────────
  ✅ Sin API keys hardcodeadas
  ❌ src/app/api/users/route.ts — endpoint sin auth
  ⚠️  src/app/api/data/route.ts — sin validacion de input

  VEREDICTO: [mensaje segun score]

================================================================
```

### Semaforos

- **90-100** 🟢 "Listo para produccion. Puedes subir sin miedo."
- **75-89** 🟡 "Funciona pero tiene cosas que mejorar. Revisa los avisos."
- **50-74** 🟠 "Riesgoso. Arregla lo rojo antes de subir."
- **0-49** 🔴 "NO subas esto. Hay problemas criticos."

### Acciones concretas

Despues del reporte, listar cada problema con: impacto en puntos, que esta mal, y la accion exacta para arreglarlo:

```
ACCIONES PARA SUBIR EL SCORE:

1. ❌ [+15 pts] Build roto: Error de TypeScript en src/app/page.tsx linea 42
   → Cambia `const data: string = fetchData()` a `const data = await fetchData()`

2. ❌ [+5 pts] Falta STRIPE_SECRET_KEY en .env.local
   → Anade: STRIPE_SECRET_KEY=sk_test_... (obtenla de tu dashboard de Stripe)

3. ⚠️ [+3 pts] src/app/api/users/route.ts no tiene auth
   → Anade verificacion de usuario al inicio del handler
```

## Paso 8: Preguntar al usuario

Si hay archivos sin test, preguntar:

```
Faltan X unit tests y Y E2E tests.
¿Los genero? (si/no)
```

Si el usuario dice NO → terminar aqui.
Si el usuario dice SI → continuar con Paso 9.

Los problemas de build, env vars, seguridad y lint NO se auto-arreglan — solo se reportan con acciones concretas para que el usuario (o Claude en otra conversacion) los resuelva.

## Paso 9: Generar unit tests (primero)

Para CADA `route.ts` sin test, en orden:

1. **Leer completo** el `route.ts`. Identificar:
   - Metodos HTTP exportados (GET, POST, PUT, DELETE) — generar describe() por cada uno
   - Validaciones (zod, manual, etc.)
   - Tablas/servicios que usa
   - Estructura de respuestas
   - Codigos de error especificos (409 Conflict, 403 Forbidden, etc.)
   - Si requiere autenticacion o es publico
2. **Crear** `route.test.ts` adyacente con 6 casos minimos POR CADA metodo HTTP:
   - 200/201: Happy path
   - 401: Sin autenticacion (si aplica; si es publico, documentar: `// SKIP 401 — public endpoint`)
   - 400: Input invalido
   - 404: Recurso no encontrado
   - 500: Error de base de datos/servicio
   - Extra: caso especifico del endpoint (ej: 409 duplicado)
3. **Ejecutar** `npm run test` para verificar
4. **Si falla** → leer el error, corregir el test, volver a ejecutar
5. **Siguiente** endpoint

Usar la skill `testing-kit` como referencia para los patrones de mock y la estructura del test.

## Paso 10: Generar E2E tests (despues)

Solo empezar cuando TODOS los unit tests esten pasando.

### Verificar que el dev server esta corriendo

```bash
curl -s --max-time 2 http://localhost:3000 > /dev/null 2>&1
```

Si NO esta corriendo → avisar al usuario:
```
⚠️  El dev server no esta corriendo en localhost:3000
    Levantalo en otra terminal: npm run dev
    Cuando este listo, dime "continua" para generar los E2E tests.
```

PARAR y esperar al usuario. NO intentar ejecutar Playwright sin server.

### Generar tests

Crear carpeta `tests/` si no existe: `mkdir -p tests`

Para CADA `page.tsx` sin spec, en orden:

1. **Leer completo** el `page.tsx`. Identificar:
   - Elementos visibles (headings, botones, listas, tablas)
   - Si requiere autenticacion
   - Interacciones del usuario (clicks, formularios)
   - A que ruta URL corresponde
2. **Crear** `tests/nombre.spec.ts` (usando la convencion de nombres del Paso 5) con tests para:
   - La pagina carga y muestra el contenido principal
   - Elementos clave son visibles
   - Interacciones basicas funcionan
   - Redirige a login sin autenticacion (si aplica)
3. **Ejecutar** `npm run test:e2e` para verificar
4. **Si falla** → leer el error, corregir el test, volver a ejecutar
5. **Siguiente** pagina

Usar la skill `testing-kit` como referencia para selectores y assertions de Playwright.

## Paso 11: Reporte final

Volver a ejecutar las 5 fases para calcular el nuevo score y mostrar el delta:

```
================================================================
  CHECK-TESTS — Generacion completada
================================================================

  Score: XX/100 → YY/100  [SEMAFORO]  (+ZZ puntos)

  UNIT TESTS generados:
    ✅ src/app/api/health/route.test.ts (6 tests — GET)
    ✅ src/app/api/users/route.test.ts (12 tests — GET, POST)

  E2E TESTS generados:
    ✅ tests/settings.spec.ts (4 tests)

  RESULTADO:
    Unit:  15/15 endpoints con test (100%)
    E2E:   5/5 paginas con test (100%)

    npm run test     → X/X tests pass ✅
    npm run test:e2e → X/X tests pass ✅

  PENDIENTE (no auto-arreglable):
    ❌ Falta STRIPE_SECRET_KEY en .env.local
    ⚠️  src/app/api/users/route.ts sin auth

================================================================
```
