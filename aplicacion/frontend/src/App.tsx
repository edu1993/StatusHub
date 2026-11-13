import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  deleteService as removeService,
  downloadIncidents,
  getIncidents,
  getPublicStatus,
  getServices,
  forgotPassword,
  login,
  register,
  resetPassword,
  saveService as persistService,
} from './api'
import type { ApiIncident, ApiService, AuthResult, ServiceInput } from './api'
import Icon from './Icon'
import LatencyChart from './LatencyChart'
import './App.css'

type AuthMode = 'login' | 'register'
type DashboardView = 'dashboard' | 'service-form' | 'incidents'
type Session = Pick<AuthResult, 'token' | 'email' | 'public_slug'>

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const token = localStorage.getItem('statushub_token')
    const email = localStorage.getItem('statushub_email')
    const publicSlug = localStorage.getItem('statushub_public_slug')
    return token && email && publicSlug ? { token, email, public_slug: publicSlug } : null
  })
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [publicSlug, setPublicSlug] = useState(() => readPublicSlug())
  const [resetToken, setResetToken] = useState(() => readResetToken())
  const [dashboardView, setDashboardView] = useState<DashboardView>('dashboard')
  const [notificationCount, setNotificationCount] = useState(0)

  useEffect(() => {
    const syncRoute = () => {
      setPublicSlug(readPublicSlug())
      setResetToken(readResetToken())
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const confirmation = String(form.get('password-confirm') ?? '')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError('Ingresa un correo electrónico válido.')
      setAuthBusy(false)
      return
    }
    if (!password) {
      setAuthError('Ingresa tu contraseña.')
      setAuthBusy(false)
      return
    }
    if (authMode === 'register' && password !== confirmation) {
      setAuthError('Las contraseñas no coinciden.')
      setAuthBusy(false)
      return
    }
    if (authMode === 'register' && !isStrongPassword(password)) {
      setAuthError('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.')
      setAuthBusy(false)
      return
    }

    if (resetToken) {
      return <PasswordResetScreen token={resetToken} onComplete={() => {
        window.history.replaceState({}, '', '/')
        setResetToken('')
        logout()
      }} />
    }

    try {
      const result = authMode === 'login'
        ? await login(email, password)
        : await register(email, password, form.get('terms-accepted') === 'on')
      storeSession(result)
      setSession(result)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No fue posible iniciar sesión.')
    } finally {
      setAuthBusy(false)
    }
  }

  const logout = useCallback(() => {
    localStorage.removeItem('statushub_token')
    localStorage.removeItem('statushub_email')
    localStorage.removeItem('statushub_public_slug')
    setSession(null)
    setDashboardView('dashboard')
  }, [])

  function showPublicPage(slug: string) {
    window.history.pushState({}, '', `/status/${slug}`)
    setPublicSlug(slug)
  }

  if (publicSlug) {
    return <PublicStatusPage slug={publicSlug} onBack={() => {
      window.history.pushState({}, '', '/')
      setPublicSlug('')
    }} />
  }

  if (session) {
    return <AdminLayout
      session={session}
      currentView={dashboardView}
      onNavigate={setDashboardView}
      onLogout={logout}
      onShowPublic={() => showPublicPage(session.public_slug)}
      notificationCount={notificationCount}
    >
      <Dashboard session={session} view={dashboardView} onNavigate={setDashboardView} onLogout={logout} onNotificationsChange={setNotificationCount} />
    </AdminLayout>
  }

  return <AuthScreen
    mode={authMode}
    error={authError}
    busy={authBusy}
    onSubmit={submitAuth}
    onModeChange={(mode) => { setAuthMode(mode); setAuthError('') }}
  />
}

function readPublicSlug(): string {
  return window.location.pathname.match(/^\/status\/([a-f0-9]{16})$/i)?.[1] ?? ''
}

function readResetToken(): string {
  return window.location.pathname === '/reset-password'
    ? new URLSearchParams(window.location.search).get('token') ?? ''
    : ''
}

function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
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

function AuthScreen({ mode, error, busy, onSubmit, onModeChange }: {
  mode: AuthMode
  error: string
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onModeChange: (mode: AuthMode) => void
}) {
  const isRegistering = mode === 'register'
  const [termsError, setTermsError] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    if (isRegistering && new FormData(event.currentTarget).get('terms-accepted') !== 'on') {
      event.preventDefault()
      setTermsError(true)
      return
    }
    setTermsError(false)
    onSubmit(event)
  }

  return <main className="auth-page">
    <div className="auth-top-line" />
    <section className="auth-card">
      <header className="auth-heading">
        <div className="auth-logo"><Icon name="activity" /></div>
        <h1>{isRegistering ? 'Crear Cuenta' : 'Bienvenido a StatusHub'}</h1>
        <p>{isRegistering ? 'Comienza a monitorear tu infraestructura hoy' : 'Inicia sesión para gestionar tus servicios'}</p>
      </header>
      <div className="auth-tabs" role="tablist" aria-label="Tipo de acceso">
        <button type="button" className={!isRegistering ? 'active' : ''} onClick={() => onModeChange('login')} role="tab" aria-selected={!isRegistering}>Iniciar sesión</button>
        <button type="button" className={isRegistering ? 'active' : ''} onClick={() => onModeChange('register')} role="tab" aria-selected={isRegistering}>Registrarme</button>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label htmlFor="email">Correo electrónico</label>
        <div className="auth-input-wrap"><Icon name="globe" /><input id="email" name="email" type="email" autoComplete="email" placeholder="admin@empresa.com" required /></div>
        <label htmlFor="password">Contraseña</label>
        <div className="auth-input-wrap">
          <Icon name="lock" />
          <input id="password" name="password" type={passwordVisible ? 'text' : 'password'} autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength={8} placeholder={isRegistering ? 'Mínimo 8 caracteres' : 'Tu contraseña'} required />
          <button className="password-visibility-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={passwordVisible}><Icon name={passwordVisible ? 'eyeOff' : 'eye'} /><span>{passwordVisible ? 'Ocultar' : 'Mostrar'}</span></button>
        </div>
        {isRegistering && <>
          <p className="password-hint">Usa al menos 8 caracteres, una mayúscula, una minúscula y un número.</p>
          <label htmlFor="password-confirm">Confirmar contraseña</label>
          <div className="auth-input-wrap">
            <Icon name="lock" />
            <input id="password-confirm" name="password-confirm" type={confirmationVisible ? 'text' : 'password'} autoComplete="new-password" minLength={8} placeholder="Repite tu contraseña" required />
            <button className="password-visibility-toggle" type="button" onClick={() => setConfirmationVisible((visible) => !visible)} aria-label={confirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'} aria-pressed={confirmationVisible}><Icon name={confirmationVisible ? 'eyeOff' : 'eye'} /><span>{confirmationVisible ? 'Ocultar' : 'Mostrar'}</span></button>
          </div>
          <label className="terms-acceptance"><input type="checkbox" name="terms-accepted" onChange={() => setTermsError(false)} /><span>Acepto los <button type="button" className="text-button" onClick={() => setShowTerms(true)}>Términos y condiciones</button>.</span></label>
          {termsError && <p className="terms-error" role="alert">Debes aceptar los términos y condiciones para registrarte.</p>}
        </>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Conectando…' : isRegistering ? 'Registrarse' : 'Ingresar'}<Icon name="chevronRight" /></button>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!isRegistering && <button className="forgot-password-link" type="button" onClick={() => setShowRecovery(true)}>¿Olvidaste la contraseña?</button>}
        <p className="auth-footnote">{isRegistering ? 'Al crear una cuenta, tus servicios quedan guardados en StatusHub.' : 'Inicia sesión para administrar tus servicios e incidentes.'}</p>
      </form>
    </section>
    {showTerms && <InfoModal title="Términos y condiciones" onClose={() => setShowTerms(false)}>
      <p>Al utilizar StatusHub, aceptas usar el servicio de forma lícita y proporcionar información veraz.</p>
      <p>Eres responsable de la seguridad de tu cuenta y de las direcciones que configures para monitoreo. Solo agrega servicios sobre los que tengas autorización.</p>
      <p>La información de disponibilidad se ofrece con fines de monitoreo y puede presentar demoras o interrupciones. StatusHub no garantiza disponibilidad ininterrumpida.</p>
      <p>Puedes dejar de usar el servicio y solicitar la eliminación de tu cuenta y sus datos al administrador de la plataforma.</p>
    </InfoModal>}
    {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} />}
  </main>
}

function RecoveryModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [simulated, setSimulated] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await forgotPassword(email.trim())
      setSent(true)
      setSimulated(result.simulated)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible solicitar la recuperación.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="info-modal recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-modal-title">
      <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      <h2 id="recovery-modal-title">Recuperar contraseña</h2>
      {sent ? <>
        <p>{simulated ? 'Si el correo está registrado, se generó un correo simulado.' : 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.'}</p>
        {simulated && <p className="simulated-mail-note">Abre la <a href="http://localhost:8026/" target="_blank" rel="noopener noreferrer">bandeja local</a> para usar el enlace de recuperación.</p>}
        <button className="primary-button" type="button" onClick={onClose}>Volver al inicio de sesión</button>
      </> : <form className="recovery-form" onSubmit={(event) => void submit(event)}>
        <p>Ingresa el correo de tu cuenta para solicitar un enlace de recuperación de un solo uso, válido durante una hora.</p>
        <label htmlFor="recovery-email">Correo electrónico</label>
        <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
        </div>
      </form>}
    </section>
  </div>
}

function PasswordResetScreen({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!isStrongPassword(password)) {
      setError('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.')
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    try {
      await resetPassword(token, password)
      setCompleted(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <header className="auth-heading"><div className="auth-logo"><Icon name="lock" /></div><h1>Nueva contraseña</h1><p>Elige una contraseña segura para tu cuenta.</p></header>
      {completed ? <div className="reset-complete"><p>La contraseña se actualizó correctamente. Las sesiones anteriores se cerraron.</p><button className="auth-submit" type="button" onClick={onComplete}>Ir a iniciar sesión</button></div>
        : <form className="recovery-form reset-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="reset-password">Contraseña</label>
          <div className="password-visibility-wrap">
            <input id="reset-password" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="password-visibility-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={passwordVisible}><Icon name={passwordVisible ? 'eyeOff' : 'eye'} /><span>{passwordVisible ? 'Ocultar' : 'Mostrar'}</span></button>
          </div>
          <p className="password-hint">Usa al menos 8 caracteres, una mayúscula, una minúscula y un número.</p>
          <label htmlFor="reset-password-confirm">Confirmar contraseña</label>
          <div className="password-visibility-wrap">
            <input id="reset-password-confirm" type={confirmationVisible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
            <button className="password-visibility-toggle" type="button" onClick={() => setConfirmationVisible((visible) => !visible)} aria-label={confirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'} aria-pressed={confirmationVisible}><Icon name={confirmationVisible ? 'eyeOff' : 'eye'} /><span>{confirmationVisible ? 'Ocultar' : 'Mostrar'}</span></button>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </form>}
    </section>
  </main>
}

function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
      <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      <h2 id="info-modal-title">{title}</h2>
      <div className="info-modal-content">{children}</div>
      <button className="primary-button" type="button" onClick={onClose}>Entendido</button>
    </section>
  </div>
}

function AdminLayout({ session, currentView, onNavigate, onLogout, onShowPublic, notificationCount, children }: {
  session: Session
  currentView: DashboardView
  onNavigate: (view: DashboardView) => void
  onLogout: () => void
  onShowPublic: () => void
  notificationCount: number
  children: ReactNode
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentView])
  const titles: Record<DashboardView, string> = {
    dashboard: 'Dashboard',
    'service-form': 'Gestión de Servicio',
    incidents: 'Historial de Incidentes',
  }
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="sidebar-brand"><Icon name="activity" /><span>StatusHub</span></div>
      <nav className="admin-nav" aria-label="Navegación principal">
        <button className={currentView === 'dashboard' ? 'active' : ''} type="button" onClick={() => onNavigate('dashboard')}><Icon name="dashboard" />Dashboard</button>
        <button className={currentView === 'service-form' ? 'active' : ''} type="button" onClick={() => onNavigate('service-form')}><Icon name="server" />Alta de Servicio</button>
        <button className={currentView === 'incidents' ? 'active' : ''} type="button" onClick={() => onNavigate('incidents')}><Icon name="alert" />Historial de Incidentes</button>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" onClick={onShowPublic}><Icon name="external" />Ver Página Pública</button>
      </div>
    </aside>
    <main className="admin-main">
      <header className="admin-header">
        <h1>{titles[currentView]}</h1>
        <button className="notification-button" type="button" onClick={() => onNavigate('incidents')} aria-label={`${notificationCount} incidentes abiertos. Ver historial`} title="Ver incidentes abiertos">
          <Icon name="bell" />{notificationCount > 0 && <span>{notificationCount > 99 ? '99+' : notificationCount}</span>}
        </button>
        <div className="admin-user">
          <span>{session.email}</span>
          <button className="user-avatar" type="button" aria-label="Abrir menú de usuario" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>{session.email.slice(0, 1).toUpperCase()}</button>
          {profileMenuOpen && <div className="profile-menu"><strong>{session.email}</strong><button type="button" onClick={() => { setProfileMenuOpen(false); onLogout() }}><Icon name="logout" />Cerrar sesión</button></div>}
        </div>
      </header>
      <div className="admin-content" ref={contentRef}>{children}</div>
    </main>
  </div>
}

function Dashboard({ session, view, onNavigate, onLogout, onNotificationsChange }: {
  session: Session
  view: DashboardView
  onNavigate: (view: DashboardView) => void
  onLogout: () => void
  onNotificationsChange: (count: number) => void
}) {
  const [services, setServices] = useState<ApiService[]>([])
  const [incidents, setIncidents] = useState<ApiIncident[]>([])
  const [editingService, setEditingService] = useState<ApiService | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<ApiIncident | null>(null)
  const [confirmingService, setConfirmingService] = useState<ApiService | null>(null)
  const [serviceSearch, setServiceSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const debouncedServiceSearch = useDebouncedValue(serviceSearch)

  const refreshDashboard = useCallback(async () => {
    try {
      const [serviceData, incidentData] = await Promise.all([getServices(), getIncidents()])
      setServices(serviceData)
      setIncidents(incidentData)
      onNotificationsChange(incidentData.filter((incident) => incident.status === 'Abierto').length)
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
    const refreshTimer = window.setInterval(() => void refreshDashboard(), 30000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(refreshTimer)
    }
  }, [refreshDashboard])

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
      await refreshDashboard()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el servicio.')
    } finally {
      setBusy(false)
    }
  }

  function editService(service: ApiService | null) {
    setEditingService(service)
    setError('')
    onNavigate('service-form')
  }

  if (view === 'service-form') {
    return <ServiceForm service={editingService} busy={busy} error={error} onCancel={() => { setError(''); onNavigate('dashboard') }} onSave={(values) => void saveService(values)} />
  }
  if (view === 'incidents') {
    return <><IncidentHistory incidents={incidents} loading={loading} onExport={async (filters) => {
      setError('')
      try {
        await downloadIncidents(filters)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'No fue posible exportar los incidentes.')
      }
    }} onSelect={setSelectedIncident} />{error && <p className="dashboard-error" role="alert">{error}</p>}{selectedIncident && <IncidentModal incident={selectedIncident} onClose={() => setSelectedIncident(null)} />}</>
  }

  const operationalServices = services.filter((service) => service.status === 'up').length
  const downServices = services.length - operationalServices
  const averageUptime = services.length
    ? services.reduce((total, service) => total + service.uptime, 0) / services.length
    : 100
  const openIncidents = incidents.filter((incident) => incident.status === 'Abierto').length
  const visibleServices = services.filter((service) => `${service.name} ${service.url}`.toLowerCase().includes(debouncedServiceSearch.toLowerCase().trim()))

  return <div className="dashboard-screen">
    <div className="dashboard-welcome"><div><p className="dashboard-eyebrow">MONITOREO EN TIEMPO REAL</p><h2>Hola, {session.email.split('@')[0]}</h2><p>Resumen del estado de tus servicios e infraestructura.</p></div><button className="refresh-button" type="button" onClick={() => void refreshDashboard()} disabled={loading}><Icon name="refresh" />Actualizar</button></div>
    {error && <p className="dashboard-error" role="alert">{error}</p>}
    <div className="overview-grid">
      <article className="overview-card availability-card"><Icon className="overview-watermark" name="activity" /><h3>Disponibilidad Global</h3><div className="overview-value">{averageUptime.toFixed(2)}%</div><div className="overview-card-footer"><span className="overview-level">Últimos 30 días</span><span>Promedio de todos los servicios</span></div></article>
      <article className="overview-card service-summary-card"><h3>Resumen de Servicios</h3><div className="service-summary"><div><strong className="operational-count">{operationalServices}</strong><span>Operativos</span></div><i /><div><strong className="down-count">{downServices}</strong><span>Caídos</span></div><i /><div><strong className="summary-count">{services.length}</strong><span>Total</span></div></div><div className="overview-card-footer"><span>{openIncidents} incidentes abiertos</span><span>{loading ? 'Actualizando…' : 'Actualizado automáticamente'}</span></div></article>
    </div>

    <section className="monitored-services">
      <div className="section-title-row"><h2><Icon name="server" />Servicios Monitoreados</h2><button className="primary-button" type="button" onClick={() => editService(null)}><Icon name="plus" />Agregar Servicio</button></div>
      <label className="service-search"><Icon name="search" /><input type="search" value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Buscar servicio por nombre o URL..." /></label>
      {loading && services.length === 0 ? <p className="empty-panel">Cargando servicios…</p> : services.length === 0 ? <p className="empty-panel">Todavía no tienes servicios. Agrega el primero para comenzar el monitoreo.</p> : <div className="monitored-grid">
        {visibleServices.length ? visibleServices.map((service) => <ServiceCard key={service.id} service={service} busy={busy} onEdit={() => editService(service)} onDelete={() => setConfirmingService(service)} />) : <p className="empty-panel">No se encontraron servicios.</p>}
      </div>}
      {confirmingService && <ConfirmModal title="Eliminar servicio" message={`¿Estás seguro de que quieres eliminar “${confirmingService.name}”? Se borrarán también sus verificaciones e incidentes.`} busy={busy} error={error} onCancel={() => { setConfirmingService(null); setError('') }} onConfirm={() => void deleteService(confirmingService)} />}
    </section>
    {selectedIncident && <IncidentModal incident={selectedIncident} onClose={() => setSelectedIncident(null)} />}
  </div>
}

function ServiceCard({ service, busy, onEdit, onDelete }: {
  service: ApiService
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isDown = service.status === 'down'
  return <article className={`service-card ${isDown ? 'service-card-down' : ''}`}>
    <div className="service-card-top">
      <h3>{service.name}</h3>
      <span className={`service-state-badge ${isDown ? 'down' : 'up'}`}><Icon name={isDown ? 'alert' : 'check'} />{isDown ? 'CAÍDO' : 'OPERATIVO'}</span>
    </div>
    <a className="service-url" href={service.url} target="_blank" rel="noopener noreferrer">{service.url}<Icon name="external" /></a>
    <div className="service-last-check">
      {service.status_code === null
        ? <span className="http-pill http-error">{service.error_message ?? 'Sin respuesta'}</span>
        : <span className={`http-pill ${isDown ? 'http-error' : ''}`}>HTTP {service.status_code}</span>}
      <span className={isDown ? 'last-latency is-down' : 'last-latency'}>Última Latencia: {service.latency === null ? 'N/A' : `${service.latency} ms`}</span>
    </div>
    <div className={`service-card-metrics ${isDown ? 'metrics-down' : ''}`}>
      <div><span>Chequeo</span><strong>{service.check_interval}s</strong></div>
      <div><span>Uptime (30d)</span><strong>{service.uptime.toFixed(2)}%</strong></div>
    </div>
    <LatencyChart service={service} />
    <div className="service-card-footer">
      <span className={`visibility-label ${service.is_public ? 'public' : ''}`}><Icon name={service.is_public ? 'globe' : 'lock'} />{service.is_public ? 'Página publicada' : 'Página no publicada'}</span>
      <div className="service-card-actions"><button type="button" onClick={onEdit} disabled={busy} aria-label={`Editar ${service.name}`} title="Editar"><Icon name="edit" /></button><button type="button" onClick={onDelete} disabled={busy} aria-label={`Eliminar ${service.name}`} title="Eliminar"><Icon name="trash" /></button></div>
    </div>
  </article>
}

function ServiceForm({ service, busy, error, onCancel, onSave }: {
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

  return <section className="service-form-panel">
    <header className="form-panel-heading"><div><h2>{service ? 'Editar Servicio' : 'Agregar Nuevo Servicio'}</h2><p>Configura el recurso que deseas monitorear periódicamente.</p></div>{service && <span className="edit-mode-badge">MODO EDICIÓN</span>}</header>
    <form className="service-form" onSubmit={submit} noValidate>
      <div className="form-field"><label htmlFor="service-name">Nombre del Servicio <b>*</b></label><input id="service-name" className={fieldErrors.name ? 'invalid' : ''} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'service-name-error' : undefined} value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: '' })) }} maxLength={255} placeholder="Ej: API Principal" required />{fieldErrors.name && <span id="service-name-error" className="field-error">{fieldErrors.name}</span>}</div>
      <div className="form-field"><label htmlFor="service-url">URL / Endpoint <b>*</b></label><input id="service-url" className={fieldErrors.url ? 'invalid' : ''} aria-invalid={Boolean(fieldErrors.url)} aria-describedby={fieldErrors.url ? 'service-url-error' : undefined} type="url" value={url} onChange={(event) => { setUrl(event.target.value); setFieldErrors((current) => ({ ...current, url: '' })) }} placeholder="https://api.ejemplo.com/health" required />{fieldErrors.url ? <span id="service-url-error" className="field-error">{fieldErrors.url}</span> : <p>Debe ser accesible vía HTTP/HTTPS. Se esperará un código 2xx o 3xx.</p>}</div>
      <div className="form-field"><label htmlFor="service-interval">Intervalo de Chequeo (Segundos) <b>*</b></label><input id="service-interval" className={fieldErrors.interval ? 'invalid' : ''} aria-invalid={Boolean(fieldErrors.interval)} aria-describedby={fieldErrors.interval ? 'service-interval-error' : undefined} type="number" min={30} max={86400} value={interval} onChange={(event) => { setInterval(Number(event.target.value)); setFieldErrors((current) => ({ ...current, interval: '' })) }} required />{fieldErrors.interval ? <span id="service-interval-error" className="field-error">{fieldErrors.interval}</span> : <p>El valor mínimo permitido por el sistema es de 30 segundos.</p>}</div>
      <label className="public-toggle" htmlFor="service-public"><input id="service-public" type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /><span><strong>Hacer visible en Página de Estado Pública</strong><small>Si está activo, los visitantes sin sesión podrán ver el estado de este servicio.</small></span></label>
      {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}
      <div className="service-form-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}><Icon name="save" />{busy ? 'Guardando…' : service ? 'Guardar Cambios' : 'Guardar Nuevo Servicio'}</button></div>
    </form>
  </section>
}

function IncidentHistory({ incidents, loading, onExport, onSelect }: {
  incidents: ApiIncident[]
  loading: boolean
  onExport: (filters: { from: string; to: string; service: string; status: string }) => void
  onSelect: (incident: ApiIncident) => void
}) {
  const [serviceFilter, setServiceFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const today = new Date()
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const dateError = fromDate > todayValue || toDate > todayValue
    ? 'Las fechas no pueden ser posteriores a hoy.'
    : fromDate && toDate && toDate < fromDate
      ? 'La fecha “Hasta” no puede ser anterior a “Desde”.'
      : ''
  const uniqueServices = ['Todos', ...new Set(incidents.map((incident) => incident.service_name))]
  const filtered = incidents.filter((incident) => {
    const date = incident.date.slice(0, 10)
    return (serviceFilter === 'Todos' || incident.service_name === serviceFilter)
      && (statusFilter === 'Todos' || incident.status === statusFilter)
      && (!fromDate || date >= fromDate)
      && (!toDate || date <= toDate)
  })
  return <section className="incident-panel">
    <header className="incident-panel-heading"><div><h2>Registro de Incidentes</h2><p>Historial completo de fallos detectados por los checkers.</p></div><button className="secondary-button export-button" type="button" disabled={Boolean(dateError)} onClick={() => onExport({ from: fromDate, to: toDate, service: serviceFilter, status: statusFilter })}><Icon name="download" />Exportar CSV</button></header>
    <div className="incident-filters">
      <label>Servicio<select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>{uniqueServices.map((service) => <option key={service}>{service}</option>)}</select></label>
      <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Abierto</option><option>Resuelto</option></select></label>
      <label>Desde<input type="date" max={todayValue} aria-invalid={Boolean(dateError)} value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
      <label>Hasta<input type="date" max={todayValue} aria-invalid={Boolean(dateError)} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      <span className="incident-count">{filtered.length} registros</span>
    </div>
    {dateError && <p className="date-filter-error" role="alert">{dateError}</p>}
    <div className="incident-table-wrap"><table className="incident-table"><thead><tr><th>Fecha y Hora</th><th>Servicio</th><th>Estado</th><th>Cód. HTTP</th><th>Latencia</th><th>Detalle</th></tr></thead><tbody>
      {filtered.map((incident) => <tr key={incident.id} onClick={() => onSelect(incident)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(incident)}><td>{incident.date}</td><td><strong>{incident.service_name}</strong><small>{incident.url}</small></td><td><span className={`incident-status ${incident.status === 'Abierto' ? 'open' : 'resolved'}`}>{incident.status}</span></td><td>{incident.http_code ?? '—'}</td><td>{incident.latency === null ? '—' : `${incident.latency} ms`}</td><td>{incident.description}</td></tr>)}
    </tbody></table>
      {loading ? <p className="empty-panel">Cargando incidentes…</p> : filtered.length === 0 ? <p className="empty-panel">No se encontraron incidentes para los filtros seleccionados.</p> : null}
    </div>
    <footer className="incident-table-footer">Mostrando {filtered.length} registros</footer>
  </section>
}

function IncidentModal({ incident, onClose }: { incident: ApiIncident; onClose: () => void }) {
  return <div className="incident-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="incident-modal" role="dialog" aria-modal="true" aria-labelledby="incident-detail-title">
      <button className="incident-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      <header><span className={`incident-modal-icon ${incident.status === 'Abierto' ? 'open' : 'resolved'}`}><Icon name={incident.status === 'Abierto' ? 'alert' : 'check'} /></span><div><h2 id="incident-detail-title">{incident.service_name}</h2><p>{incident.date}</p></div></header>
      <div className="incident-modal-grid"><div><span>Estado</span><strong>{incident.status}</strong></div><div><span>Código HTTP</span><strong>{incident.http_code ?? '—'}</strong></div><div><span>Latencia</span><strong>{incident.latency === null ? '—' : `${incident.latency} ms`}</strong></div><div><span>URL</span><strong>{incident.url}</strong></div></div>
      <div className="incident-description"><span>Descripción del Fallo (Logs del Checker)</span><p>{incident.description}</p></div>
    </section>
  </div>
}

function ConfirmModal({ title, message, busy, error, onCancel, onConfirm }: {
  title: string
  message: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return <div className="info-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
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
  </div>
}

function PublicStatusPage({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [services, setServices] = useState<ApiService[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const loadStatus = async () => {
      try {
        const result = await getPublicStatus(slug)
        if (active) {
          setServices(result.services)
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

  const publicServices = useMemo(() => services.filter((service) => `${service.name} ${service.url}`.toLowerCase().includes(debouncedSearch.toLowerCase().trim())), [debouncedSearch, services])
  const hasIssues = services.some((service) => service.status === 'down')
  return <main className="public-status-page">
    <header className="public-status-header"><div className="public-status-header-inner"><div className="public-status-brand"><span><Icon name="activity" /></span><div><h1>Estado de Servicios</h1><p>StatusHub · Página pública</p></div></div><button type="button" onClick={onBack}><Icon name="arrowLeft" />Volver al Admin</button></div></header>
    <section className="public-status-content">
      <div className={`public-status-banner ${hasIssues ? 'has-issues' : ''}`}><span className="public-banner-icon"><Icon name={hasIssues ? 'alert' : 'check'} /></span><div><h2>{hasIssues ? 'Algunos sistemas están experimentando problemas' : 'Todos los sistemas están operativos'}</h2><p>Última actualización: {loading ? 'Cargando…' : new Date().toLocaleTimeString()}</p></div></div>
      <label className="public-search"><Icon name="search" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar servicio por nombre o URL..." /></label>
      <section className="public-service-list">{error ? <p className="empty-panel">{error}</p> : loading && services.length === 0 ? <p className="empty-panel">Cargando servicios públicos…</p> : publicServices.length ? publicServices.map((service) => <PublicServiceCard key={service.id} service={service} />) : <p className="empty-panel">No se encontraron servicios públicos.</p>}</section>
    </section>
  </main>
}

function PublicServiceCard({ service }: { service: ApiService }) {
  const isDown = service.status === 'down'
  const maxLatency = Math.max(...service.recent_checks.map((check) => check.latency), 100)
  return <article className={`public-service-card ${isDown ? 'down' : ''}`}>
    <div className="public-service-summary"><div><h3>{service.name}</h3><a className="public-service-url" href={service.url} target="_blank" rel="noopener noreferrer">{service.url}<Icon name="external" /></a><div className="public-service-meta">{service.status_code === null ? <span className="http-pill http-error">{service.error_message ?? 'Sin respuesta'}</span> : <span className="http-pill">HTTP {service.status_code}</span>}<span>Uptime: {service.uptime}%</span></div></div><span className={`public-state-pill ${isDown ? 'down' : ''}`}><Icon name={isDown ? 'close' : 'check'} />{isDown ? 'Caído' : 'Operativo'}</span></div>
    <LatencyChart service={service} title={`Latencia - ${service.name}`} />
    <div className="public-service-bars" aria-label={`Disponibilidad reciente de ${service.name}`}>{service.recent_checks.map((check, index) => <i key={`${check.hour_start}-${index}`} className={check.status === 'down' ? 'down' : ''} style={{ height: `${check.status === 'down' ? 100 : Math.max(6, check.latency / maxLatency * 100)}%` }} title={`${check.timestamp}: ${check.latency} ms`} />)}</div>
  </article>
}

export default App
