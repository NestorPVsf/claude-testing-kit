/**
 * Ejemplo: Unit test para POST /api/posts
 *
 * Este archivo muestra los 6 casos minimos que todo endpoint debe tener.
 * Copia este patron y adaptalo a tu endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 1. Definir mocks ANTES de los imports
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}))

// 2. Importar el codigo a testear DESPUES de los mocks
import { POST } from './route'

// 3. Datos de test reutilizables
const MOCK_USER = { id: 'user-123', email: 'test@test.com' }

function createRequest(body?: unknown): Request {
  return new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

// 4. Limpiar mocks antes de cada test
beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/posts', () => {
  // CASO 1: Happy path (200/201)
  it('creates a post and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'post-1', title: 'Mi post', user_id: MOCK_USER.id },
        error: null,
      }),
    })

    const res = await POST(createRequest({ title: 'Mi post', content: 'Contenido' }))
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.title).toBe('Mi post')
  })

  // CASO 2: Sin autenticacion (401)
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(createRequest({ title: 'Test' }))
    expect(res.status).toBe(401)
  })

  // CASO 3: Input invalido (400)
  it('returns 400 when title is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })

    const res = await POST(createRequest({ content: 'Sin titulo' }))
    expect(res.status).toBe(400)
  })

  // CASO 4: No encontrado (404)
  it('returns 404 when referenced category does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const res = await POST(createRequest({ title: 'Test', categoryId: 'no-existe' }))
    expect(res.status).toBe(404)
  })

  // CASO 5: Error de base de datos (500)
  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      }),
    })

    const res = await POST(createRequest({ title: 'Test' }))
    expect(res.status).toBe(500)

    // Verificar que NO expone detalles internos
    const body = await res.json()
    expect(body.error).not.toContain('connection')
  })

  // CASO 6: Extra — duplicado
  it('returns 409 when post with same title exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique_violation', code: '23505' },
      }),
    })

    const res = await POST(createRequest({ title: 'Duplicado' }))
    expect(res.status).toBe(409)
  })
})
