---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/route.ts"
  - "**/page.tsx"
---

# Testing — TDD + E2E

## Principio fundamental

El tipo de archivo determina CUANDO se escribe el test:

- **`route.ts`** (API): test ANTES del codigo (TDD)
- **`page.tsx`** (pagina): test DESPUES del codigo, ANTES del commit (E2E)

NUNCA commitear un `route.ts` sin `route.test.ts`.
NUNCA commitear un `page.tsx` sin su `.spec.ts`.

## TDD para API routes

```
1. RED:      Escribir route.test.ts (el codigo NO existe aun)
2. GREEN:    Escribir el codigo minimo para que el test pase
3. REFACTOR: Limpiar sin romper tests
4. REPEAT:   Siguiente test
```

SIEMPRE vertical: un test → su codigo → green → siguiente test.
NUNCA horizontal: todos los tests → luego todo el codigo.

### 6 tests minimos por endpoint

Cada `route.test.ts` DEBE cubrir al menos estos casos:

| # | Status | Que verifica |
|---|--------|-------------|
| 1 | 200 | Happy path — todo funciona |
| 2 | 401 | Sin autenticacion |
| 3 | 400 | Input invalido (body, params) |
| 4 | 404 | Recurso no existe |
| 5 | 500 | Error de base de datos |
| 6 | Extra | Caso especifico del endpoint |

Si un caso no aplica (ej: endpoint publico no tiene 401), documentar por que:
```typescript
// CASE 2 (401): Skipped — public endpoint, no auth required
```

## E2E para paginas

- Cada `page.tsx` nueva DEBE tener `.spec.ts` en `tests/`
- Escribir E2E DESPUES de construir la pagina y probarla visualmente
- El `.spec.ts` DEBE existir ANTES del commit

## Verificacion pre-commit

Antes de hacer commit, verificar:
```
Numero de route.ts nuevos = Numero de route.test.ts nuevos
Numero de page.tsx nuevos = Numero de .spec.ts nuevos
```

Si no coinciden → PARAR y crear los tests que faltan.

## Regla de oro

NUNCA decir "los tests deberian pasar" — ejecutar y verificar.
Formato obligatorio: `npm run test — X/X tests pass`
