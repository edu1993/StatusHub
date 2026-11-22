import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as api from '../api'
import type { ApiIncident, ApiService } from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    getServices: vi.fn(),
    getIncidents: vi.fn(),
    getIncidentsPaginated: vi.fn(),
    getPublicStatusSettings: vi.fn().mockResolvedValue({ public_slug: "abcdef1234567890", public_status_enabled: false }),
    updatePublicStatusSettings: vi.fn().mockResolvedValue({ public_slug: "abcdef1234567890", public_status_enabled: true }),
    getServiceHourChecks: vi.fn(),
  }
})

const mockServices: ApiService[] = [
  {
    id: 1,
    name: 'API Core',
    url: 'https://core.statushub.test/health',
    check_interval: 60,
    is_public: true,
    status: 'up',
    uptime: 99.95,
    status_code: 200,
    latency: 84,
    error_message: null,
    last_checked: '2026-11-19 20:00:00',
    recent_checks: [
      { timestamp: '19:00', hour_start: '2026-11-19 19:00:00', latency: 80, status_code: 200, status: 'up', error_message: null },
      { timestamp: '20:00', hour_start: '2026-11-19 20:00:00', latency: 90, status_code: 200, status: 'up', error_message: null },
    ],
  },
  {
    id: 2,
    name: 'Pasarela Pagos',
    url: 'https://pagos.statushub.test/health',
    check_interval: 30,
    is_public: false,
    status: 'down',
    uptime: 94.5,
    status_code: 503,
    latency: 0,
    error_message: 'HTTP 503',
    last_checked: '2026-11-19 20:00:00',
    recent_checks: [
      { timestamp: '19:00', hour_start: '2026-11-19 19:00:00', latency: 110, status_code: 200, status: 'up', error_message: null },
      { timestamp: '20:00', hour_start: '2026-11-19 20:00:00', latency: 0, status_code: 503, status: 'down', error_message: 'HTTP 503' },
    ],
  },
]

const mockOpenIncidents: ApiIncident[] = [
  {
    id: 77,
    date: '2026-11-19 19:58:00',
    resolved_at: null,
    service_name: 'Pasarela Pagos',
    url: 'https://pagos.statushub.test/health',
    status: 'Abierto',
    http_code: 503,
    latency: 0,
    description: 'El servicio respondió con HTTP 503.',
  },
]

function seedSession() {
  localStorage.setItem('statushub_token', 'valid-token')
  localStorage.setItem('statushub_email', 'edu@statushub.test')
  localStorage.setItem('statushub_public_slug', 'abcdef1234567890')
}

describe('Dashboard — Disponibilidad histórica, vista Grilla/Listado, modal de detalle y Notificaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedSession()
    vi.mocked(api.getServices).mockResolvedValue(mockServices)
    vi.mocked(api.getIncidents).mockResolvedValue(mockOpenIncidents)
    vi.mocked(api.getIncidentsPaginated).mockResolvedValue({
      items: mockOpenIncidents,
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      serverPaginated: true,
      services: ['API Core', 'Pasarela Pagos'],
    })
  })

  it('renderiza el gráfico de Disponibilidad Histórica (24 hs) con métricas agregadas reales', async () => {
    render(<App />)

    expect(await screen.findByText(/Disponibilidad Histórica \(Últimas 24 hs\)/i)).toBeInTheDocument()
    // 3 checks up de 4 totales => 75.00% en 24 hs, 1/2 hs sin fallos
    expect(screen.getByText('75.00% en 24 hs')).toBeInTheDocument()
    expect(screen.getByText('1/2 hs sin fallos')).toBeInTheDocument()
  })

  it('permite alternar entre Grilla y Listado y abre el modal de detalle con gráficos embebidos en document.body', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getServiceHourChecks).mockResolvedValueOnce([
      { timestamp: '20:05', hour_start: '2026-11-19 20:00:00', latency: 85, status_code: 200, status: 'up', error_message: null },
    ])

    const { container } = render(<App />)
    await screen.findByText('API Core')

    expect(container.querySelector('.monitored-grid')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Listado/i }))
    expect(container.querySelector('.monitored-list')).toBeInTheDocument()

    // Abrir modal de detalle haciendo clic directamente en la fila del servicio
    expect(screen.queryByRole('button', { name: /Detalle y gráficos/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ver detalle y gráficos de API Core/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/Latencia · Últimas 24 Horas/i)).toBeInTheDocument()

    // Drill-down a minuto a minuto mediante el selector de hora
    const hourSelect = screen.getByLabelText(/Ir a hora/i)
    await user.selectOptions(hourSelect, '2026-11-19 20:00:00')

    await waitFor(() => {
      expect(api.getServiceHourChecks).toHaveBeenCalledWith(1, '2026-11-19 20:00:00')
    })
    expect(await screen.findByText(/Minuto a Minuto/i)).toBeInTheDocument()
  })

  it('muestra "No se encontraron servicios." fuera del grid (ancho completo) cuando la búsqueda no coincide', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await screen.findByText('API Core')

    const searchInput = screen.getByPlaceholderText(/Buscar servicio por nombre o URL/i)
    await user.type(searchInput, 'inexistente-xyz')

    const emptyMsg = await screen.findByText('No se encontraron servicios.')
    expect(emptyMsg).toBeInTheDocument()
    expect(container.querySelector('.monitored-grid')).not.toBeInTheDocument()
  })

  it('abre popover al clickear Notificaciones y navega al Historial de Incidentes al clickear un item', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('API Core')

    // Click en campana abre popover, no navega aún
    const bellBtn = screen.getByRole('button', { name: /notificaciones de incidentes abiertos/i })
    await user.click(bellBtn)

    expect(screen.getByRole('dialog', { name: /Notificaciones recientes/i })).toBeInTheDocument()
    expect(screen.getByText('El servicio respondió con HTTP 503.')).toBeInTheDocument()

    // Click en la notificación lleva al Historial de Incidentes y abre el detalle
    await user.click(screen.getByText('El servicio respondió con HTTP 503.'))

    expect(await screen.findByRole('heading', { name: /Registro de Incidentes/i })).toBeInTheDocument()
    expect(await screen.findByText(/Incidente #77/i)).toBeInTheDocument()
  })
})
