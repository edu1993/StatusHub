import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteService,
  forgotPassword,
  getIncidentResolvedAt,
  getIncidentsPaginated,
  getPublicStatus,
  login,
  register,
  saveService,
} from '../api'
import type { ApiIncident } from '../api'

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response)
}

const sampleIncidents: ApiIncident[] = [
  {
    id: 1,
    date: '2026-11-18 10:00:00',
    resolved_at: '2026-11-18 10:15:00',
    service_name: 'API Pagos',
    url: 'https://pagos.test/health',
    status: 'Resuelto',
    http_code: 503,
    latency: 0,
    description: 'HTTP 503',
  },
  {
    id: 2,
    date: '2026-11-19 08:30:00',
    resolved_at: null,
    service_name: 'Auth Service',
    url: 'https://auth.test/health',
    status: 'Abierto',
    http_code: null,
    latency: 0,
    description: 'Connection timed out',
  },
  {
    id: 3,
    date: '2026-11-19 09:00:00',
    resolved_at: '2026-11-19 09:05:00',
    service_name: 'API Pagos',
    url: 'https://pagos.test/health',
    status: 'Resuelto',
    http_code: 502,
    latency: 120,
    description: 'Bad Gateway',
  },
]

describe('api.ts — contratos HTTP, paginación y manejo de errores', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('resuelve correctamente la fecha de resolución con prioridad resolved_at > resolved_date > end_date', () => {
    expect(getIncidentResolvedAt({ ...sampleIncidents[0], resolved_at: '2026-11-18 10:15:00', resolved_date: 'old' })).toBe('2026-11-18 10:15:00')
    expect(getIncidentResolvedAt({ ...sampleIncidents[0], resolved_at: null, resolved_date: '2026-11-18 11:00:00' })).toBe('2026-11-18 11:00:00')
    expect(getIncidentResolvedAt({ ...sampleIncidents[0], resolved_at: null, end_date: '2026-11-18 12:00:00' })).toBe('2026-11-18 12:00:00')
    expect(getIncidentResolvedAt({ ...sampleIncidents[1], resolved_at: null })).toBeNull()
  })

  it('adjunta Authorization Bearer cuando existe token en localStorage', async () => {
    localStorage.setItem('statushub_token', 'jwt-token-123')
    const fetchSpy = mockFetchJson({ id: 5 }, true, 201)

    await saveService({ name: 'Core', url: 'https://core.test', check_interval: 60, is_public: true })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/services',
      expect.objectContaining({ method: 'POST' }),
    )
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer jwt-token-123')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('usa PUT cuando saveService recibe id y DELETE en deleteService', async () => {
    const fetchSpy = mockFetchJson({ id: 9 })
    await saveService({ name: 'Core', url: 'https://core.test', check_interval: 60, is_public: false }, 9)
    expect(fetchSpy).toHaveBeenCalledWith('/api/services/9', expect.objectContaining({ method: 'PUT' }))

    fetchSpy.mockClear()
    await deleteService(9)
    expect(fetchSpy).toHaveBeenCalledWith('/api/services/9', expect.objectContaining({ method: 'DELETE' }))
  })

  it('soporta paginación server-side cuando el backend responde objeto paginado', async () => {
    const fetchSpy = mockFetchJson({
      items: [sampleIncidents[0]],
      total: 42,
      page: 2,
      limit: 10,
      total_pages: 5,
      services: ['API Pagos', 'Auth Service'],
    })

    const result = await getIncidentsPaginated({
      page: 2,
      limit: 10,
      service: 'API Pagos',
      status: 'Todos',
      from: '2026-11-01',
    })

    const requestedUrl = String(fetchSpy.mock.calls[0][0])
    expect(requestedUrl).toContain('/api/incidents?')
    expect(requestedUrl).toContain('page=2')
    expect(requestedUrl).toContain('limit=10')
    expect(requestedUrl).toContain('service=API+Pagos')
    expect(requestedUrl).not.toContain('status=')
    expect(result.serverPaginated).toBe(true)
    expect(result.total).toBe(42)
    expect(result.totalPages).toBe(5)
    expect(result.items).toHaveLength(1)
  })

  it('hace fallback transparente a paginación client-side si el backend devuelve array plano', async () => {
    mockFetchJson(sampleIncidents)

    const result = await getIncidentsPaginated({
      page: 1,
      limit: 1,
      service: 'API Pagos',
      status: 'Resuelto',
    })

    expect(result.serverPaginated).toBe(false)
    expect(result.total).toBe(2)
    expect(result.totalPages).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe(1)
  })

  it('devuelve mensaje amigable en español ante fallo de red y propaga error JSON del servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(forgotPassword('qa@empresa.com')).rejects.toThrow(
      'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
    )

    mockFetchJson({ error: 'Credenciales inválidas.' }, false, 401)
    await expect(login('qa@empresa.com', 'Wrong123')).rejects.toThrow('Credenciales inválidas.')
  })

  it('envía terms_accepted en register y codifica el slug en getPublicStatus', async () => {
    const fetchSpy = mockFetchJson({ token: 't', email: 'a@b.com', public_slug: 'abc123' }, true, 201)
    await register('a@b.com', 'Secret123', true)
    expect(fetchSpy.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ email: 'a@b.com', password: 'Secret123', terms_accepted: true }),
    )

    mockFetchJson({ services: [] })
    const pubSpy = vi.mocked(globalThis.fetch)
    await getPublicStatus('ab cd')
    expect(pubSpy).toHaveBeenCalledWith('/api/public/status/ab%20cd', expect.any(Object))
  })
})
