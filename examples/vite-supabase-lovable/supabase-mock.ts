/**
 * Reusable Supabase client mock builder.
 * Chainable builder that mimics supabase.from('table').select().eq().single().
 * Only implements the surface our hooks touch. Extend as needed.
 */
import { vi } from 'vitest';

type QueryResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

type TableBuilder = {
  returns: <T>(data: T) => TableBuilder;
  throws: (message: string) => TableBuilder;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: <TResult>(onFulfilled: (value: QueryResult) => TResult) => Promise<TResult>;
};

type SupabaseMockBuilder = {
  from: (table: string) => TableBuilder;
  build: () => unknown;
  _tables: Map<string, QueryResult>;
};

export function mockSupabase(): SupabaseMockBuilder {
  const tables = new Map<string, QueryResult>();

  const makeTableBuilder = (table: string): TableBuilder => {
    const result: QueryResult = tables.get(table) ?? { data: null, error: null };

    const chain: TableBuilder = {
      returns: <T>(data: T) => {
        tables.set(table, { data, error: null });
        return chain;
      },
      throws: (message: string) => {
        tables.set(table, { data: null, error: { message } });
        return chain;
      },
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result),
      maybeSingle: vi.fn().mockResolvedValue(result),
      then: <TResult,>(onFulfilled: (value: QueryResult) => TResult) =>
        Promise.resolve(result).then(onFulfilled),
    };

    return chain;
  };

  return {
    from: makeTableBuilder,
    build: () => ({
      from: (table: string) => makeTableBuilder(table),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    }),
    _tables: tables,
  };
}
