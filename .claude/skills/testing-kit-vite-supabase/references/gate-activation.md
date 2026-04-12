# Gate Activation — Verificación 3-ciclos OK/blocked/restored

Activar un gate (pre-commit, pre-push) sin demostrar que funciona es peor que no tener gate. Este documento describe el protocolo obligatorio para probar que un gate nuevo bloquea de verdad.

## Cuándo aplicar

- Activar `.husky/pre-commit` por primera vez en un repo
- Cambiar el payload de un gate existente (añadir lint, typecheck, etc.)
- Migrar de gate reactivo a bloqueante (p.ej. pre-push de warning a fail)

## Los 3 ciclos

### Ciclo 1 — OK (commit limpio pasa)

```
1. Escribir un cambio trivial que no rompa nada
2. git add <archivo>
3. git commit -m "test: verify gate OK cycle"
4. El gate corre y pasa → commit creado
5. Registrar el SHA (git log -1 --format=%H)
```

Evidencia: `git log --oneline -1` muestra el commit.

### Ciclo 2 — BLOCKED (commit roto es rechazado)

```
1. Romper un test intencionalmente (p.ej. `expect(1+1).toBe(3)` en un .test.ts trivial)
2. git add <archivo roto>
3. git commit -m "test: verify gate BLOCKED cycle"
4. El gate corre, falla ruidosamente, el commit NO se crea
5. Verificar con `git log --oneline -1` que HEAD sigue en el commit del Ciclo 1
6. git restore <archivo roto>  (o git stash; git stash drop)
```

**Evidencia crítica**: HEAD no avanzó. El commit bloqueado no aparece en `git log`. Si aparece, el gate está mal configurado o el hook no se ejecutó.

### Ciclo 3 — RESTORED (commit limpio vuelve a pasar)

```
1. El archivo está restaurado a su estado bueno
2. git commit -m "test: verify gate RESTORED cycle"
3. El gate corre y pasa → commit creado
4. Registrar el SHA
```

Evidencia: tres commits totales (Ciclo 1 + Ciclo 3, el del Ciclo 2 no existe). El gate demostró que bloquea solo cuando hace falta.

## Qué documentar

En el commit que activa el gate (o en un archivo `GATE-VERIFICATION.md`), escribir:

```markdown
# Gate verification — pre-commit (npm test)

Date: 2026-04-12

## Cycle 1 (OK)
- SHA: abc123
- Payload: trivial test passes, npm test green

## Cycle 2 (BLOCKED)
- Broke src/lib/foo.test.ts with `expect(1+1).toBe(3)`
- Ran git commit → gate printed "FAIL" and exited non-zero
- Verified HEAD still at abc123 (no commit created)
- Restored foo.test.ts

## Cycle 3 (RESTORED)
- SHA: def456
- Gate passed after restore, commit created
```

## Regla

Sin esta prueba explícita, "el gate está activo" es una claim sin evidencia. Los gates mal configurados son peores que no tener gate — dan falsa seguridad.

Ejemplo real: Team Jerez Fase 4 (commit `6986bf6`) validó el gate con los 3 ciclos antes de mergear a main. Proceso documentado en `7ffe328`.

## Antipatrón

NO probar el gate "rompiendo algo de verdad". Romper adrede un test trivial es rápido y reversible; romper una feature productiva no.

NO probar solo el Ciclo 1. Un gate que nunca ha bloqueado nada puede estar silenciosamente roto (hook path equivocado, `exit 0` hardcodeado, etc.).

## Config

En `.claude/testing-kit.config.json`:

```json
{
  "gates": {
    "preCommitBlocking": true,
    "prePushBlocking": false,
    "reason": "Activated 2026-04-12 after N unit tests + M E2E verdes. Verified with 3-cycle protocol."
  }
}
```

El campo `reason` es obligatorio — documenta la fecha de activación y la evidencia.

## Bypass de emergencia

Cuando el gate falla pero el commit es urgente (hotfix, revert de algo que rompió prod), NUNCA usar `--no-verify`. Usar:

```sh
HUSKY=0 git commit -m "hotfix: ..."
```

`HUSKY=0` deja un rastro más fácil de auditar en history y en logs de shell.
