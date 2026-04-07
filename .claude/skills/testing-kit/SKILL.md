---
name: testing-kit
description: "Unit + E2E testing para Next.js con Claude Code. Combina TDD workflow, Vitest patterns y Playwright E2E en una sola skill. Se activa al crear/modificar route.ts, page.tsx, o archivos de test. Para cualquier proyecto Next.js con App Router."
version: 1.0.0
author: Fernando Montero (Fersora Solutions)
license: MIT
---

# testing-kit — TDD + Unit + E2E para Next.js

## Parte 1: TDD — Test First, Code Second

### 3 Reglas de Hierro

```
1. TEST FIRST, CODE SECOND — sin excepciones
2. NUNCA codigo de produccion sin un test que falle primero
3. CADA route.ts tiene route.test.ts, CADA page.tsx tiene .spec.ts
```

### Ciclo RED → GREEN → REFACTOR

**RED:** Escribir UN test que describe UN comportamiento → ejecutar → DEBE FALLAR
**GREEN:** Escribir el codigo MINIMO para que pase → ejecutar → DEBE PASAR
**REFACTOR:** Limpiar sin romper tests → ejecutar → SIGUE PASANDO

Repetir. Un test a la vez. SIEMPRE vertical (test → codigo → green), NUNCA horizontal (todos los tests → luego todo el codigo).

### Test List (antes de escribir codigo)

Listar todos los comportamientos a testear. Ejemplo para `POST /api/users`:
```
1. 201 — crea usuario con datos validos
2. 401 — rechaza sin autenticacion
3. 400 — rechaza campos requeridos vacios
4. 400 — rechaza email invalido
5. 404 — recurso padre no existe
6. 500 — maneja error de base de datos
```

Cada item = un ciclo RED → GREEN.

---

## Parte 2: Unit Tests con Vitest

### Template de 6 Casos (minimo obligatorio)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES de los imports del codigo
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// Import del codigo a testear
import { POST } from './route'

const MOCK_USER = { id: 'user-123', email: 'test@example.com' }

function createRequest(body?: unknown): Request {
  return new Request('http://localhost/api/resource', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => { vi.clearAllMocks() })

describe('POST /api/resource', () => {
  // CASO 1: Happy path (200/201)
  it('returns 201 with created resource', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Test' }, error: null }),
    })

    const res = await POST(createRequest({ name: 'Test' }))
    expect(res.status).toBe(201)
  })

  // CASO 2: Sin autenticacion (401)
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(createRequest({ name: 'Test' }))
    expect(res.status).toBe(401)
  })

  // CASO 3: Input invalido (400)
  it('returns 400 on invalid input', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const res = await POST(createRequest({})) // body vacio
    expect(res.status).toBe(400)
  })

  // CASO 4: No encontrado (404)
  it('returns 404 when resource not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const res = await POST(createRequest({ parentId: 'not-found' }))
    expect(res.status).toBe(404)
  })

  // CASO 5: Error de BD (500)
  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    })

    const res = await POST(createRequest({ name: 'Test' }))
    expect(res.status).toBe(500)
    // Verificar que NO expone el error interno
    const body = await res.json()
    expect(body.error).not.toContain('DB error')
  })

  // CASO 6: Extra (especifico del endpoint — SIEMPRE implementar, nunca dejar vacio)
  it('returns 409 when duplicate name exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique_violation', code: '23505' },
      }),
    })

    const res = await POST(createRequest({ name: 'Duplicado' }))
    expect(res.status).toBe(409)
  })
})
```

### Multiples metodos HTTP en un endpoint

Si un `route.ts` exporta GET y POST (o mas), crear un `describe()` separado por cada metodo:

```typescript
import { GET, POST } from './route'

describe('GET /api/posts', () => {
  it('returns 200 with posts list', async () => {
    // ...6 casos para GET
  })
})

describe('POST /api/posts', () => {
  it('returns 201 with created post', async () => {
    // ...6 casos para POST
  })
})
```

### Mock Patterns para Supabase

> **Nota:** Estos patrones son para proyectos con Supabase. Si usas otra BD (Prisma, Drizzle, MongoDB), adapta los mocks a tu cliente de base de datos. La estructura del test (6 casos, assertions de status) aplica igual.

```typescript
// SELECT con filtros
mockFrom.mockReturnValue({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [item1, item2], error: null }),
})

// INSERT
mockFrom.mockReturnValue({
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: newItem, error: null }),
})

// UPDATE
mockFrom.mockReturnValue({
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: updated, error: null }),
})

// DELETE
mockFrom.mockReturnValue({
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ error: null }),
})
```

### Construir Requests

```typescript
// GET con query params
new Request('http://localhost/api/posts?status=draft&page=1')

// POST con body
new Request('http://localhost/api/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Test' }),
})

// Ruta dinamica (Next.js 15+ — params son async)
const res = await GET(req, { params: Promise.resolve({ id: 'abc-123' }) })
```

### Vitest Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

---

## Parte 3: E2E con Playwright

### 5 Reglas Clave

1. **Selector priority** — `getByRole` > `getByText` > `getByTestId` > CSS
2. **Web-first assertions** — `await expect(locator).toBeVisible()`, NUNCA `locator.isVisible()`
3. **Auth reuse** — login una vez, guardar `storageState`, reusar en todos los tests
4. **Un comportamiento por test** — independientes, sin estado compartido
5. **SIEMPRE limpiar datos de test** — no dejar residuos en BD

### Playwright Config

```typescript
// playwright.config.ts
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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
```

### Auth Setup

```typescript
// tests/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_EMAIL!)
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_PASSWORD!)
  await page.getByRole('button', { name: /login|iniciar/i }).click()
  await page.waitForURL('**/dashboard**', { timeout: 15_000 })
  await page.context().storageState({ path: 'tests/.auth/user.json' })
})
```

### Template E2E

```typescript
// tests/posts.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Posts page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posts')
  })

  test('shows page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /posts/i })).toBeVisible()
  })

  test('shows at least one post', async ({ page }) => {
    const articles = page.getByRole('article')
    await expect(articles.first()).toBeVisible()
  })

  test('redirects to login without auth', async ({ browser }) => {
    const ctx = await browser.newContext() // sin storageState
    const page = await ctx.newPage()
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/login/)
    await ctx.close()
  })
})
```

### 3 Gotchas Imprescindibles

**1. Race condition en carga:**
```typescript
// MAL — resuelve durante loading
await page.waitForLoadState('networkidle')

// BIEN — espera al contenido real
await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible({ timeout: 15_000 })
```

**2. Multiples matches:**
```typescript
// MAL — "Guardar" aparece en heading Y button
page.getByText('Guardar')

// BIEN — especificar rol
page.getByRole('button', { name: 'Guardar' })
```

**3. URL parcial:**
```typescript
// MAL — /posts/new matchea /posts/
await expect(page).toHaveURL(/\/posts\//)

// BIEN — patron especifico
await expect(page).toHaveURL(/\/posts\/[0-9a-f]{8}/)
```

---

## Estructura de Archivos

```
src/app/api/posts/
  route.ts             ← codigo
  route.test.ts        ← test unitario (adyacente)
  [id]/
    route.ts
    route.test.ts

tests/
  auth.setup.ts        ← login para E2E
  posts.spec.ts        ← E2E de /posts
  settings.spec.ts     ← E2E de /settings
  .auth/user.json      ← session guardada (gitignored)
```

Tests unitarios: JUNTO al codigo.
Tests E2E: en carpeta `tests/`.

---

## Paginas que NO necesitan E2E

No crear `.spec.ts` para:
- `layout.tsx` — no son paginas, son wrappers
- `error.tsx`, `not-found.tsx`, `loading.tsx` — paginas del sistema
- Paginas que solo hacen `redirect()` sin UI propia

Reportar como excluidas:
```
⊘ src/app/not-found.tsx — pagina del sistema, omitido
```
