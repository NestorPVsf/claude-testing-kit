# Cross-platform — dotenv, LF/CRLF, empty-string leaks

Conjunto de reglas para que el kit funcione en Windows, macOS y Linux sin ajustes manuales por dev.

## 1. `dotenv.config({ override: true })` obligatorio en test infra

```ts
// ✅ Bien — archivos de test infra (auth.setup.ts, playwright.config.ts)
config({ path: resolve(process.cwd(), '.env.test'), override: true });

// ❌ Mal — sin override, el shell env gana
config({ path: resolve(process.cwd(), '.env.test') });
```

Razón: si el dev tiene `VITE_SUPABASE_URL=https://prod...` en su shell (heredado de desarrollar contra prod), los tests pueden llegar a leer prod antes de que el guard lo intercepte. Override garantiza que `.env.test` siempre gana.

## 2. LF en scripts `.sh` — `.gitattributes`

Husky instala hooks como scripts bash. En Windows, git convierte line endings a CRLF al hacer checkout, y bash falla con `bad interpreter: No such file or directory`.

Archivo `.gitattributes` en la raíz:

```
# Auto-detect text files and normalize line endings to LF on checkin
* text=auto

# Force LF on shell scripts and husky hooks — required on Windows
*.sh text eol=lf
.husky/pre-commit text eol=lf
.husky/pre-push text eol=lf
.husky/commit-msg text eol=lf
```

Tras añadir `.gitattributes`, normalizar los archivos ya checkeados:

```sh
git add --renormalize .
git commit -m "chore: normalize line endings per .gitattributes"
```

## 3. Empty-string vs nullish en `webServer.env`

Problema: `process.env.FOO` puede ser `undefined` **o** `""`. `??` solo cae al default con `null`/`undefined`, no con `""`.

```ts
// ❌ Mal — si VITE_SUPABASE_URL="", inyecta "" al dev server
webServer: {
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  },
},

// ✅ Bien — `||` también captura empty string
webServer: {
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
  },
},
```

Team BCN llegó a este fix porque el dev server spawned por Playwright servía el cliente Vite con `VITE_SUPABASE_URL=""`, y los fetch del cliente caían relativos al propio dev server (404 en `/rest/v1/users`). El guard no se dispara porque el cliente nunca llega a Supabase.

## 4. Variables env de Playwright `webServer`

Para que el cliente Vite (que corre en el navegador, arrancado por el webServer de Playwright) vea las env correctas, **no basta con `dotenv` en la raíz**. Hay que pasarlas explícitamente:

```ts
export default defineConfig({
  // ...
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    },
  },
});
```

Cargar `.env.test` al inicio del config:

```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
loadDotenv({ path: resolve(process.cwd(), '.env.test'), override: true });
```

## 5. Windows + `bash`: scripts complejos

El hook `pre-push` usa `curl` para detectar si dev server/Supabase local están arriba. Asegurar que:

- `curl` está en PATH (Git for Windows lo trae, o instalar aparte)
- `sh` shebang primero: `#!/usr/bin/env sh`
- Usar `[ "$x" = "$y" ]` (POSIX), no `[[ ]]` (bashismo)

## 6. Path separators en configs JSON/TS

En configs usar siempre forward slashes — Node los normaliza en Windows automáticamente:

```json
{
  "paths": { "unitTests": "src" }  // ✅
}
```

No usar `"src\\test"` (backslash escapado) aunque estés en Windows.
