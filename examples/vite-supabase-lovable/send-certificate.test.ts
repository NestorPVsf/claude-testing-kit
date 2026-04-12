/**
 * Canonical example: 6-case Edge Function test.
 * send-certificate: verifies JWT, payload matches token, block exists, calls n8n.
 *
 * Cases covered: 200 / 401 x2 / 400 / 404 / 500 / 403 custom + bonus CORS + bonus progress.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockSchema = vi.fn(() => ({ from: mockFrom }));
const mockGetUser = vi.fn();
const mockSupabase = {
  schema: mockSchema,
  from: mockFrom,
  auth: { getUser: mockGetUser },
};

vi.mock('https://esm.sh/@supabase/supabase-js@2.75.1', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const stubEnv = new Map<string, string>([
  ['SUPABASE_URL', 'http://127.0.0.1:54321'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key'],
  ['SUPABASE_ANON_KEY', 'test-anon-key'],
  ['N8N_WEBHOOK_SECRET', 'test-secret'],
]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Deno = {
  env: { get: (key: string) => stubEnv.get(key) ?? null },
};

let handler: ((req: Request) => Promise<Response>) | null = null;
vi.mock('https://deno.land/std@0.190.0/http/server.ts', () => ({
  serve: (fn: (req: Request) => Promise<Response>) => {
    handler = fn;
  },
}));

await import('./index.ts');

const AUTH_USER_ID = 'user-uuid-1';
const VALID_PAYLOAD = {
  user_id: AUTH_USER_ID,
  email: 'user@example.com',
  full_name: 'Test User',
  block_id: 'block-uuid-1',
  block_title: 'Bloque Fundamentos',
  completed_at: '2026-04-12T00:00:00Z',
  progress: 100,
  total_lessons: 10,
  completed_lessons: 10,
  total_duration: '2h 30m',
};

const VALID_BLOCK = { parent_id: null, level: 1 };

function makeRequest(body: Record<string, unknown>, opts: { auth?: string | null } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== null) headers['Authorization'] = opts.auth ?? 'Bearer valid-jwt';
  return new Request('http://localhost/send-certificate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('send-certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 'user@example.com' } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: VALID_BLOCK, error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ certificate_url: 'https://cdn/cert.pdf', email_sent: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('200 happy path — JWT válido y payload coincide', async () => {
    const res = await handler!(makeRequest(VALID_PAYLOAD));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.certificate_url).toBe('https://cdn/cert.pdf');
  });

  it('401 sin Authorization header', async () => {
    const res = await handler!(makeRequest(VALID_PAYLOAD, { auth: null }));
    expect(res.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('401 JWT inválido/expirado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    const res = await handler!(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(401);
  });

  it('400 payload sin user_id', async () => {
    const { user_id: _omit, ...rest } = VALID_PAYLOAD;
    void _omit;
    const res = await handler!(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('404 block_id no existe (PGRST116)', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' },
    });
    const res = await handler!(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(404);
  });

  it('500 webhook n8n falla', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream error', { status: 502, statusText: 'Bad Gateway' }),
    );
    const res = await handler!(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(500);
  });

  // custom: identity mismatch — este es el boundary único de esta función
  it('403 payload.user_id != JWT user id (sin tocar DB ni upstream)', async () => {
    const tamperedPayload = { ...VALID_PAYLOAD, user_id: 'someone-else-uuid' };
    const res = await handler!(makeRequest(tamperedPayload));
    expect(res.status).toBe(403);
    expect(mockSchema).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('200 OPTIONS preflight', async () => {
    const res = await handler!(
      new Request('http://localhost/send-certificate', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('400 progress < 100', async () => {
    const res = await handler!(makeRequest({ ...VALID_PAYLOAD, progress: 75 }));
    expect(res.status).toBe(400);
  });
});
