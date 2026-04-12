# Production Guard — La guardia inviolable

## Por qué existe

2026-03-23: un write automatizado (curl) contra la API de producción corrompió 88 campos. El guard existe para que esto no vuelva a pasar nunca.

Regla: **ningún test puede ejecutarse si `VITE_SUPABASE_URL` o `SUPABASE_URL` apunta a producción**. El proceso aborta con error ruidoso antes de cualquier fetch.

## Diseño

Un solo módulo puro (`src/test/production-guard.ts`) sin deps de framework. Se llama desde:
- Vitest: via `src/test/setup.ts` en `setupFiles` de `vitest.config.ts`
- Playwright: via `tests/auth.setup.ts`, antes de cualquier login o fetch

No duplicar la lógica en dos sitios. Es literalmente la misma función importada en ambos.

## Listas

```json
// .claude/testing-kit.config.json
{
  "productionGuard": {
    "allowedHosts": ["localhost", "127.0.0.1", "host.docker.internal"],
    "allowedHostPatterns": [".staging.supabase.co"],
    "blacklistedHosts": [
      "recursos.<tu-dominio>.com",
      "<tu-project-ref>.supabase.co"
    ]
  }
}
```

- **Allowed host patterns** (hardcodeados como regex en el módulo): `localhost`, `127.0.0.1`, `host.docker.internal`, `*.staging.supabase.co`
- **Blacklisted hosts**: hosts conocidos de producción del proyecto actual. Leer del config, nunca hardcodear
- Si la URL no matchea allowed, aborta incluso sin estar blacklisted (whitelist-first)

## Cómo se lee el config (y por qué no con `import`)

Playwright corre bajo el loader ESM nativo de Node 22, que exige:
```ts
import cfg from '.../testing-kit.config.json' with { type: 'json' };
```
Vitest usa un loader diferente que acepta el import clásico. Para que el **mismo módulo** funcione en los dos runners sin trucos, leer el JSON con `fs.readFileSync` + `JSON.parse`.

```ts
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

function loadBlacklistedHosts(): string[] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(here, '..', '..', '.claude', 'testing-kit.config.json');
    const raw = readFileSync(configPath, 'utf8');
    return (JSON.parse(raw)?.productionGuard?.blacklistedHosts as string[]) ?? [];
  } catch {
    return []; // fallback seguro — la allowed-list sigue bloqueando hosts desconocidos
  }
}
```

## Implementación de referencia

Ver contenido completo del módulo en `examples/vite-supabase-lovable/production-guard.ts`.

## Cómo extenderlo para un host nuevo

Editar **solo** `.claude/testing-kit.config.json > productionGuard.allowedHosts` o `allowedHostPatterns`. Nunca `setup.ts` ni `production-guard.ts`.

Si tu staging está en otro dominio (p.ej. `staging.miapp.com`), añádelo como pattern exacto en `allowedHostPatterns`.

## Reglas

- **NO bypasear nunca** con env vars, flags ni `if (process.env.SKIP_GUARD)`. No existe tal bypass
- **SÍ añadir hosts nuevos al config** cuando sean legítimos (staging, preview)
- **NO comentar la llamada a `assertNotProduction()`** ni en setup.ts ni en auth.setup.ts
- Si un test falla con "TESTING AGAINST PRODUCTION IS FORBIDDEN" el problema está en tu `.env.test`, no en el guard
