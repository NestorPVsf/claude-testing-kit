# Parametrización del cliente Supabase con env override

Lovable (y algunos scaffolds de Vite) generan `src/integrations/supabase/client.ts` con URL y anon key **hardcodeados** como fallback:

```ts
// Código generado por Lovable — típico
export const supabase = createClient<Database>(
  "https://<project-ref>.supabase.co",
  "<anon-key>",
  { /* opts */ },
);
```

Para que los tests puedan apuntar a Supabase local sin tocar el fallback de producción (y sin regenerar el archivo cada vez que Lovable lo sobreescribe), parametrizar con `import.meta.env.VITE_*` + fallback:

## Patrón recomendado

```ts
// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Fallback hardcodeado = el valor de producción que Lovable ya escribió.
// Se respeta cuando la app corre en producción sin VITE_SUPABASE_URL inyectado.
// En tests y en dev local, .env.test / .env.local inyecta el valor correcto.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://<project-ref>.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "<anon-key>";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

## Por qué exportar `SUPABASE_URL`

Para que Edge Functions invocadas desde el cliente puedan construir URLs absolutas sin re-leer env:

```ts
import { SUPABASE_URL, supabase } from '@/integrations/supabase/client';

const url = `${SUPABASE_URL}/storage/v1/object/public/...`;
```

Es la razón por la que Team BCN migró de `SUPABASE_URL` hardcodeado a uno importado — consolidar en un único punto de verdad.

## Cuidado con el empty-string

```ts
// ❌ Mal si VITE_SUPABASE_URL="" (empty string, no undefined)
//    Devuelve "", no el fallback
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://prod...";
```

`??` (nullish) no cae al fallback con empty-string. En el **cliente** esto normalmente no pasa (Vite deja la var sin definir si no está en .env). Donde sí pasa es en el dev server spawned por Playwright — por eso en `playwright.config.ts > webServer.env` usamos `||`. Ver `cross-platform.md`.

Si quieres ser paranoico también aquí:

```ts
const rawUrl = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_URL = (rawUrl && rawUrl.trim()) || "https://<project-ref>.supabase.co";
```

## Schemas alternativos

Si tu app usa múltiples schemas (p.ej. `learning`, `crm`), extender el patrón pero reusar `SUPABASE_URL`:

```ts
export const supabaseLearning = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'learning' },
  auth: { /* ... */, storageKey: 'sb-learning-auth-token' },
});
```

Una sola URL, una sola key, varios clientes. Los tests sólo necesitan mockear el `supabase` principal — los derivados comparten el mismo mock base.

## Lovable regenera el archivo

Lovable puede sobreescribir `client.ts` al regenerar tipos (p.ej. tras `lovable` push). Si eso pasa, re-aplicar el patrón. Considerar añadir un script `npm run fix:client` que parche `client.ts` automáticamente tras cada pull.

## Bonus: evitar que Lovable lo sobreescriba

En `.lovable/ignore` (si existe en tu tier) o en un PR comment, marcar `client.ts` como manual. Confirmar con el support de Lovable.
