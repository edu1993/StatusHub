import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as api from '../api'
import type { ApiIncident } from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    getServices: vi.fn().mockResolvedValue([]),
    getIncidents: vi.fn().mockResolvedValue([]),
    getIncidentsPaginated: vi.fn(),
    getPublicStatusSettings: vi.fn().mockResolvedValue({ public_slug: "abcdef1234567890", public_status_enabled: false }),
    updatePublicStatusSettings: vi.fn().mockResolvedValue({ public_slug: "abcdef1234567890", public_status_enabled: true }),
    downloadIncidents: vi.fn(),
  }
})

const page1Items: ApiIncident[] = [
  {
    id: 101,
    date: '2026-11-18 14:00:00',
    resolved_at: '2026-11-18 14:22:00',
    service_name: 'API Core',
    url: 'https://core.test/health',
    status: 'Resuelto',
    http_code: 500,
    latency: 0,
    description: 'Internal Server Error',
  },
  {
    id: 102,
    date: '2026-11-19 10:00:00',
    resolved_at: null,
    service_name: 'API Core',
    url: 'https://core.test/health',
    status: 'Abierto',
    http_code: null,
    latency: 0,
    description: 'DNS resolution failed',
  },
]

const page2Items: ApiIncident[] = [
  {
    id: 90,
    date: '2026-11-10 09:00:00',
    resolved_at: '2026-11-10 09:10:00',
    service_name: 'Billing',
    url: 'https://billing.test/health',
    status: 'Resuelto',
    http_code: 502,
    latency: 0,
    description: 'Bad Gateway',
  },
]

describe('Historial de Incidentes — Paginación y modal con fecha/hora de detectado y resuelto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('statushub_token', 'valid-token')
    localStorage.setItem('statushub_email', 'edu@statushub.test')
    localStorage.setItem('statushub_public_slug', 'abcdef1234567890')

    vi.mocked(api.getIncidentsPaginated).mockImplementation(async (params) => {
      if (params.page === 2) {
        return {
          items: page2Items,
          total: 25,
          page: 2,
          limit: params.limit,
          totalPages: 3,
          serverPaginated: true,
          services: ['API Core', 'Billing'],
        }
      }
      return {
        items: page1Items,
        total: 25,
        page: 1,
        limit: params.limit,
        totalPages: 3,
        serverPaginated: true,
        services: ['API Core', 'Billing'],
      }
    })
  })

  it('pagina el listado de incidentes y solicita la página siguiente a la API', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Historial de Incidentes/i }))

    expect(await screen.findByText('Mostrando 1–10 de 25 registros')).toBeInTheDocument()
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Página siguiente/i }))

    await waitFor(() => {
      expect(api.getIncidentsPaginated).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 10 }))
    })
    expect(await screen.findByText('Bad Gateway')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 11–20 de 25 registros')).toBeInTheDocument()
  })

  it('muestra tanto la fecha/hora de detectado como la de resuelto en el modal de incidente', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Historial de Incidentes/i }))
    await screen.findByText('Internal Server Error')

    // Incidente resuelto
    await user.click(screen.getByText('Internal Server Error'))
    expect(screen.getByText('Detectado (Fecha y Hora)')).toBeInTheDocument()
    expect(screen.getByText('Resuelto (Fecha y Hora)')).toBeInTheDocument()
    expect(screen.getAllByText('2026-11-18 14:00:00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2026-11-18 14:22:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cerrar/i }))

    // Incidente abierto
    await user.click(screen.getByText('DNS resolution failed'))
    expect(screen.getByText('En curso (Abierto)')).toBeInTheDocument()
  })
})
