import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as api from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    getServices: vi.fn().mockResolvedValue([]),
    getIncidents: vi.fn().mockResolvedValue([]),
    getPublicStatusSettings: vi.fn(),
    updatePublicStatusSettings: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  }
})

describe('Configuración — Página pública obligatoria, preferencias, cambio de contraseña y baja de cuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('statushub_token', 'valid-token')
    localStorage.setItem('statushub_email', 'edu@statushub.test')
    localStorage.setItem('statushub_public_slug', 'abcdef1234567890')

    vi.mocked(api.getPublicStatusSettings).mockResolvedValue({
      public_slug: 'abcdef1234567890',
      public_status_enabled: false,
      public_page_name: null,
    })
  })

  it('exige obligatoriamente el nombre de organización al intentar habilitar la página pública', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Configuración/i }))
    await screen.findByText(/Página de Estado Pública/i)

    await user.click(screen.getByLabelText(/Habilitar página pública de estado/i))
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    const nameInput = screen.getByLabelText(/Nombre de la organización/i)
    expect(nameInput).toHaveClass('invalid')
    expect(screen.getByText('El nombre de la organización es obligatorio para activar la página pública.')).toBeInTheDocument()
    expect(api.updatePublicStatusSettings).not.toHaveBeenCalled()

    vi.mocked(api.updatePublicStatusSettings).mockResolvedValueOnce({
      public_slug: 'abcdef1234567890',
      public_status_enabled: true,
      public_page_name: 'Análisis S.A.',
    })
    await user.type(nameInput, 'Análisis S.A.')
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => {
      expect(api.updatePublicStatusSettings).toHaveBeenCalledWith({
        public_status_enabled: true,
        public_page_name: 'Análisis S.A.',
      })
    })
    expect(await screen.findByText('Configuración de página pública guardada.')).toBeInTheDocument()
  })

  it('persiste preferencias del panel en localStorage y valida el cambio de contraseña', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Configuración/i }))

    await user.selectOptions(screen.getByLabelText(/Actualización automática del Dashboard/i), '60')
    await user.selectOptions(screen.getByLabelText(/Vista predeterminada de servicios/i), 'list')
    expect(localStorage.getItem('statushub_pref_refresh')).toBe('60')
    expect(localStorage.getItem('statushub_pref_layout')).toBe('list')

    // Validación de cambio de contraseña con campos vacíos
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/i }))
    expect(screen.getByText('Ingresa tu contraseña actual.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la nueva contraseña.')).toBeInTheDocument()
    expect(api.changePassword).not.toHaveBeenCalled()
  })

  it('permite darse de baja con contraseña y confirmación final, cerrando sesión', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deleteAccount).mockResolvedValueOnce({ message: 'Cuenta eliminada.' })
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Configuración/i }))

    // Sin contraseña marca error
    await user.click(screen.getByRole('button', { name: /Eliminar mi cuenta definitivamente/i }))
    expect(screen.getByText('Ingresa tu contraseña actual para confirmar la baja.')).toBeInTheDocument()

    // Con contraseña abre modal de confirmación y ejecuta DELETE /api/account
    await user.type(screen.getByLabelText(/Confirma tu contraseña actual/i), 'MiClave2026')
    await user.click(screen.getByRole('button', { name: /Eliminar mi cuenta definitivamente/i }))

    expect(await screen.findByRole('heading', { name: /Confirmar baja definitiva/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Eliminar$/i }))

    await waitFor(() => {
      expect(api.deleteAccount).toHaveBeenCalledWith('MiClave2026')
    })
    expect(await screen.findByText(/Tu cuenta y todos tus datos fueron eliminados correctamente/i)).toBeInTheDocument()
    expect(localStorage.getItem('statushub_token')).toBeNull()
  })
})
