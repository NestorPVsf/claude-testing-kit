# CLAUDE.md — Testing Kit

## Que es esto

Kit de testing para proyectos Next.js con Claude Code.
Copia esta carpeta `.claude/` a tu proyecto y Claude hace TDD + E2E automaticamente.

## Stack esperado

Next.js (App Router), TypeScript, Vitest (unit), Playwright (E2E)

## Reglas de testing

- **API routes** (`route.ts`): TDD obligatorio — test ANTES del codigo
- **Paginas** (`page.tsx`): E2E test DESPUES del codigo, ANTES del commit
- **Minimo 6 tests** por endpoint: 200, 401, 400, 404, 500 + uno extra
- **Nunca** commitear codigo sin sus tests

## Comandos

```bash
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
```

## Comando de Claude

- `/check-tests` — Escanea cobertura, reporta que falta, y genera los tests automaticamente
