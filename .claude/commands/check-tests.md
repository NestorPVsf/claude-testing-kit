# /check-tests — Verificar cobertura y generar tests faltantes

Escanea el proyecto, muestra que archivos no tienen tests, y los genera automaticamente.

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

## Paso 2: Escanear API routes

```bash
# Encontrar todos los route.ts (excluyendo archivos de test)
find $APP_DIR/api -name "route.ts" -not -name "*.test.ts" 2>/dev/null | sort

# Encontrar los que ya tienen test
find $APP_DIR/api -name "route.test.ts" 2>/dev/null | sort
```

Para cada `route.ts` que NO tenga un `route.test.ts` adyacente, marcarlo como pendiente.

Si `$APP_DIR/api` no existe → reportar "No se encontraron API routes" y pasar a paginas.

## Paso 3: Escanear paginas

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

## Paso 4: Mostrar reporte

Formato de salida:

```
================================================================
  CHECK-TESTS — Cobertura de testing
================================================================

  Estructura detectada: src/app/

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

  RESUMEN:
    Unit:  12/15 endpoints con test (80%)
    E2E:   3/5 paginas con test (60%)

================================================================
```

## Paso 5: Preguntar al usuario

Si hay archivos sin test, preguntar:

```
Faltan X unit tests y Y E2E tests.
¿Los genero? (si/no)
```

Si el usuario dice NO → terminar aqui.
Si el usuario dice SI → continuar con Paso 6.

## Paso 6: Generar unit tests (primero)

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

## Paso 7: Generar E2E tests (despues)

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
2. **Crear** `tests/nombre.spec.ts` (usando la convencion de nombres del Paso 3) con tests para:
   - La pagina carga y muestra el contenido principal
   - Elementos clave son visibles
   - Interacciones basicas funcionan
   - Redirige a login sin autenticacion (si aplica)
3. **Ejecutar** `npm run test:e2e` para verificar
4. **Si falla** → leer el error, corregir el test, volver a ejecutar
5. **Siguiente** pagina

Usar la skill `testing-kit` como referencia para selectores y assertions de Playwright.

## Paso 8: Reporte final

```
================================================================
  CHECK-TESTS — Generacion completada
================================================================

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

================================================================
```
