# Supabase Mock Builder

Un solo builder reutilizable para mockear el cliente Supabase en tests de hooks. Nunca mockear ad-hoc dentro de un test.

## Qué cubre

- `.from(table)` → `.select()` → `.eq()` / `.in()` / `.order()` / `.limit()` → `.single()` / `.maybeSingle()` / `await`
- `.insert()`, `.update()`, `.delete()`, `.upsert()` (chainable, encadenan con las mismas condiciones)
- `.auth.getUser()`, `.auth.getSession()`, `.auth.signInWithPassword()`, `.auth.onAuthStateChange()`, `.auth.signOut()`
- `.functions.invoke()`

Ubicación: `src/test/supabase-mock.ts`. Implementación completa en `examples/vite-supabase-lovable/supabase-mock.ts`.

## API del builder

```ts
import { mockSupabase } from '@/test/supabase-mock';

// Happy path
const supa = mockSupabase()
  .from('profiles').returns([{ id: '1', email: 'test@local' }]);

// Error simulado
const supaErr = mockSupabase()
  .from('profiles').throws('permission denied');

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supa.build(),
}));
```

`.returns(data)` y `.throws(message)` son terminales — preparan el resultado para cuando el hook bajo test llame `.then()`, `.single()`, o `.maybeSingle()`.

## Wrapper estándar para `renderHook`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
```

`retry: false` es crítico — si React Query reintenta, los tests tardarán ~10 s por query fallida y harán timeout.

## Reglas

- **No mockear `supabase` con `vi.fn()` ad-hoc** dentro del test. Usar siempre el builder
- **Si falta una API del cliente** (p.ej. `.rpc()`), añadirla al builder, no al test
- **Un test = un mock state**. Si un hook dispara 2 queries a 2 tablas, encadenar:
  ```ts
  const supa = mockSupabase();
  supa.from('courses').returns([...]);
  supa.from('videos').returns([...]);
  vi.mock('@/integrations/supabase/client', () => ({ supabase: supa.build() }));
  ```
- **`auth.getUser()`** devuelve `{ data: { user: null } }` por defecto. Override con:
  ```ts
  const built = supa.build();
  (built.auth.getUser as any).mockResolvedValue({
    data: { user: { id: 'user-1', email: 'a@b.c' } },
    error: null,
  });
  ```

## Cuándo NO usar el builder

- Tests de Edge Functions (Deno) — ahí se mockea `@supabase/supabase-js` con `vi.mock()` directamente, no con el builder. Ver `edge-function-contract.md`.
- Tests puros de `src/lib/*.ts` — no tocan Supabase, no necesitan mock.
