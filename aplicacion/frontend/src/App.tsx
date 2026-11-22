import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  changePassword,
  deleteAccount,
  deleteService as removeService,
  downloadIncidents,
  forgotPassword,
  getIncidentResolvedAt,
  getIncidents,
  getIncidentsPaginated,
  getPublicStatus,
  getPublicStatusSettings,
  getServices,
  updatePublicStatusSettings,
  login,
  register,
  resetPassword,
  saveService as persistService,
} from './api'
import type { ApiIncident, ApiService, AuthResult, FailureType, ServiceInput } from './api'
import AvailabilityChart from './AvailabilityChart'
import Icon from './Icon'
import LatencyChart from './LatencyChart'
import './App.css'

type AuthMode = 'login' | 'register'
type DashboardView = 'dashboard' | 'service-form' | 'incidents' | 'settings'
type ServiceLayoutMode = 'grid' | 'list'
type Session = Pick<AuthResult, 'token' | 'email' | 'public_slug'>

type AuthFieldErrors = {
  email?: string
  password?: string
  confirmation?: string
  terms?: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const token = localStorage.getItem('statushub_token')
    const email = localStorage.getItem('statushub_email')
    const publicSlug = localStorage.getItem('statushub_public_slug')
    return token && email && publicSlug ? { token, email, public_slug: publicSlug } : null
  })
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [publicSlug, setPublicSlug] = useState(() => readPublicSlug())
  const [openedFromAdmin, setOpenedFromAdmin] = useState(false)
  const [resetToken, setResetToken] = useState(() => readResetToken())
  const [dashboardView, setDashboardView] = useState<DashboardView>('dashboard')
  const [openNotifications, setOpenNotifications] = useState<ApiIncident[]>([])
  const [pendingIncident, setPendingIncident] = useState<ApiIncident | null>(null)

  useEffect(() => {
    const syncRoute = () => {
      setPublicSlug(readPublicSlug())
      setResetToken(readResetToken())
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const logout = useCallback((notice = '') => {
    localStorage.removeItem('statushub_token')
    localStorage.removeItem('statushub_email')
    localStorage.removeItem('statushub_public_slug')
    setSession(null)
    setOpenNotifications([])
    setPendingIncident(null)
    setDashboardView('dashboard')
    if (notice) setAuthNotice(notice)
  }, [])

  const updateSessionToken = useCallback((token: string) => {
    localStorage.setItem('statushub_token', token)
    setSession((current) => (current ? { ...current, token } : null))
  }, [])

  async function authenticate(payload: { email: string; password: string; termsAccepted: boolean }) {
    setAuthBusy(true)
    setAuthError('')
    setAuthNotice('')
    try {
      const result = authMode === 'login'
        ? await login(payload.email, payload.password)
        : await register(payload.email, payload.password, payload.termsAccepted)
      storeSession(result)
      setSession(result)
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : authMode === 'login'
            ? 'No fue posible iniciar sesión. Verifica tus credenciales.'
            : 'No fue posible completar el registro.',
      )
    } finally {
      setAuthBusy(false)
    }
  }

  function showPublicPage(slug: string) {
    window.history.pushState({}, '', `/status/${slug}`)
    setOpenedFromAdmin(true)
    setPublicSlug(slug)
  }

  function handleSelectNotification(incident: ApiIncident) {
    setPendingIncident(incident)
    setDashboardView('incidents')
  }

  if (publicSlug) {
    return (
      <PublicStatusPage
        slug={publicSlug}
        isAuthenticated={Boolean(session) && openedFromAdmin}
        onBack={() => {
          window.history.pushState({}, '', '/')
          setOpenedFromAdmin(false)
          setPublicSlug('')
        }}
      />
    )
  }

  if (resetToken) {
    return (
      <PasswordResetScreen
        token={resetToken}
        onComplete={() => {
          window.history.replaceState({}, '', '/')
          setResetToken('')
          logout()
        }}
      />
    )
  }

  if (session) {
    return (
      <AdminLayout
        session={session}
        currentView={dashboardView}
        onNavigate={setDashboardView}
        onLogout={logout}
        onShowPublic={() => showPublicPage(session.public_slug)}
        notifications={openNotifications}
        onSelectNotification={handleSelectNotification}
      >
        <Dashboard
          session={session}
          view={dashboardView}
          onNavigate={setDashboardView}
          onLogout={logout}
          onShowPublic={() => showPublicPage(session.public_slug)}
          onSessionTokenUpdate={updateSessionToken}
          onNotificationsChange={setOpenNotifications}
          pendingIncident={pendingIncident}
          onConsumePendingIncident={() => setPendingIncident(null)}
        />
      </AdminLayout>
    )
  }

  return (
    <AuthScreen
      mode={authMode}
      error={authError}
      notice={authNotice}
      busy={authBusy}
      onAuthenticate={authenticate}
      onModeChange={(mode) => {
        setAuthMode(mode)
        setAuthError('')
      }}
    />
  )
}

function formatDowntime(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '—'
  if (seconds <= 0) return '0 s'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs} h ${mins} m`
  if (mins > 0) return `${mins} m ${secs} s`
  return `${secs} s`
}

function formatFailureType(type?: FailureType | null): string {
  const labels: Record<FailureType, string> = {
    dns: 'DNS',
    ssl: 'SSL / TLS',
    http: 'HTTP 5xx',
    timeout: 'Timeout',
    connection: 'Conexión',
    unknown: 'Desconocido',
  }
  return type ? labels[type] ?? type : '—'
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/)
  if (!match) return trimmed
  const [, year, month, day, time] = match
  return time ? `${day}/${month}/${year} ${time}` : `${day}/${month}/${year}`
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback debajo
  }
  try {
    const input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(input)
    return ok
  } catch {
    return false
  }
}

function readPublicSlug(): string {
  return window.location.pathname.match(/^\/status\/([a-f0-9]{16})$/i)?.[1] ?? ''
}

function readResetToken(): string {
  return window.location.pathname === '/reset-password'
    ? new URLSearchParams(window.location.search).get('token') ?? ''
    : ''
}

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  }
}

function isStrongPassword(password: string): boolean {
  const checks = getPasswordChecks(password)
  return checks.length && checks.upper && checks.lower && checks.number
}

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])
  return debouncedValue
}

function storeSession(result: AuthResult) {
  localStorage.setItem('statushub_token', result.token)
  localStorage.setItem('statushub_email', result.email)
  localStorage.setItem('statushub_public_slug', result.public_slug)
}

function AuthScreen({
  mode,
  error,
  notice,
  busy,
  onAuthenticate,
  onModeChange,
}: {
  mode: AuthMode
  error: string
  notice?: string
  busy: boolean
  onAuthenticate: (payload: { email: string; password: string; termsAccepted: boolean }) => Promise<void>
  onModeChange: (mode: AuthMode) => void
}) {
  const isRegistering = mode === 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [showTerms, setShowTerms] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)

  const passwordChecks = getPasswordChecks(password)

  function switchMode(nextMode: AuthMode) {
    setFieldErrors({})
    onModeChange(nextMode)
  }

  function clearFieldError(field: keyof AuthFieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const errors: AuthFieldErrors = {}

    if (!trimmedEmail) {
      errors.email = 'El correo electrónico es obligatorio.'
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Ingresa un correo electrónico válido (ej: admin@empresa.com).'
    }

    if (!password) {
      errors.password = 'La contraseña es obligatoria.'
    } else if (isRegistering && !isStrongPassword(password)) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'
    }

    if (isRegistering) {
      if (!confirmation) {
        errors.confirmation = 'Debes confirmar tu contraseña.'
      } else if (password !== confirmation) {
        errors.confirmation = 'Las contraseñas no coinciden.'
      }
      if (!termsAccepted) {
        errors.terms = 'Debes aceptar los términos y condiciones para registrarte.'
      }
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    void onAuthenticate({
      email: trimmedEmail,
      password,
      termsAccepted,
    })
  }

  return (
    <main className="auth-page">
      <div className="auth-top-line" />
      <section className="auth-card">
        <header className="auth-heading">
          <div className="auth-logo"><Icon name="activity" /></div>
          <h1>{isRegistering ? 'Crear Cuenta' : 'Bienvenido a StatusHub'}</h1>
          <p>{isRegistering ? 'Comienza a monitorear tu infraestructura hoy' : 'Inicia sesión para gestionar tus servicios'}</p>
        </header>

        <div className="auth-tabs" role="tablist" aria-label="Tipo de acceso">
          <button
            type="button"
            className={!isRegistering ? 'active' : ''}
            onClick={() => switchMode('login')}
            role="tab"
            aria-selected={!isRegistering}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={isRegistering ? 'active' : ''}
            onClick={() => switchMode('register')}
            role="tab"
            aria-selected={isRegistering}
          >
            Registrarme
          </button>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <div className="auth-field">
            <label htmlFor="email">Correo electrónico</label>
            <div className="auth-input-wrap">
              <Icon name="globe" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@empresa.com"
                value={email}
                className={fieldErrors.email ? 'invalid' : ''}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clearFieldError('email')
                }}
              />
            </div>
            {fieldErrors.email && <span id="auth-email-error" className="field-error" role="alert">{fieldErrors.email}</span>}
          </div>

          <div className="auth-field">
            <label htmlFor="password">Contraseña</label>
            <div className="auth-input-wrap">
              <Icon name="lock" />
              <input
                id="password"
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                placeholder={isRegistering ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                value={password}
                className={fieldErrors.password ? 'invalid' : ''}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                onChange={(event) => {
                  setPassword(event.target.value)
                  clearFieldError('password')
                  if (confirmation && event.target.value === confirmation) clearFieldError('confirmation')
                }}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={passwordVisible}
              >
                <Icon name={passwordVisible ? 'eyeOff' : 'eye'} />
                <span>{passwordVisible ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>
            {fieldErrors.password && <span id="auth-password-error" className="field-error" role="alert">{fieldErrors.password}</span>}
          </div>

          {isRegistering && (
            <>
              <ul className="password-rules" aria-label="Requisitos de contraseña">
                <li className={passwordChecks.length ? 'met' : ''}>Mínimo 8 caracteres</li>
                <li className={passwordChecks.upper ? 'met' : ''}>Una mayúscula</li>
                <li className={passwordChecks.lower ? 'met' : ''}>Una minúscula</li>
                <li className={passwordChecks.number ? 'met' : ''}>Un número</li>
              </ul>

              <div className="auth-field">
                <label htmlFor="password-confirm">Confirmar contraseña</label>
                <div className="auth-input-wrap">
                  <Icon name="lock" />
                  <input
                    id="password-confirm"
                    name="password-confirm"
                    type={confirmationVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repite tu contraseña"
                    value={confirmation}
                    className={fieldErrors.confirmation ? 'invalid' : ''}
                    aria-invalid={Boolean(fieldErrors.confirmation)}
                    aria-describedby={fieldErrors.confirmation ? 'auth-confirm-error' : undefined}
                    onChange={(event) => {
                      setConfirmation(event.target.value)
                      clearFieldError('confirmation')
                    }}
                  />
                  <button
                    className="password-visibility-toggle"
                    type="button"
                    onClick={() => setConfirmationVisible((visible) => !visible)}
                    aria-label={confirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                    aria-pressed={confirmationVisible}
                  >
                    <Icon name={confirmationVisible ? 'eyeOff' : 'eye'} />
                    <span>{confirmationVisible ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </div>
                {fieldErrors.confirmation && <span id="auth-confirm-error" className="field-error" role="alert">{fieldErrors.confirmation}</span>}
              </div>

              <div className="auth-field">
                <label className={`terms-acceptance ${fieldErrors.terms ? 'invalid' : ''}`}>
                  <input
                    type="checkbox"
                    name="terms-accepted"
                    checked={termsAccepted}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    onChange={(event) => {
                      setTermsAccepted(event.target.checked)
                      clearFieldError('terms')
                    }}
                  />
                  <span>
                    Acepto los <button type="button" className="text-button" onClick={() => setShowTerms(true)}>Términos y condiciones</button>.
                  </span>
                </label>
                {fieldErrors.terms && <span className="field-error" role="alert">{fieldErrors.terms}</span>}
              </div>
            </>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Conectando…' : isRegistering ? 'Registrarse' : 'Ingresar'}
            <Icon name="chevronRight" />
          </button>

          {error && <p className="auth-error" role="alert">{error}</p>}

          {!isRegistering && (
            <button className="forgot-password-link" type="button" onClick={() => setShowRecovery(true)}>
              ¿Olvidaste la contraseña?
            </button>
          )}

          <p className="auth-footnote">
            {isRegistering
              ? 'Al crear una cuenta, tus servicios quedan guardados en StatusHub.'
              : 'Inicia sesión para administrar tus servicios e incidentes.'}
          </p>
        </form>
      </section>

      {showTerms && (
        <InfoModal title="Términos y Condiciones de Uso (Software Libre)" onClose={() => setShowTerms(false)}>
          <TermsContent />
        </InfoModal>
      )}

      {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} />}
    </main>
  )
}

function RecoveryModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [simulated, setSimulated] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailError('')
    setServerError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError('El correo electrónico es obligatorio para enviar el enlace de recuperación.')
      return
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Ingresa un correo electrónico válido (ej: admin@empresa.com).')
      return
    }

    setBusy(true)
    try {
      const result = await forgotPassword(trimmed)
      setSent(true)
      setSimulated(result.simulated)
    } catch (requestError) {
      const rawMessage = requestError instanceof Error ? requestError.message : ''
      setServerError(
        rawMessage && !rawMessage.toLowerCase().includes('failed to fetch')
          ? rawMessage
          : 'No pudimos procesar la solicitud de recuperación en este momento. Intenta nuevamente en unos minutos.',
      )
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="info-modal recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-modal-title">
        <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        <h2 id="recovery-modal-title">Recuperar contraseña</h2>
        {sent ? (
          <>
            <p>{simulated ? 'Si el correo está registrado, se generó un correo simulado.' : 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.'}</p>
            {simulated && (
              <p className="simulated-mail-note">
                Abre la <a href="http://localhost:8026/" target="_blank" rel="noopener noreferrer">bandeja local</a> para usar el enlace de recuperación.
              </p>
            )}
            <button className="primary-button" type="button" onClick={onClose}>
              <Icon name="arrowLeft" />Volver al inicio de sesión
            </button>
          </>
        ) : (
          <form className="recovery-form" onSubmit={(event) => void submit(event)} noValidate>
            <p>Ingresa el correo de tu cuenta para solicitar un enlace de recuperación de un solo uso, válido durante una hora.</p>
            <div className="auth-field">
              <label htmlFor="recovery-email">Correo electrónico</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                placeholder="admin@empresa.com"
                value={email}
                className={emailError ? 'invalid' : ''}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'recovery-email-error' : undefined}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (emailError) setEmailError('')
                  if (serverError) setServerError('')
                }}
              />
              {emailError && <span id="recovery-email-error" className="field-error" role="alert">{emailError}</span>}
            </div>
            {serverError && <p className="auth-error" role="alert">{serverError}</p>}
            <div className="confirm-modal-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body,
  )
}

function PasswordResetScreen({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmation?: string }>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)

  const passwordChecks = getPasswordChecks(password)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError('')
    const errors: { password?: string; confirmation?: string } = {}

    if (!password) {
      errors.password = 'La nueva contraseña es obligatoria.'
    } else if (!isStrongPassword(password)) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'
    }

    if (!confirmation) {
      errors.confirmation = 'Debes confirmar tu nueva contraseña.'
    } else if (password !== confirmation) {
      errors.confirmation = 'Las contraseñas no coinciden.'
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    try {
      await resetPassword(token, password)
      setCompleted(true)
    } catch (requestError) {
      setServerError(requestError instanceof Error ? requestError.message : 'No fue posible cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-top-line" />
      <section className="auth-card">
        <header className="auth-heading">
          <div className="auth-logo"><Icon name="lock" /></div>
          <h1>Nueva contraseña</h1>
          <p>Elige una contraseña segura para tu cuenta.</p>
        </header>
        {completed ? (
          <div className="reset-complete">
            <p>La contraseña se actualizó correctamente. Las sesiones anteriores se cerraron.</p>
            <button className="auth-submit" type="button" onClick={onComplete}>
              Ir a iniciar sesión
              <Icon name="chevronRight" />
            </button>
          </div>
        ) : (
          <form className="recovery-form reset-form" onSubmit={(event) => void submit(event)} noValidate>
            <div className="auth-field">
              <label htmlFor="reset-password">Contraseña</label>
              <div className="password-visibility-wrap">
                <input
                  id="reset-password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  className={fieldErrors.password ? 'invalid' : ''}
                  aria-invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setFieldErrors((current) => ({ ...current, password: undefined }))
                  }}
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={passwordVisible}
                >
                  <Icon name={passwordVisible ? 'eyeOff' : 'eye'} />
                  <span>{passwordVisible ? 'Ocultar' : 'Mostrar'}</span>
                </button>
              </div>
              {fieldErrors.password && <span className="field-error" role="alert">{fieldErrors.password}</span>}
            </div>

            <ul className="password-rules" aria-label="Requisitos de contraseña">
              <li className={passwordChecks.length ? 'met' : ''}>Mínimo 8 caracteres</li>
              <li className={passwordChecks.upper ? 'met' : ''}>Una mayúscula</li>
              <li className={passwordChecks.lower ? 'met' : ''}>Una minúscula</li>
              <li className={passwordChecks.number ? 'met' : ''}>Un número</li>
            </ul>

            <div className="auth-field">
              <label htmlFor="reset-password-confirm">Confirmar contraseña</label>
              <div className="password-visibility-wrap">
                <input
                  id="reset-password-confirm"
                  type={confirmationVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmation}
                  className={fieldErrors.confirmation ? 'invalid' : ''}
                  aria-invalid={Boolean(fieldErrors.confirmation)}
                  onChange={(event) => {
                    setConfirmation(event.target.value)
                    setFieldErrors((current) => ({ ...current, confirmation: undefined }))
                  }}
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  onClick={() => setConfirmationVisible((visible) => !visible)}
                  aria-label={confirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                  aria-pressed={confirmationVisible}
                >
                  <Icon name={confirmationVisible ? 'eyeOff' : 'eye'} />
                  <span>{confirmationVisible ? 'Ocultar' : 'Mostrar'}</span>
                </button>
              </div>
              {fieldErrors.confirmation && <span className="field-error" role="alert">{fieldErrors.confirmation}</span>}
            </div>

            {serverError && <p className="auth-error" role="alert">{serverError}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Cambiar contraseña'}
              <Icon name="chevronRight" />
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
        <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        <h2 id="info-modal-title">{title}</h2>
        <div className="info-modal-content">{children}</div>
        <button className="primary-button" type="button" onClick={onClose}>Entendido</button>
      </section>
    </div>,
    document.body,
  )
}

function AdminLayout({
  session,
  currentView,
  onNavigate,
  onLogout,
  onShowPublic,
  notifications,
  onSelectNotification,
  children,
}: {
  session: Session
  currentView: DashboardView
  onNavigate: (view: DashboardView) => void
  onLogout: () => void
  onShowPublic: () => void
  notifications: ApiIncident[]
  onSelectNotification: (incident: ApiIncident) => void
  children: ReactNode
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const headerActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentView])

  useEffect(() => {
    if (!profileMenuOpen && !notificationsOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      if (headerActionsRef.current && !headerActionsRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
        setNotificationsOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [notificationsOpen, profileMenuOpen])

  const notificationCount = notifications.length
  const titles: Record<DashboardView, string> = {
    dashboard: 'Dashboard',
    'service-form': 'Gestión de Servicio',
    incidents: 'Historial de Incidentes',
    settings: 'Configuración',
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand"><Icon name="activity" /><span>StatusHub</span></div>
        <nav className="admin-nav" aria-label="Navegación principal">
          <button className={currentView === 'dashboard' ? 'active' : ''} type="button" onClick={() => onNavigate('dashboard')}>
            <Icon name="dashboard" />Dashboard
          </button>
          <button className={currentView === 'service-form' ? 'active' : ''} type="button" onClick={() => onNavigate('service-form')}>
            <Icon name="server" />Alta de Servicio
          </button>
          <button className={currentView === 'incidents' ? 'active' : ''} type="button" onClick={() => onNavigate('incidents')}>
            <Icon name="alert" />Historial de Incidentes
          </button>
          <button className={currentView === 'settings' ? 'active' : ''} type="button" onClick={() => onNavigate('settings')}>
            <Icon name="settings" />Configuración
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button type="button" onClick={onShowPublic}><Icon name="external" />Ver Página Pública</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <h1>{titles[currentView]}</h1>
          <div className="admin-header-actions" ref={headerActionsRef}>
            <div className="notifications-wrap">
              <button
                className={`notification-button ${notificationsOpen ? 'active' : ''}`}
                type="button"
                aria-label={`${notificationCount} notificaciones de incidentes abiertos`}
                aria-expanded={notificationsOpen}
                title="Notificaciones de incidentes"
                onClick={() => {
                  setProfileMenuOpen(false)
                  setNotificationsOpen((open) => !open)
                }}
              >
                <Icon name="bell" />
                {notificationCount > 0 && <span>{notificationCount > 99 ? '99+' : notificationCount}</span>}
              </button>

              {notificationsOpen && (
                <div className="notifications-popover" role="dialog" aria-label="Notificaciones recientes">
                  <header className="notifications-popover-head">
                    <strong>Notificaciones</strong>
                    <span className={notificationCount > 0 ? 'notif-badge-count open' : 'notif-badge-count'}>
                      {notificationCount} {notificationCount === 1 ? 'abierto' : 'abiertos'}
                    </span>
                  </header>

                  {notificationCount === 0 ? (
                    <div className="notifications-empty">
                      <Icon name="checkCircle" />
                      <p>Todo está operativo. No hay incidentes abiertos en este momento.</p>
                    </div>
                  ) : (
                    <ul className="notifications-list">
                      {notifications.slice(0, 8).map((incident) => (
                        <li key={incident.id}>
                          <button
                            type="button"
                            className="notification-item"
                            onClick={() => {
                              setNotificationsOpen(false)
                              onSelectNotification(incident)
                            }}
                          >
                            <span className="notification-item-icon"><Icon name="alert" /></span>
                            <span className="notification-item-body">
                              <strong>{incident.service_name}</strong>
                              <span className="notification-item-desc">
                                {incident.description || (incident.http_code ? `Error HTTP ${incident.http_code}` : 'Fallo detectado en el chequeo')}
                              </span>
                              <small>{formatDateTime(incident.date)}</small>
                            </span>
                            <Icon className="notification-item-chevron" name="chevronRight" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <footer className="notifications-popover-foot">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false)
                        onNavigate('incidents')
                      }}
                    >
                      Ver historial de incidentes
                      <Icon name="chevronRight" />
                    </button>
                  </footer>
                </div>
              )}
            </div>

            <span className="header-divider" aria-hidden="true" />

            <div className="admin-user">
              <span>{session.email}</span>
              <button
                className="user-avatar"
                type="button"
                aria-label="Abrir menú de usuario"
                aria-expanded={profileMenuOpen}
                onClick={() => {
                  setNotificationsOpen(false)
                  setProfileMenuOpen((open) => !open)
                }}
              >
                {session.email.slice(0, 1).toUpperCase()}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <strong>{session.email}</strong>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); onLogout() }}>
                    <Icon name="logout" />Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="admin-content" ref={contentRef}>{children}</div>
      </main>
    </div>
  )
}

function Dashboard({
  session,
  view,
  onNavigate,
  onLogout,
  onShowPublic,
  onSessionTokenUpdate,
  onNotificationsChange,
  pendingIncident,
  onConsumePendingIncident,
}: {
  session: Session
  view: DashboardView
  onNavigate: (view: DashboardView) => void
  onLogout: (notice?: string) => void
  onShowPublic: () => void
  onSessionTokenUpdate: (token: string) => void
  onNotificationsChange: (openIncidents: ApiIncident[]) => void
  pendingIncident: ApiIncident | null
  onConsumePendingIncident: () => void
}) {
  const [services, setServices] = useState<ApiService[]>([])
  const [incidents, setIncidents] = useState<ApiIncident[]>([])
  const [editingService, setEditingService] = useState<ApiService | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<ApiIncident | null>(null)
  const [confirmingService, setConfirmingService] = useState<ApiService | null>(null)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceLayout, setServiceLayout] = useState<ServiceLayoutMode>(() =>
    localStorage.getItem('statushub_pref_layout') === 'list' ? 'list' : 'grid',
  )
  const [refreshSeconds, setRefreshSeconds] = useState<number>(() => {
    const saved = Number(localStorage.getItem('statushub_pref_refresh'))
    return Number.isFinite(saved) && [0, 15, 30, 60].includes(saved) ? saved : 30
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const debouncedServiceSearch = useDebouncedValue(serviceSearch)

  useEffect(() => {
    if (view === 'incidents' && pendingIncident) {
      setSelectedIncident(pendingIncident)
      onConsumePendingIncident()
    }
    if (view !== 'service-form') {
      setEditingService(null)
    }
  }, [onConsumePendingIncident, pendingIncident, view])

  const refreshDashboard = useCallback(async () => {
    try {
      const [serviceData, incidentData] = await Promise.all([getServices(), getIncidents()])
      setServices(serviceData)
      setIncidents(incidentData)
      onNotificationsChange(incidentData.filter((incident) => incident.status === 'Abierto'))
      setError('')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'No fue posible cargar el panel.'
      setError(message)
      if (message.includes('token') || message.includes('Autenticación')) onLogout()
    } finally {
      setLoading(false)
    }
  }, [onLogout, onNotificationsChange])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshDashboard(), 0)
    const refreshTimer = refreshSeconds > 0
      ? window.setInterval(() => void refreshDashboard(), refreshSeconds * 1000)
      : undefined
    return () => {
      window.clearTimeout(initialTimer)
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
    }
  }, [refreshDashboard, refreshSeconds])

  async function saveService(values: ServiceInput) {
    setBusy(true)
    setError('')
    try {
      await persistService(values, editingService?.id)
      setEditingService(null)
      onNavigate('dashboard')
      await refreshDashboard()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar el servicio.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteService(service: ApiService) {
    setBusy(true)
    setError('')
    try {
      await removeService(service.id)
      setConfirmingService(null)
      if (selectedServiceId === service.id) setSelectedServiceId(null)
      await refreshDashboard()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el servicio.')
    } finally {
      setBusy(false)
    }
  }

  function editService(service: ApiService | null) {
    setSelectedServiceId(null)
    setEditingService(service)
    setError('')
    onNavigate('service-form')
  }

  if (view === 'settings') {
    return (
      <SettingsView
        session={session}
        defaultLayout={serviceLayout}
        refreshSeconds={refreshSeconds}
        onChangeDefaultLayout={(layout) => {
          localStorage.setItem('statushub_pref_layout', layout)
          setServiceLayout(layout)
        }}
        onChangeRefreshSeconds={(secs) => {
          localStorage.setItem('statushub_pref_refresh', String(secs))
          setRefreshSeconds(secs)
        }}
        onShowPublic={onShowPublic}
        onTokenUpdated={onSessionTokenUpdate}
        onAccountDeleted={() => onLogout('Tu cuenta y todos tus datos fueron eliminados correctamente.')}
      />
    )
  }

  if (view === 'service-form') {
    return (
      <ServiceForm
        service={editingService}
        busy={busy}
        error={error}
        onCancel={() => {
          setError('')
          setEditingService(null)
          onNavigate('dashboard')
        }}
        onSave={(values) => void saveService(values)}
      />
    )
  }

  if (view === 'incidents') {
    return (
      <>
        <IncidentHistory
          serviceNames={services.map((s) => s.name)}
          onExport={async (filters) => {
            setError('')
            try {
              await downloadIncidents(filters)
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : 'No fue posible exportar los incidentes.')
            }
          }}
          onSelect={setSelectedIncident}
        />
        {error && <p className="dashboard-error" role="alert">{error}</p>}
        {selectedIncident && <IncidentModal incident={selectedIncident} onClose={() => setSelectedIncident(null)} />}
      </>
    )
  }

  const operationalServices = services.filter((service) => service.status === 'up').length
  const downServices = services.length - operationalServices
  const averageUptime = services.length
    ? services.reduce((total, service) => total + service.uptime, 0) / services.length
    : 100
  const openIncidents = incidents.filter((incident) => incident.status === 'Abierto').length
  const visibleServices = services.filter((service) =>
    `${service.name} ${service.url}`.toLowerCase().includes(debouncedServiceSearch.toLowerCase().trim()),
  )
  const selectedService = selectedServiceId === null
    ? null
    : services.find((item) => item.id === selectedServiceId) ?? null

  return (
    <div className="dashboard-screen">
      <div className="dashboard-welcome">
        <div>
          <p className="dashboard-eyebrow">MONITOREO EN TIEMPO REAL</p>
          <h2>Hola, {session.email.split('@')[0]}</h2>
          <p>Resumen del estado de tus servicios e infraestructura.</p>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refreshDashboard()} disabled={loading}>
          <Icon name="refresh" />Actualizar
        </button>
      </div>

      {error && <p className="dashboard-error" role="alert">{error}</p>}

      <div className="overview-grid">
        <article className="overview-card availability-card">
          <Icon className="overview-watermark" name="activity" />
          <h3>Disponibilidad Global</h3>
          <div className="overview-value">{averageUptime.toFixed(2)}%</div>
          <div className="overview-card-footer">
            <span className="overview-level">Últimos 30 días</span>
            <span>Promedio de todos los servicios</span>
          </div>
        </article>

        <article className="overview-card service-summary-card">
          <h3>Resumen de Servicios</h3>
          <div className="service-summary">
            <div><strong className="operational-count">{operationalServices}</strong><span>Operativos</span></div>
            <i />
            <div><strong className="down-count">{downServices}</strong><span>Caídos</span></div>
            <i />
            <div><strong className="summary-count">{services.length}</strong><span>Total</span></div>
          </div>
          <div className="overview-card-footer">
            <span>{openIncidents} incidentes abiertos</span>
            <span>{loading ? 'Actualizando…' : 'Actualizado automáticamente'}</span>
          </div>
        </article>
      </div>

      <AvailabilityChart services={services} />

      <section className="monitored-services">
        <div className="section-title-row">
          <h2><Icon name="server" />Servicios Monitoreados</h2>
          <div className="section-actions">
            <div className="view-mode-toggle" role="group" aria-label="Vista de servicios">
              <button
                type="button"
                className={serviceLayout === 'grid' ? 'active' : ''}
                onClick={() => setServiceLayout('grid')}
                aria-pressed={serviceLayout === 'grid'}
                title="Vista en grilla compacta"
              >
                <Icon name="grid" /><span>Grilla</span>
              </button>
              <button
                type="button"
                className={serviceLayout === 'list' ? 'active' : ''}
                onClick={() => setServiceLayout('list')}
                aria-pressed={serviceLayout === 'list'}
                title="Vista en listado"
              >
                <Icon name="list" /><span>Listado</span>
              </button>
            </div>
            <button className="primary-button" type="button" onClick={() => editService(null)}>
              <Icon name="plus" />Agregar Servicio
            </button>
          </div>
        </div>

        <label className="service-search">
          <Icon name="search" />
          <input
            type="search"
            value={serviceSearch}
            onChange={(event) => setServiceSearch(event.target.value)}
            placeholder="Buscar servicio por nombre o URL..."
          />
        </label>

        {loading && services.length === 0 ? (
          <p className="empty-panel">Cargando servicios…</p>
        ) : services.length === 0 ? (
          <p className="empty-panel">Todavía no tienes servicios. Agrega el primero para comenzar el monitoreo.</p>
        ) : visibleServices.length === 0 ? (
          <p className="empty-panel">No se encontraron servicios.</p>
        ) : serviceLayout === 'grid' ? (
          <div className="monitored-grid">
            {visibleServices.map((service) => (
              <ServiceCardCompact
                key={service.id}
                service={service}
                busy={busy}
                onOpenDetail={() => setSelectedServiceId(service.id)}
                onEdit={() => editService(service)}
                onDelete={() => setConfirmingService(service)}
              />
            ))}
          </div>
        ) : (
          <div className="monitored-list">
            {visibleServices.map((service) => (
              <ServiceListRow
                key={service.id}
                service={service}
                busy={busy}
                onOpenDetail={() => setSelectedServiceId(service.id)}
                onEdit={() => editService(service)}
                onDelete={() => setConfirmingService(service)}
              />
            ))}
          </div>
        )}

        {selectedService && (
          <ServiceDetailModal
            service={selectedService}
            incidents={incidents.filter((item) => item.service_name === selectedService.name)}
            busy={busy}
            onClose={() => setSelectedServiceId(null)}
            onEdit={() => editService(selectedService)}
            onDelete={() => {
              setSelectedServiceId(null)
              setConfirmingService(selectedService)
            }}
            onOpenIncident={(incident) => {
              setSelectedServiceId(null)
              setSelectedIncident(incident)
            }}
          />
        )}

        {confirmingService && (
          <ConfirmModal
            title="Eliminar servicio"
            message={`¿Estás seguro de que quieres eliminar “${confirmingService.name}”? Se borrarán también sus verificaciones e incidentes.`}
            busy={busy}
            error={error}
            onCancel={() => {
              setConfirmingService(null)
              setError('')
            }}
            onConfirm={() => void deleteService(confirmingService)}
          />
        )}
      </section>

      {selectedIncident && <IncidentModal incident={selectedIncident} onClose={() => setSelectedIncident(null)} />}
    </div>
  )
}

function ServiceCardCompact({
  service,
  busy,
  onOpenDetail,
  onEdit,
  onDelete,
}: {
  service: ApiService
  busy: boolean
  onOpenDetail: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isDown = service.status === 'down'
  const recent = service.recent_checks.slice(-16)
  const maxLatency = Math.max(...recent.map((c) => c.latency), 100)

  return (
    <article
      className={`service-card service-card-compact ${isDown ? 'service-card-down' : ''}`}
      onClick={onOpenDetail}
      tabIndex={0}
      role="button"
      aria-label={`Ver detalle y gráficos de ${service.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenDetail()
        }
      }}
    >
      <div className="service-card-top">
        <h3>{service.name}</h3>
        <span className={`service-state-badge ${isDown ? 'down' : 'up'}`}>
          <Icon name={isDown ? 'alert' : 'check'} />
          {isDown ? 'CAÍDO' : 'OPERATIVO'}
        </span>
      </div>

      <a
        className="service-url"
        href={service.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {service.url}
        <Icon name="external" />
      </a>

      <div className="service-compact-kpis">
        <div>
          <span>Estado</span>
          <strong>
            {service.status_code === null
              ? (service.error_message ?? 'Sin resp.')
              : `HTTP ${service.status_code}`}
          </strong>
        </div>
        <div>
          <span>Latencia</span>
          <strong className={isDown ? 'text-down' : ''}>
            {service.latency === null ? 'N/A' : `${service.latency} ms`}
          </strong>
        </div>
        <div>
          <span>Uptime</span>
          <strong>{service.uptime.toFixed(2)}%</strong>
        </div>
      </div>

      <div className="service-mini-sparkline" aria-hidden="true">
        {recent.length === 0 ? (
          <span className="mini-spark-empty">Sin verificaciones recientes</span>
        ) : (
          recent.map((check, index) => (
            <i
              key={`${check.hour_start}-${index}`}
              className={check.status === 'down' ? 'down' : ''}
              style={{ height: `${check.status === 'down' ? 100 : Math.max(14, (check.latency / maxLatency) * 100)}%` }}
            />
          ))
        )}
      </div>

      <div className="service-card-footer">
        <span
          className={`visibility-dot ${service.is_public ? 'public' : ''}`}
          title={service.is_public ? 'Visible en página pública' : 'Privado'}
        >
          <Icon name={service.is_public ? 'globe' : 'lock'} />
          <span>{service.is_public ? 'Público' : 'Privado'}</span>
        </span>
        <div className="service-card-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-btn" onClick={onEdit} disabled={busy} aria-label={`Editar ${service.name}`} title="Editar">
            <Icon name="edit" />
          </button>
          <button type="button" className="icon-btn danger" onClick={onDelete} disabled={busy} aria-label={`Eliminar ${service.name}`} title="Eliminar">
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </article>
  )
}

function ServiceListRow({
  service,
  busy,
  onOpenDetail,
  onEdit,
  onDelete,
}: {
  service: ApiService
  busy: boolean
  onOpenDetail: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isDown = service.status === 'down'
  return (
    <article
      className={`service-row ${isDown ? 'down' : ''}`}
      onClick={onOpenDetail}
      tabIndex={0}
      role="button"
      aria-label={`Ver detalle y gráficos de ${service.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenDetail()
        }
      }}
    >
      <div className="service-row-main">
        <span className={`service-state-badge ${isDown ? 'down' : 'up'}`}>
          <Icon name={isDown ? 'alert' : 'check'} />
          {isDown ? 'CAÍDO' : 'OPERATIVO'}
        </span>
        <div className="service-row-title">
          <h3>{service.name}</h3>
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {service.url}
            <Icon name="external" />
          </a>
        </div>
      </div>

      <div className="service-row-metrics">
        <div>
          <span>HTTP</span>
          <strong>{service.status_code ?? '—'}</strong>
        </div>
        <div>
          <span>Latencia</span>
          <strong className={isDown ? 'text-down' : ''}>{service.latency === null ? 'N/A' : `${service.latency} ms`}</strong>
        </div>
        <div>
          <span>Uptime (30d)</span>
          <strong>{service.uptime.toFixed(2)}%</strong>
        </div>
        <div>
          <span>Chequeo</span>
          <strong>{service.check_interval}s</strong>
        </div>
      </div>

      <div className="service-row-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={onEdit} disabled={busy} aria-label={`Editar ${service.name}`} title="Editar">
          <Icon name="edit" />
        </button>
        <button type="button" className="icon-btn danger" onClick={onDelete} disabled={busy} aria-label={`Eliminar ${service.name}`} title="Eliminar">
          <Icon name="trash" />
        </button>
      </div>
    </article>
  )
}

function ServiceDetailModal({
  service,
  incidents,
  busy,
  onClose,
  onEdit,
  onDelete,
  onOpenIncident,
}: {
  service: ApiService
  incidents: ApiIncident[]
  busy: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenIncident: (incident: ApiIncident) => void
}) {
  const isDown = service.status === 'down'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="chart-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="service-detail-modal" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
        <button className="chart-modal-close" type="button" onClick={onClose} aria-label="Cerrar detalle">
          <Icon name="close" />
        </button>

        <header className="service-detail-header">
          <div>
            <div className="service-detail-title-row">
              <h2 id="service-detail-title">{service.name}</h2>
              <span className={`service-state-badge ${isDown ? 'down' : 'up'}`}>
                <Icon name={isDown ? 'alert' : 'check'} />
                {isDown ? 'CAÍDO' : 'OPERATIVO'}
              </span>
            </div>
            <a className="service-detail-url" href={service.url} target="_blank" rel="noopener noreferrer">
              {service.url}
              <Icon name="external" />
            </a>
          </div>
          <div className="service-detail-header-actions">
            <button type="button" className="secondary-button" onClick={onEdit} disabled={busy}>
              <Icon name="edit" />Editar
            </button>
            <button type="button" className="danger-outline-button" onClick={onDelete} disabled={busy}>
              <Icon name="trash" />Eliminar
            </button>
          </div>
        </header>

        <div className="service-detail-kpis">
          <div>
            <span>Uptime ({service.evaluated_period?.days ?? 30}d)</span>
            <strong>{service.uptime.toFixed(2)}%{service.availability_level ? ` · ${service.availability_level}` : ''}</strong>
          </div>
          {service.downtime_seconds !== undefined && (
            <div>
              <span>Tiempo de Caída</span>
              <strong>{formatDowntime(service.downtime_seconds)}</strong>
            </div>
          )}
          <div>
            <span>Última Latencia</span>
            <strong className={isDown ? 'text-down' : ''}>{service.latency === null ? 'N/A' : `${service.latency} ms`}</strong>
          </div>
          <div>
            <span>Código HTTP</span>
            <strong>{service.status_code ?? (service.error_message ?? 'Sin respuesta')}</strong>
          </div>
          <div>
            <span>Intervalo</span>
            <strong>Cada {service.check_interval}s</strong>
          </div>
          <div>
            <span>Visibilidad</span>
            <strong>{service.is_public ? 'Pública' : 'Privada'}</strong>
          </div>
        </div>

        <LatencyChart service={service} embedded />

        <div className="service-availability-strip">
          <div className="service-availability-strip-head">
            <span>Disponibilidad por hora (24 hs)</span>
            <span>{service.recent_checks.length} franjas registradas</span>
          </div>
          {service.recent_checks.length === 0 ? (
            <p className="availability-empty">Todavía no hay verificaciones registradas en las últimas 24 horas.</p>
          ) : (
            <div className="service-availability-blocks">
              {service.recent_checks.map((check, index) => (
                <i
                  key={`${check.hour_start}-${index}`}
                  className={check.status === 'down' ? 'down' : 'up'}
                  title={`${check.timestamp} hs · ${check.status === 'down' ? check.error_message ?? 'Caído' : `Operativo (${check.latency} ms)`}`}
                />
              ))}
            </div>
          )}
        </div>

        {incidents.length > 0 && (
          <div className="service-detail-incidents">
            <h3>Últimos incidentes de este servicio</h3>
            <ul>
              {incidents.slice(0, 4).map((incident) => (
                <li key={incident.id}>
                  <button type="button" onClick={() => onOpenIncident(incident)}>
                    <span className={`incident-status ${incident.status === 'Abierto' ? 'open' : 'resolved'}`}>
                      {incident.status}
                    </span>
                    <span className="service-incident-desc">{incident.description}</span>
                    <small>{formatDateTime(incident.date)}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}

function ServiceForm({
  service,
  busy,
  error,
  onCancel,
  onSave,
}: {
  service: ApiService | null
  busy: boolean
  error: string
  onCancel: () => void
  onSave: (values: ServiceInput) => void
}) {
  const [name, setName] = useState(service?.name ?? '')
  const [url, setUrl] = useState(service?.url ?? '')
  const [interval, setInterval] = useState(service?.check_interval ?? 60)
  const [isPublic, setIsPublic] = useState(service?.is_public ?? false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Ingresa un nombre para el servicio.'
    else if (name.trim().length > 255) errors.name = 'El nombre no debe superar 255 caracteres.'
    if (!url.trim()) {
      errors.url = 'Ingresa una URL.'
    } else {
      try {
        const parsedUrl = new URL(url.trim())
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) errors.url = 'La URL debe comenzar con http:// o https://.'
      } catch {
        errors.url = 'Ingresa una URL válida.'
      }
    }
    if (!Number.isInteger(interval) || interval < 30 || interval > 86400) {
      errors.interval = 'El intervalo debe estar entre 30 y 86400 segundos.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      setFormError('')
      return
    }
    setFormError('')
    onSave({ name: name.trim(), url: url.trim(), check_interval: interval, is_public: isPublic })
  }

  return (
    <section className="service-form-panel">
      <header className="form-panel-heading">
        <div>
          <h2>{service ? 'Editar Servicio' : 'Agregar Nuevo Servicio'}</h2>
          <p>Configura el recurso que deseas monitorear periódicamente.</p>
        </div>
        {service && <span className="edit-mode-badge">MODO EDICIÓN</span>}
      </header>
      <form className="service-form" onSubmit={submit} noValidate>
        <div className="form-field">
          <label htmlFor="service-name">Nombre del Servicio <b>*</b></label>
          <input
            id="service-name"
            className={fieldErrors.name ? 'invalid' : ''}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'service-name-error' : undefined}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setFieldErrors((current) => ({ ...current, name: '' }))
            }}
            maxLength={255}
            placeholder="Ej: API Principal"
            required
          />
          {fieldErrors.name && <span id="service-name-error" className="field-error" role="alert">{fieldErrors.name}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="service-url">URL / Endpoint <b>*</b></label>
          <input
            id="service-url"
            className={fieldErrors.url ? 'invalid' : ''}
            aria-invalid={Boolean(fieldErrors.url)}
            aria-describedby={fieldErrors.url ? 'service-url-error' : undefined}
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setFieldErrors((current) => ({ ...current, url: '' }))
            }}
            placeholder="https://api.ejemplo.com/health"
            required
          />
          {fieldErrors.url
            ? <span id="service-url-error" className="field-error" role="alert">{fieldErrors.url}</span>
            : <p>Debe ser accesible vía HTTP/HTTPS. Se esperará un código 2xx o 3xx.</p>}
        </div>

        <div className="form-field">
          <label htmlFor="service-interval">Intervalo de Chequeo (Segundos) <b>*</b></label>
          <input
            id="service-interval"
            className={fieldErrors.interval ? 'invalid' : ''}
            aria-invalid={Boolean(fieldErrors.interval)}
            aria-describedby={fieldErrors.interval ? 'service-interval-error' : undefined}
            type="number"
            min={30}
            max={86400}
            value={interval}
            onChange={(event) => {
              setInterval(Number(event.target.value))
              setFieldErrors((current) => ({ ...current, interval: '' }))
            }}
            required
          />
          {fieldErrors.interval
            ? <span id="service-interval-error" className="field-error" role="alert">{fieldErrors.interval}</span>
            : <p>El valor mínimo permitido por el sistema es de 30 segundos.</p>}
        </div>

        <label className="public-toggle" htmlFor="service-public">
          <input id="service-public" type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          <span>
            <strong>Hacer visible en Página de Estado Pública</strong>
            <small>Si está activo, los visitantes sin sesión podrán ver el estado de este servicio.</small>
          </span>
        </label>

        {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}

        <div className="service-form-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="primary-button" type="submit" disabled={busy}>
            <Icon name="save" />
            {busy ? 'Guardando…' : service ? 'Guardar Cambios' : 'Guardar Nuevo Servicio'}
          </button>
        </div>
      </form>
    </section>
  )
}

function buildPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, idx) => idx + 1)
  const pages: Array<number | 'ellipsis'> = [1]
  if (current > 3) pages.push('ellipsis')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p += 1) pages.push(p)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

function IncidentHistory({
  serviceNames,
  onExport,
  onSelect,
}: {
  serviceNames: string[]
  onExport: (filters: { from: string; to: string; service: string; status: string }) => void
  onSelect: (incident: ApiIncident) => void
}) {
  const [serviceFilter, setServiceFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [items, setItems] = useState<ApiIncident[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [discoveredServices, setDiscoveredServices] = useState<string[]>([])
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadError, setLoadError] = useState('')

  const today = new Date()
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const dateError = fromDate > todayValue || toDate > todayValue
    ? 'Las fechas no pueden ser posteriores a hoy.'
    : fromDate && toDate && toDate < fromDate
      ? 'La fecha “Hasta” no puede ser anterior a “Desde”.'
      : ''

  useEffect(() => {
    if (dateError) return
    let active = true
    const loadPage = async () => {
      setLoadingPage(true)
      setLoadError('')
      try {
        const result = await getIncidentsPaginated({
          page,
          limit: pageSize,
          service: serviceFilter,
          status: statusFilter,
          from: fromDate,
          to: toDate,
        })
        if (!active) return
        setItems(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        if (result.page !== page) setPage(result.page)
        if (result.services?.length) {
          setDiscoveredServices((prev) => [...new Set([...prev, ...result.services!])])
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'No fue posible cargar los incidentes.')
      } finally {
        if (active) setLoadingPage(false)
      }
    }
    void loadPage()
    return () => { active = false }
  }, [dateError, fromDate, page, pageSize, serviceFilter, statusFilter, toDate])

  const uniqueServices = useMemo(
    () => ['Todos', ...new Set([...serviceNames, ...discoveredServices, ...items.map((item) => item.service_name)])],
    [discoveredServices, items, serviceNames],
  )

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)
  const pageNumbers = buildPageNumbers(page, totalPages)

  return (
    <section className="incident-panel">
      <header className="incident-panel-heading">
        <div>
          <h2>Registro de Incidentes</h2>
          <p>Historial completo de fallos detectados por los checkers.</p>
        </div>
        <button
          className="secondary-button export-button"
          type="button"
          disabled={Boolean(dateError)}
          onClick={() => onExport({ from: fromDate, to: toDate, service: serviceFilter, status: statusFilter })}
        >
          <Icon name="download" />Exportar CSV
        </button>
      </header>

      <div className="incident-filters">
        <label>
          Servicio
          <select
            value={serviceFilter}
            onChange={(event) => {
              setServiceFilter(event.target.value)
              setPage(1)
            }}
          >
            {uniqueServices.map((service) => <option key={service} value={service}>{service}</option>)}
          </select>
        </label>
        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value="Todos">Todos</option>
            <option value="Abierto">Abierto</option>
            <option value="Resuelto">Resuelto</option>
          </select>
        </label>
        <label>
          Desde
          <input
            type="date"
            max={todayValue}
            aria-invalid={Boolean(dateError)}
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            max={todayValue}
            aria-invalid={Boolean(dateError)}
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <span className="incident-count">{total} {total === 1 ? 'registro' : 'registros'}</span>
      </div>

      {dateError && <p className="date-filter-error" role="alert">{dateError}</p>}
      {loadError && <p className="date-filter-error" role="alert">{loadError}</p>}

      <div className="incident-table-wrap">
        <table className="incident-table">
          <thead>
            <tr>
              <th>Detectado</th>
              <th>Servicio</th>
              <th>Estado</th>
              <th>Cód. HTTP</th>
              <th>Latencia</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((incident) => (
              <tr
                key={incident.id}
                onClick={() => onSelect(incident)}
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && onSelect(incident)}
              >
                <td>{formatDateTime(incident.date)}</td>
                <td><strong>{incident.service_name}</strong><small>{incident.url}</small></td>
                <td>
                  <span className={`incident-status ${incident.status === 'Abierto' ? 'open' : 'resolved'}`}>
                    {incident.status}
                  </span>
                </td>
                <td>{incident.http_code ?? '—'}</td>
                <td>{incident.latency === null ? '—' : `${incident.latency} ms`}</td>
                <td>{incident.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {loadingPage ? (
          <p className="empty-panel">Cargando incidentes…</p>
        ) : items.length === 0 ? (
          <p className="empty-panel">No se encontraron incidentes para los filtros seleccionados.</p>
        ) : null}
      </div>

      <footer className="incident-table-footer pagination-bar">
        <div className="pagination-summary">
          <span>
            {total === 0
              ? 'Mostrando 0 registros'
              : `Mostrando ${rangeStart}–${rangeEnd} de ${total} registros`}
          </span>
          <label className="page-size-select">
            Por página
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        {totalPages > 1 && (
          <nav className="pagination-controls" aria-label="Paginación de incidentes">
            <button
              type="button"
              className="page-btn"
              disabled={page <= 1 || loadingPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
            >
              <Icon name="chevronLeft" />
              <span>Anterior</span>
            </button>

            {pageNumbers.map((entry, idx) =>
              entry === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="page-ellipsis" aria-hidden="true">…</span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  className={`page-btn number ${entry === page ? 'active' : ''}`}
                  aria-current={entry === page ? 'page' : undefined}
                  disabled={loadingPage}
                  onClick={() => setPage(entry)}
                >
                  {entry}
                </button>
              ),
            )}

            <button
              type="button"
              className="page-btn"
              disabled={page >= totalPages || loadingPage}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label="Página siguiente"
            >
              <span>Siguiente</span>
              <Icon name="chevronRight" />
            </button>
          </nav>
        )}
      </footer>
    </section>
  )
}

function IncidentModal({ incident, onClose }: { incident: ApiIncident; onClose: () => void }) {
  const resolvedAt = getIncidentResolvedAt(incident)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className="incident-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="incident-modal" role="dialog" aria-modal="true" aria-labelledby="incident-detail-title">
        <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        <header>
          <span className={`incident-modal-icon ${incident.status === 'Abierto' ? 'open' : 'resolved'}`}>
            <Icon name={incident.status === 'Abierto' ? 'alert' : 'check'} />
          </span>
          <div>
            <h2 id="incident-detail-title">{incident.service_name}</h2>
            <p>Incidente #{incident.id}</p>
          </div>
        </header>
        <div className="incident-modal-grid">
          <div>
            <span>Detectado (Fecha y Hora)</span>
            <strong>{formatDateTime(incident.date)}</strong>
          </div>
          <div>
            <span>Resuelto (Fecha y Hora)</span>
            <strong>
              {incident.status === 'Abierto'
                ? 'En curso (Abierto)'
                : resolvedAt ? formatDateTime(resolvedAt) : 'Resuelto (sin marca horaria)'}
            </strong>
          </div>
          <div>
            <span>Estado</span>
            <strong>{incident.status}</strong>
          </div>
          <div>
            <span>Tipo de Fallo</span>
            <strong>{formatFailureType(incident.failure_type)}</strong>
          </div>
          <div>
            <span>Código HTTP</span>
            <strong>{incident.http_code ?? '—'}</strong>
          </div>
          <div>
            <span>Latencia</span>
            <strong>{incident.latency === null ? '—' : `${incident.latency} ms`}</strong>
          </div>
          <div>
            <span>URL</span>
            <strong>{incident.url}</strong>
          </div>
        </div>
        <div className="incident-description">
          <span>Descripción del Fallo (Logs del Checker)</span>
          <p>{incident.description}</p>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ConfirmModal({
  title,
  message,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return createPortal(
    <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section className="info-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <button className="incident-modal-close" type="button" onClick={onCancel} disabled={busy} aria-label="Cerrar"><Icon name="close" /></button>
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Eliminando…' : 'Eliminar'}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function PublicStatusPage({
  slug,
  isAuthenticated,
  onBack,
}: {
  slug: string
  isAuthenticated: boolean
  onBack: () => void
}) {
  const [services, setServices] = useState<ApiService[]>([])
  const [companyName, setCompanyName] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  async function copyShareUrl() {
    const shareUrl = `${window.location.origin}/status/${slug}`
    const ok = await copyTextToClipboard(shareUrl)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } else {
      window.prompt('Copia este enlace público para compartirlo:', shareUrl)
    }
  }

  useEffect(() => {
    let active = true
    const loadStatus = async () => {
      try {
        const result = await getPublicStatus(slug)
        if (active) {
          setServices(result.services)
          const brand = result.company_name?.trim() ?? ''
          setCompanyName(brand)
          document.title = brand ? `${brand} · Estado de Servicios` : 'Estado de Servicios · StatusHub'
          setError('')
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar esta página.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadStatus()
    const timer = window.setInterval(() => void loadStatus(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [slug])

  const publicServices = useMemo(
    () => services.filter((service) => `${service.name} ${service.url}`.toLowerCase().includes(debouncedSearch.toLowerCase().trim())),
    [debouncedSearch, services],
  )
  const hasIssues = services.some((service) => service.status === 'down')
  const hasServices = services.length > 0

  return (
    <main className="public-status-page">
      <header className="public-status-header">
        <div className="public-status-header-inner">
          <div className="public-status-brand">
            <span><Icon name="activity" /></span>
            <div>
              <h1>{companyName || 'Estado de Servicios'}</h1>
              <p>{companyName ? 'Estado de Servicios · StatusHub' : 'StatusHub · Página pública'}</p>
            </div>
          </div>
          {isAuthenticated && (
            <div className="public-header-actions">
              <button type="button" className="public-share-button" onClick={() => void copyShareUrl()}>
                <Icon name={copied ? "check" : "copy"} />
                {copied ? 'Enlace copiado' : 'Copiar enlace'}
              </button>
              <button type="button" onClick={onBack}>
                <Icon name="arrowLeft" />Volver al Admin
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="public-status-content">
        {error ? (
          <p className="empty-panel">{error}</p>
        ) : loading && !hasServices ? (
          <p className="empty-panel">Cargando servicios públicos…</p>
        ) : hasServices ? (
          <>
            <div className={`public-status-banner ${hasIssues ? 'has-issues' : ''}`}>
              <span className="public-banner-icon"><Icon name={hasIssues ? 'alert' : 'check'} /></span>
              <div>
                <h2>{hasIssues ? 'Algunos sistemas están experimentando problemas' : 'Todos los sistemas están operativos'}</h2>
                <p>Última actualización: {new Date().toLocaleTimeString()}</p>
              </div>
            </div>

            <label className="public-search">
              <Icon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar servicio por nombre o URL..."
              />
            </label>

            <section className="public-service-list">
              {publicServices.length > 0 ? (
                publicServices.map((service) => <PublicServiceCard key={service.id} service={service} allowServiceLink={isAuthenticated} />)
              ) : (
                <p className="empty-panel">No se encontraron servicios para la búsqueda.</p>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  )
}

function PublicServiceCard({ service, allowServiceLink }: { service: ApiService; allowServiceLink: boolean }) {
  const isDown = service.status === 'down'
  return (
    <article className={`public-service-card ${isDown ? 'down' : ''}`}>
      <div className="public-service-summary">
        <div>
          <h3>{service.name}</h3>
          {allowServiceLink ? (
            <a className="public-service-url" href={service.url} target="_blank" rel="noopener noreferrer">
              {service.url}
              <Icon name="external" />
            </a>
          ) : (
            <span className="public-service-url readonly">{service.url}</span>
          )}
          <div className="public-service-meta">
            {service.status_code === null
              ? <span className="http-pill http-error">{service.error_message ?? 'Sin respuesta'}</span>
              : <span className="http-pill">HTTP {service.status_code}</span>}
            <span>Uptime: {service.uptime.toFixed(2)}%</span>
          </div>
        </div>
        <span className={`public-state-pill ${isDown ? 'down' : ''}`}>
          <Icon name={isDown ? 'close' : 'check'} />
          {isDown ? 'Caído' : 'Operativo'}
        </span>
      </div>
      <LatencyChart
        service={service}
        title={`Latencia (24 hs) - ${service.name}`}
        canInspectMinutes={allowServiceLink}
      />
    </article>
  )
}


function TermsContent() {
  return (
    <div className="legal-terms">
      <p className="legal-meta">Última actualización: noviembre de 2026 · Licencia de Software Libre</p>

      <h3>1. Naturaleza de Software Libre y Objeto</h3>
      <p>
        StatusHub se distribuye y opera como software libre. Su código fuente puede ser usado, estudiado,
        modificado y redistribuido de conformidad con la licencia libre aplicable en el repositorio del proyecto.
        El presente documento regula el uso de esta instancia del servicio de monitoreo de disponibilidad.
      </p>

      <h3>2. Provisión «Tal Cual» (Sin Garantías Implícitas)</h3>
      <p>
        En la máxima medida permitida por la legislación aplicable, el software y el servicio se proporcionan
        <strong> «tal cual» (AS IS)</strong> y según disponibilidad, sin garantías de ningún tipo, expresas o implícitas,
        incluyendo, sin limitación, garantías de comerciabilidad, idoneidad para un propósito particular,
        continuidad ininterrumpida o ausencia de errores.
      </p>

      <h3>3. Uso Lícito y Responsabilidad sobre Endpoints</h3>
      <p>
        El usuario declara brindar datos veraces al registrarse, custodiar la confidencialidad de sus credenciales
        y contar con autorización legítima sobre todas las URLs, dominios o servicios que configure para monitoreo.
        Queda prohibido utilizar la plataforma para realizar escaneos no autorizados, pruebas de carga abusivas
        o actividades ilícitas contra terceros.
      </p>

      <h3>4. Limitación de Responsabilidad</h3>
      <p>
        Las métricas de disponibilidad, latencia e incidentes tienen carácter informativo y pueden presentar
        demoras o falsos positivos derivados de factores de red externos. Ni los autores del software libre ni
        los administradores de la instancia serán responsables por daños directos, indirectos, incidentales,
        pérdida de datos o lucro cesante derivados del uso o imposibilidad de uso del servicio.
      </p>

      <h3>5. Privacidad, Datos Personales y Derecho de Baja</h3>
      <p>
        Se almacenan únicamente los datos necesarios para prestar el servicio: correo electrónico, hash seguro
        de contraseña, constancia de aceptación de estos términos, configuración de servicios y registros de
        verificaciones e incidentes. El usuario puede ejercer su derecho de supresión en cualquier momento
        eliminando su cuenta de forma definitiva desde <strong>Configuración → Darse de baja</strong>, lo que
        elimina en cascada todos sus servicios, chequeos e incidentes asociados.
      </p>

      <h3>6. Página de Estado Pública</h3>
      <p>
        La página pública viene desactivada por defecto. Su habilitación, el nombre de organización mostrado y la
        selección de servicios visibles son responsabilidad exclusiva del titular de la cuenta.
      </p>
    </div>
  )
}

function SettingsView({
  session,
  defaultLayout,
  refreshSeconds,
  onChangeDefaultLayout,
  onChangeRefreshSeconds,
  onShowPublic,
  onTokenUpdated,
  onAccountDeleted,
}: {
  session: Session
  defaultLayout: ServiceLayoutMode
  refreshSeconds: number
  onChangeDefaultLayout: (layout: ServiceLayoutMode) => void
  onChangeRefreshSeconds: (seconds: number) => void
  onShowPublic: () => void
  onTokenUpdated: (token: string) => void
  onAccountDeleted: () => void
}) {
  const [publicEnabled, setPublicEnabled] = useState(false)
  const [publicName, setPublicName] = useState('')
  const [publicBusy, setPublicBusy] = useState(false)
  const [publicStatusMsg, setPublicStatusMsg] = useState('')
  const [publicNameError, setPublicNameError] = useState('')
  const [publicError, setPublicError] = useState('')
  const [copied, setCopied] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPwVisible, setCurrentPwVisible] = useState(false)
  const [newPwVisible, setNewPwVisible] = useState(false)
  const [confirmPwVisible, setConfirmPwVisible] = useState(false)
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [pwBusy, setPwBusy] = useState(false)
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwServerError, setPwServerError] = useState('')

  const [deletePassword, setDeletePassword] = useState('')
  const [deleteFieldError, setDeleteFieldError] = useState('')
  const [deleteServerError, setDeleteServerError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const publicUrl = `${window.location.origin}/status/${session.public_slug}`
  const newPwChecks = getPasswordChecks(newPassword)

  useEffect(() => {
    let active = true
    getPublicStatusSettings()
      .then((res) => {
        if (!active) return
        setPublicEnabled(Boolean(res.public_status_enabled))
        setPublicName(res.public_page_name ?? '')
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function savePublicSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPublicError('')
    setPublicStatusMsg('')
    const trimmedName = publicName.trim()
    if (publicEnabled && !trimmedName) {
      setPublicNameError('El nombre de la organización es obligatorio para activar la página pública.')
      return
    }
    setPublicNameError('')
    setPublicBusy(true)
    try {
      const updated = await updatePublicStatusSettings({
        public_status_enabled: publicEnabled,
        public_page_name: trimmedName,
      })
      setPublicEnabled(Boolean(updated.public_status_enabled))
      setPublicName(updated.public_page_name ?? '')
      setPublicStatusMsg('Configuración de página pública guardada.')
    } catch (err) {
      setPublicError(err instanceof Error ? err.message : 'No fue posible guardar la configuración.')
    } finally {
      setPublicBusy(false)
    }
  }

  async function handleCopyUrl() {
    const ok = await copyTextToClipboard(publicUrl)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } else {
      window.prompt('Copia este enlace público:', publicUrl)
    }
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPwSuccess('')
    setPwServerError('')
    const errors: { current?: string; next?: string; confirm?: string } = {}
    if (!currentPassword) errors.current = 'Ingresa tu contraseña actual.'
    if (!newPassword) errors.next = 'Ingresa la nueva contraseña.'
    else if (!isStrongPassword(newPassword)) errors.next = 'Debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'
    if (!confirmPassword) errors.confirm = 'Confirma la nueva contraseña.'
    else if (newPassword !== confirmPassword) errors.confirm = 'Las contraseñas no coinciden.'
    setPwErrors(errors)
    if (Object.keys(errors).length > 0) return

    setPwBusy(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      onTokenUpdated(result.token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwSuccess(result.message)
    } catch (err) {
      setPwServerError(err instanceof Error ? err.message : 'No fue posible actualizar la contraseña.')
    } finally {
      setPwBusy(false)
    }
  }

  function requestAccountDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDeleteServerError('')
    if (!deletePassword) {
      setDeleteFieldError('Ingresa tu contraseña actual para confirmar la baja.')
      return
    }
    setDeleteFieldError('')
    setConfirmDeleteOpen(true)
  }

  async function confirmAccountDeletion() {
    setDeleteBusy(true)
    setDeleteServerError('')
    try {
      await deleteAccount(deletePassword)
      setConfirmDeleteOpen(false)
      onAccountDeleted()
    } catch (err) {
      setDeleteServerError(err instanceof Error ? err.message : 'No fue posible eliminar la cuenta.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="settings-screen">
      {/* 1. Página Pública */}
      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h2><Icon name="globe" />Página de Estado Pública</h2>
            <p>Configura el nombre visible y la disponibilidad del enlace que compartes con tus clientes.</p>
          </div>
        </header>
        <form className="settings-form" onSubmit={(event) => void savePublicSettings(event)} noValidate>
          <label className="public-toggle" htmlFor="settings-public-enabled">
            <input
              id="settings-public-enabled"
              type="checkbox"
              checked={publicEnabled}
              onChange={(event) => setPublicEnabled(event.target.checked)}
            />
            <span>
              <strong>Habilitar página pública de estado</strong>
              <small>Si está desactivada, el enlace público responderá como no disponible para visitantes externos.</small>
            </span>
          </label>

          <div className="form-field">
            <label htmlFor="settings-public-name">Nombre de la organización / empresa {publicEnabled && <b>*</b>}</label>
            <input
              id="settings-public-name"
              type="text"
              maxLength={120}
              value={publicName}
              className={publicNameError ? 'invalid' : ''}
              aria-invalid={Boolean(publicNameError)}
              onChange={(event) => {
                setPublicName(event.target.value)
                if (publicNameError) setPublicNameError('')
              }}
              placeholder="Ej: La Anónima / Análisis S.A."
            />
            {publicNameError
              ? <span className="field-error" role="alert">{publicNameError}</span>
              : <p>Obligatorio al activar la página pública. Aparece como título principal para tus clientes.</p>}
          </div>

          <div className="form-field">
            <label htmlFor="settings-public-url">Enlace para compartir</label>
            <div className="settings-copy-row">
              <input id="settings-public-url" type="text" readOnly value={publicUrl} />
              <button type="button" className="secondary-button" onClick={() => void handleCopyUrl()}>
                <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" className="secondary-button" onClick={onShowPublic}>
                <Icon name="external" />Vista previa
              </button>
            </div>
          </div>

          {publicError && <p className="form-error" role="alert">{publicError}</p>}
          {publicStatusMsg && <p className="settings-success" role="status">{publicStatusMsg}</p>}
          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={publicBusy}>
              <Icon name="save" />{publicBusy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Preferencias del Panel */}
      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h2><Icon name="settings" />Preferencias del Panel</h2>
            <p>Ajustes locales de visualización y frecuencia de actualización en este navegador.</p>
          </div>
        </header>
        <div className="settings-form settings-prefs-grid">
          <div className="form-field">
            <label htmlFor="pref-refresh">Actualización automática del Dashboard</label>
            <select
              id="pref-refresh"
              value={refreshSeconds}
              onChange={(event) => onChangeRefreshSeconds(Number(event.target.value))}
            >
              <option value={15}>Cada 15 segundos</option>
              <option value={30}>Cada 30 segundos (predeterminado)</option>
              <option value={60}>Cada 60 segundos</option>
              <option value={0}>Solo manual</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pref-layout">Vista predeterminada de servicios</label>
            <select
              id="pref-layout"
              value={defaultLayout}
              onChange={(event) => onChangeDefaultLayout(event.target.value as ServiceLayoutMode)}
            >
              <option value="grid">Grilla compacta</option>
              <option value="list">Listado</option>
            </select>
          </div>
        </div>
      </section>

      {/* 3. Seguridad y Contraseña */}
      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h2><Icon name="lock" />Seguridad de la Cuenta</h2>
            <p>Cuenta registrada: <strong>{session.email}</strong></p>
          </div>
        </header>
        <form className="settings-form" onSubmit={(event) => void submitPasswordChange(event)} noValidate>
          <div className="form-field">
            <label htmlFor="pw-current">Contraseña actual</label>
            <div className="password-visibility-wrap">
              <input
                id="pw-current"
                type={currentPwVisible ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                className={pwErrors.current ? 'invalid' : ''}
                aria-invalid={Boolean(pwErrors.current)}
                onChange={(event) => {
                  setCurrentPassword(event.target.value)
                  setPwErrors((prev) => ({ ...prev, current: undefined }))
                }}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                onClick={() => setCurrentPwVisible((visible) => !visible)}
                aria-label={currentPwVisible ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                aria-pressed={currentPwVisible}
              >
                <Icon name={currentPwVisible ? 'eyeOff' : 'eye'} />
                <span>{currentPwVisible ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>
            {pwErrors.current && <span className="field-error" role="alert">{pwErrors.current}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="pw-new">Nueva contraseña</label>
            <div className="password-visibility-wrap">
              <input
                id="pw-new"
                type={newPwVisible ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                className={pwErrors.next ? 'invalid' : ''}
                aria-invalid={Boolean(pwErrors.next)}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  setPwErrors((prev) => ({ ...prev, next: undefined }))
                }}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                onClick={() => setNewPwVisible((visible) => !visible)}
                aria-label={newPwVisible ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                aria-pressed={newPwVisible}
              >
                <Icon name={newPwVisible ? 'eyeOff' : 'eye'} />
                <span>{newPwVisible ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>
            {pwErrors.next && <span className="field-error" role="alert">{pwErrors.next}</span>}
          </div>

          <ul className="password-rules" aria-label="Requisitos de nueva contraseña">
            <li className={newPwChecks.length ? 'met' : ''}>Mínimo 8 caracteres</li>
            <li className={newPwChecks.upper ? 'met' : ''}>Una mayúscula</li>
            <li className={newPwChecks.lower ? 'met' : ''}>Una minúscula</li>
            <li className={newPwChecks.number ? 'met' : ''}>Un número</li>
          </ul>

          <div className="form-field">
            <label htmlFor="pw-confirm">Confirmar nueva contraseña</label>
            <div className="password-visibility-wrap">
              <input
                id="pw-confirm"
                type={confirmPwVisible ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                className={pwErrors.confirm ? 'invalid' : ''}
                aria-invalid={Boolean(pwErrors.confirm)}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setPwErrors((prev) => ({ ...prev, confirm: undefined }))
                }}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                onClick={() => setConfirmPwVisible((visible) => !visible)}
                aria-label={confirmPwVisible ? 'Ocultar confirmación de nueva contraseña' : 'Mostrar confirmación de nueva contraseña'}
                aria-pressed={confirmPwVisible}
              >
                <Icon name={confirmPwVisible ? 'eyeOff' : 'eye'} />
                <span>{confirmPwVisible ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>
            {pwErrors.confirm && <span className="field-error" role="alert">{pwErrors.confirm}</span>}
          </div>

          {pwServerError && <p className="form-error" role="alert">{pwServerError}</p>}
          {pwSuccess && <p className="settings-success" role="status">{pwSuccess}</p>}
          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={pwBusy}>
              <Icon name="lock" />{pwBusy ? 'Actualizando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </section>

      {/* 4. Legal y Baja de Cuenta */}
      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h2><Icon name="shield" />Información Legal y Licencia</h2>
            <p>Consulta las condiciones de uso, limitación de responsabilidad y privacidad bajo software libre.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowTerms(true)}>
            Ver Términos y Condiciones
          </button>
        </header>
      </section>

      <section className="settings-card danger-zone">
        <header className="settings-card-head">
          <div>
            <h2><Icon name="alert" />Darse de baja (Eliminar cuenta)</h2>
            <p>Esta acción es irreversible: eliminará tu cuenta, todos tus servicios monitoreados, chequeos e historial de incidentes.</p>
          </div>
        </header>
        <form className="settings-form" onSubmit={requestAccountDeletion} noValidate>
          <div className="form-field">
            <label htmlFor="delete-account-password">Confirma tu contraseña actual</label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              className={deleteFieldError ? 'invalid' : ''}
              aria-invalid={Boolean(deleteFieldError)}
              onChange={(event) => {
                setDeletePassword(event.target.value)
                setDeleteFieldError('')
              }}
              placeholder="Ingresa tu contraseña para habilitar la baja"
            />
            {deleteFieldError && <span className="field-error" role="alert">{deleteFieldError}</span>}
          </div>
          {deleteServerError && !confirmDeleteOpen && <p className="form-error" role="alert">{deleteServerError}</p>}
          <div className="settings-actions">
            <button type="submit" className="danger-button" disabled={deleteBusy}>
              <Icon name="trash" />Eliminar mi cuenta definitivamente
            </button>
          </div>
        </form>
      </section>

      {showTerms && (
        <InfoModal title="Términos y Condiciones de Uso (Software Libre)" onClose={() => setShowTerms(false)}>
          <TermsContent />
        </InfoModal>
      )}

      {confirmDeleteOpen && (
        <ConfirmModal
          title="Confirmar baja definitiva"
          message={`¿Estás seguro de que quieres dar de baja la cuenta “${session.email}”? Se borrarán permanentemente todos tus servicios, verificaciones e incidentes y no podrás deshacer esta acción.`}
          busy={deleteBusy}
          error={deleteServerError}
          onCancel={() => {
            setConfirmDeleteOpen(false)
            setDeleteServerError('')
          }}
          onConfirm={() => void confirmAccountDeletion()}
        />
      )}
    </div>
  )
}

export default App
