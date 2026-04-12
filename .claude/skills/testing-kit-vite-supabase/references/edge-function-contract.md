# Edge Function Testing Contract — 6 casos mínimos

Toda Edge Function de Supabase (Deno) en este stack debe tener al menos 6 casos de test, siempre los mismos. TDD obligatorio: escribir el test que falla antes de implementar la función.

## Los 6 casos

| Código | Caso | Qué valida |
|--------|------|-----------|
| **200** | happy path | payload válido + user autenticado → respuesta correcta |
| **401** | auth missing | sin token o token inválido → 401 |
| **400** | payload inválido | Zod falla en la validación → 400 |
| **404** | recurso no encontrado | id que no existe → 404 |
| **500** | error interno | dependencia upstream (n8n, OpenAI, etc.) lanza → 500 sin leak de stack |
| **custom** | edge case específico | boundary de esta función (permiso, race, enum, mismatch identity...) |

Si la función no tiene caso 404 real (p.ej. no consulta DB por id) sustituir por otro edge case custom — pero siempre 6 mínimo.

## Estrategia de test

Tests corren en Vitest (no en Deno runtime). Se mockea `@supabase/supabase-js` vía `vi.mock`, y el módulo `std/http/server` para interceptar el `serve(handler)` y guardar la función en una variable local para invocarla directamente con `Request`/`Response` del runtime Web.

Pattern canónico completo en `examples/vite-supabase-lovable/send-certificate.test.ts`.

## Esqueleto reutilizable

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1) Mock del cliente Supabase antes del import
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetUser = vi.fn();
const mockSupabase = { from: mockFrom, auth: { getUser: mockGetUser } };

vi.mock('https://esm.sh/@supabase/supabase-js@2.75.1', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// 2) Stub de Deno.env (map controlado por el test)
const stubEnv = new Map<string, string>([
  ['SUPABASE_URL', 'http://127.0.0.1:54321'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key'],
]);
(globalThis as any).Deno = { env: { get: (k: string) => stubEnv.get(k) ?? null } };

// 3) Capturar el handler que `serve(...)` registra
let handler: ((req: Request) => Promise<Response>) | null = null;
vi.mock('https://deno.land/std@0.190.0/http/server.ts', () => ({
  serve: (fn: (req: Request) => Promise<Response>) => { handler = fn; },
}));

// 4) Importar el módulo (dispara serve() y popula `handler`)
await import('./index.ts');

// 5) Helper para construir Request — encapsula auth header opcional
function makeRequest(body: unknown, opts: { auth?: string | null } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== null) headers['Authorization'] = opts.auth ?? 'Bearer valid-jwt';
  return new Request('http://localhost/fn', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

describe('<nombre>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('200 happy path', async () => { /* ... */ });
  it('401 missing auth', async () => { /* ... */ });
  it('400 invalid payload', async () => { /* ... */ });
  it('404 not found', async () => { /* ... */ });
  it('500 upstream fail', async () => { /* ... */ });
  it('403 identity mismatch', async () => { /* ... */ }); // custom
});
```

## Reglas

- **TDD primero**: escribir los 6 tests rojos, luego implementar la función hasta que todos pasen
- **No leak de stack traces**: el caso 500 debe assertear que el body es `{ error: "..." }` genérico, no el `.message` de la excepción original
- **El caso custom es obligatorio**: no se puede saltar con "no hay edge case obvio". Si la función no tiene edge case, probablemente no merece ser Edge Function — es CRUD puro y va en el cliente con RLS
- **Identity checks son custom clásico**: payload trae `user_id`, token trae otro → 403 sin tocar DB ni llamar upstream

## Qué registra `.claude/testing-kit.config.json`

```json
{
  "testingContract": {
    "minTestsPerEdgeFunction": 6,
    "requiredCases": ["200", "401", "400", "404", "500", "custom"],
    "mockStrategy": "supabase-mock-builder"
  }
}
```

El comando `/check-tests` (opcional, en `.claude/commands/`) lee esta config y valida que cada `supabase/functions/<name>/index.ts` tenga un `index.test.ts` con al menos N tests.

## Endpoints públicos (allowlist)

Si la función es webhook server-to-server, pre-auth, o usa HMAC en vez de JWT, registrarla en `publicEndpoints` del config para que el auditor de seguridad no la penalice por no tener `supabase.auth.getUser()`.

```json
"publicEndpoints": {
  "webhook": ["rag-process-video", "send-welcome-email"],
  "public": ["register-with-invite", "validate-invite-link"],
  "customAuth": ["admin-confirm-user-email", "transcribe-audio"]
}
```
