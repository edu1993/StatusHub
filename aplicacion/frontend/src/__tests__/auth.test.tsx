import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as api from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getServices: vi.fn().mockResolvedValue([]),
    getIncidents: vi.fn().mockResolvedValue([]),
  }
})

describe('Autenticación — Login, Registro, Recuperación y Reset Password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('valida campos obligatorios en Login, marca borde rojo y muestra mensajes debajo de cada campo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Ingresar/i }))

    const emailInput = screen.getByLabelText(/Correo electrónico/i)
    const passwordInput = screen.getByLabelText(/^Contraseña$/i)

    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput).toHaveClass('invalid')
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput).toHaveClass('invalid')
    expect(screen.getByText('El correo electrónico es obligatorio.')).toBeInTheDocument()
    expect(screen.getByText('La contraseña es obligatoria.')).toBeInTheDocument()
    expect(api.login).not.toHaveBeenCalled()
  })

  it('valida todos los campos obligatorios y reglas de contraseña en Registro', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: /Registrarme/i }))
    await user.click(screen.getByRole('button', { name: /Registrarse/i }))

    expect(screen.getByText('El correo electrónico es obligatorio.')).toBeInTheDocument()
    expect(screen.getByText('La contraseña es obligatoria.')).toBeInTheDocument()
    expect(screen.getByText('Debes confirmar tu contraseña.')).toBeInTheDocument()
    expect(screen.getByText('Debes aceptar los términos y condiciones para registrarte.')).toBeInTheDocument()

    // Contraseña débil (sin mayúscula ni número)
    await user.type(screen.getByLabelText(/Correo electrónico/i), 'qa@statushub.test')
    await user.type(screen.getByLabelText(/^Contraseña$/i), 'debil12')
    await user.type(screen.getByLabelText(/Confirmar contraseña/i), 'otra1234')
    await user.click(screen.getByRole('button', { name: /Registrarse/i }))

    expect(
      screen.getByText('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(api.register).not.toHaveBeenCalled()
  })

  it('muestra mensajes custom con borde rojo en Olvidaste tu contraseña y maneja error del servidor', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /¿Olvidaste la contraseña\?/i }))
    await user.click(screen.getByRole('button', { name: /Enviar enlace/i }))

    const recoveryInput = screen.getByLabelText(/Correo electrónico/i, { selector: '#recovery-email' })
    expect(recoveryInput).toHaveClass('invalid')
    expect(recoveryInput).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText('El correo electrónico es obligatorio para enviar el enlace de recuperación.'),
    ).toBeInTheDocument()

    // Formato de correo inválido
    await user.type(recoveryInput, 'correo-invalido')
    await user.click(screen.getByRole('button', { name: /Enviar enlace/i }))
    expect(screen.getByText('Ingresa un correo electrónico válido (ej: admin@empresa.com).')).toBeInTheDocument()

    // Correo válido con fallo de red => mensaje custom en español
    vi.mocked(api.forgotPassword).mockRejectedValueOnce(new Error('Failed to fetch'))
    await user.clear(recoveryInput)
    await user.type(recoveryInput, 'qa@empresa.com')
    await user.click(screen.getByRole('button', { name: /Enviar enlace/i }))

    expect(
      await screen.findByText(
        'No pudimos procesar la solicitud de recuperación en este momento. Intenta nuevamente en unos minutos.',
      ),
    ).toBeInTheDocument()
  })

  it('renderiza la pantalla de Nueva contraseña al abrir /reset-password?token=... y valida la contraseña', async () => {
    const user = userEvent.setup()
    const validToken = 'a'.repeat(64)
    window.history.replaceState({}, '', `/reset-password?token=${validToken}`)
    vi.mocked(api.resetPassword).mockResolvedValueOnce({ message: 'OK' })

    render(<App />)

    expect(screen.getByRole('heading', { name: /Nueva contraseña/i })).toBeInTheDocument()

    // Envío vacío marca errores
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/i }))
    expect(screen.getByText('La nueva contraseña es obligatoria.')).toBeInTheDocument()

    // Contraseña válida
    await user.type(screen.getByLabelText(/^Contraseña$/i), 'NuevaPass2026')
    await user.type(screen.getByLabelText(/Confirmar contraseña/i), 'NuevaPass2026')
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/i }))

    await waitFor(() => {
      expect(api.resetPassword).toHaveBeenCalledWith(validToken, 'NuevaPass2026')
    })
    expect(await screen.findByText(/La contraseña se actualizó correctamente/i)).toBeInTheDocument()
  })
})
