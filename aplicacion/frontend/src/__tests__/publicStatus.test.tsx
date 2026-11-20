import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as api from '../api'
import type { ApiService } from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    getPublicStatus: vi.fn(),
  }
})

const publicService: ApiService = {
  id: 10,
  name: 'Portal Clientes',
  url: 'https://portal.statushub.test',
  check_interval: 0,
  is_public: true,
  status: 'up',
  uptime: 99.98,
  status_code: 200,
  latency: 64,
  error_message: null,
  last_checked: '2026-11-19 20:00:00',
  recent_checks: [
    { timestamp: '19:00', hour_start: '2026-11-19 19:00:00', latency: 62, status_code: 200, status: 'up', error_message: null },
    { timestamp: '20:00', hour_start: '2026-11-19 20:00:00', latency: 64, status_code: 200, status: 'up', error_message: null },
  ],
}

describe('Página Pública — Estado vacío, marca personalizada, aislamiento compartido y gráfico de latencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/status/abcdef1234567890')
  })

  it('NO muestra ningún mensaje ni banner cuando no hay servicios públicos configurados', async () => {
    vi.mocked(api.getPublicStatus).mockResolvedValueOnce({ company_name: 'Análisis S.A.', services: [] })

    render(<App />)

    await waitFor(() => {
      expect(api.getPublicStatus).toHaveBeenCalledWith('abcdef1234567890')
    })

    expect(screen.getByRole('heading', { name: 'Análisis S.A.' })).toBeInTheDocument()
    expect(screen.queryByText(/No se encontraron servicios públicos/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Todos los sistemas están operativos/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Buscar servicio/i)).not.toBeInTheDocument()
  })

  it('oculta Volver al Admin y no renderiza enlace clickeable al endpoint cuando se abre por enlace directo', async () => {
    // Incluso con sesión activa en el navegador, abrir el enlace directo entra en modo público puro
    localStorage.setItem('statushub_token', 'active-token')
    localStorage.setItem('statushub_email', 'edu@statushub.test')
    localStorage.setItem('statushub_public_slug', 'abcdef1234567890')
    vi.mocked(api.getPublicStatus).mockResolvedValueOnce({ company_name: 'La Anónima', services: [publicService] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'La Anónima' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Volver al Admin/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /portal\.statushub\.test/i })).not.toBeInTheDocument()
    expect(screen.getByText('https://portal.statushub.test')).toBeInTheDocument()
  })

  it('abre el modal de latencia en portal y se cierra con Escape', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getPublicStatus).mockResolvedValueOnce({ company_name: 'Análisis S.A.', services: [publicService] })

    render(<App />)

    expect(await screen.findByText('Todos los sistemas están operativos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Abrir detalle de latencia de Portal Clientes/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Latencia · Últimas 24 Horas/i)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
