import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AuthMode = 'login' | 'register'
type ServiceStatus = 'operational' | 'degraded' | 'down'

type Service = {
  name: string
  url: string
  interval: number
  isPublic: boolean
  status: ServiceStatus
  availability: string
  latency: string
  incident?: string
}

const initialServices: Service[] = [
  {
    name: 'API principal',
    url: 'api.statushub.app',
    interval: 60,
    isPublic: true,
    status: 'operational',
    availability: '99,98%',
    latency: '184 ms',
  },
  {
    name: 'Tienda online',
    url: 'tienda.ejemplo.com',
    interval: 30,
    isPublic: false,
    status: 'down',
    availability: '96,42%',
    latency: '--',
    incident: 'Timeout · hace 8 min',
  },
  {
    name: 'Web institucional',
    url: 'statushub.app',
    interval: 120,
    isPublic: true,
    status: 'operational',
    availability: '99,999%',
    latency: '92 ms',
  },
  {
    name: 'Panel de clientes',
    url: 'panel.statushub.app',
    interval: 60,
    isPublic: false,
    status: 'degraded',
    availability: '99,72%',
    latency: '642 ms',
    incident: 'Latencia elevada · hace 22 min',
  },
]

type ServiceFormValues = Pick<Service, 'name' | 'url' | 'interval' | 'isPublic'>

const chartValues = [99.98, 99.99, 99.97, 99.95, 99.99, 99.98, 99.96, 99.99, 99.99, 99.94, 99.98, 99.99, 99.97, 99.98, 99.99, 99.98, 99.99, 99.99, 99.97, 99.99, 99.96, 99.95, 99.99, 99.98, 99.99, 99.99, 99.97, 99.99, 99.98, 99.99]

const levelScale = [
  { level: 'Nivel 1', name: 'dos nueves', value: '99%' },
  { level: 'Nivel 2', name: 'tres nueves', value: '99,9%' },
  { level: 'Nivel 3', name: 'cuatro nueves', value: '99,99%' },
  { level: 'Nivel 4', name: 'cinco nueves', value: '99,999%' },
]

function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showPublicPage, setShowPublicPage] = useState(false)
  const isPublicRoute = window.location.pathname === '/status/eduardo'

  const isRegistering = mode === 'register'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isRegistering && !accepted) {
      setMessage('Acepta los terminos para crear tu cuenta.')
      return
    }

    setIsAuthenticated(true)
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setMessage('')
    setAccepted(false)
  }

  if (showPublicPage || isPublicRoute) {
    return <PublicStatusPage onBack={() => setShowPublicPage(false)} />
  }

  if (isAuthenticated) {
    return <Dashboard email={email} onLogout={() => setIsAuthenticated(false)} onShowPublic={() => setShowPublicPage(true)} />
  }

  return (
    <main className="auth-shell">
      <section className="brand-panel" aria-label="Informacion de StatusHub">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <p className="eyebrow">STATUSHUB / MONITOREO</p>
          <h1>La claridad empieza cuando todo esta visible.</h1>
          <p className="brand-copy">
            Supervisá tus servicios, entendé cada incidente y compartí el estado
            real de tu operacion desde un solo lugar.
          </p>
        </div>
        <div className="signal-card">
          <div className="signal-topline"><span className="status-dot" /><span>Red operativa</span><strong>99,9%</strong></div>
          <div className="signal-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <p>Visibilidad continua para decisiones mas rapidas.</p>
        </div>
        <div className="brand-footer"><span>API</span><span>WORKERS</span><span>STATUS PAGE</span></div>
      </section>

      <section className="form-panel">
        <div className="form-wrap">
          <div className="form-heading">
            <p className="eyebrow">ESPACIO DE CLIENTES</p>
            <h2>{isRegistering ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
            <p>{isRegistering ? 'Empieza a monitorear tus servicios en minutos.' : 'Ingresa para revisar el estado de tus servicios.'}</p>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Tipo de acceso">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} role="tab" aria-selected={mode === 'login'} type="button">Iniciar sesion</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} role="tab" aria-selected={mode === 'register'} type="button">Registrarme</button>
          </div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Correo electronico</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vos@empresa.com" autoComplete="email" required />
            <div className="label-row"><label htmlFor="password">Contrasena</label>{!isRegistering && <button type="button">La olvidaste?</button>}</div>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimo 8 caracteres" autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength={8} required />
            {isRegistering && <label className="check-row" htmlFor="terms"><input id="terms" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Acepto los terminos de uso y la politica de privacidad.</span></label>}
            <button className="submit-button" type="submit">{isRegistering ? 'Crear cuenta' : 'Ingresar al panel'}<span aria-hidden="true">-&gt;</span></button>
            {message && <p className="form-message" role="status">{message}</p>}
          </form>
          <p className="security-note"><span aria-hidden="true">*</span>Tus credenciales se enviaran de forma segura a la API.</p>
        </div>
      </section>
    </main>
  )
}

function Dashboard({ email, onLogout, onShowPublic }: { email: string; onLogout: () => void; onShowPublic: () => void }) {
  const [serviceList, setServiceList] = useState(initialServices)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [publicEnabled, setPublicEnabled] = useState(false)
  const publicUrl = 'https://statushub.app/status/eduardo'

  function openCreateForm() {
    setEditingService(null)
    setIsFormOpen(true)
  }

  function openEditForm(service: Service) {
    setEditingService(service)
    setIsFormOpen(true)
  }

  function saveService(values: ServiceFormValues) {
    if (editingService) {
      setServiceList((current) => current.map((service) => service === editingService ? { ...service, ...values } : service))
    } else {
      setServiceList((current) => [...current, { ...values, status: 'operational', availability: '100%', latency: '--' }])
    }
    setIsFormOpen(false)
  }

  function deleteService(service: Service) {
    if (window.confirm(`Eliminar ${service.name}?`)) {
      setServiceList((current) => current.filter((item) => item !== service))
    }
  }

  async function copyPublicUrl() {
    await navigator.clipboard?.writeText(publicUrl)
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><strong>StatusHub</strong></div>
        <nav className="main-nav" aria-label="Navegacion principal">
          <a className="nav-link active" href="#dashboard"><span aria-hidden="true">◈</span> Resumen</a>
          <a className="nav-link" href="#services"><span aria-hidden="true">▦</span> Servicios</a>
          <a className="nav-link" href="#incidents"><span aria-hidden="true">◷</span> Incidentes</a>
          <button className="nav-link" type="button" onClick={onShowPublic}><span aria-hidden="true">↗</span> Pagina publica</button>
        </nav>
        <div className="sidebar-bottom"><div className="help-box"><strong>Todo bajo control</strong><span>Tu monitoreo esta activo.</span></div><button className="logout-button" type="button" onClick={onLogout}>Salir <span aria-hidden="true">↗</span></button></div>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header"><div><p className="eyebrow">VISTA GENERAL / 30 DIAS</p><h1>Buenos dias, {email ? email.split('@')[0] : 'cliente'}.</h1></div><div className="header-actions"><button className="icon-button" type="button" aria-label="Notificaciones">◌<span className="notification-dot" /></button><div className="avatar" aria-label="Perfil del cliente">CL</div></div></header>
        <div className="dashboard-banner"><div><span className="live-pill"><i /> EN VIVO</span><strong>Tu infraestructura esta operativa</strong><p>3 de 4 servicios funcionan normalmente. Hay un incidente que requiere tu atencion.</p></div><span className="banner-time">Actualizado hace 2 min</span></div>
        <section className={`publication-card ${publicEnabled ? 'enabled' : ''}`}><div><p className="eyebrow">RF-07 / PAGINA PUBLICA</p><strong>{publicEnabled ? 'Tu pagina de estado esta publicada' : 'Comparte el estado de tus servicios'}</strong><p>{publicEnabled ? 'Los visitantes pueden consultar los servicios que marcaste como publicos.' : 'Activa un enlace publico para que tus usuarios consulten el estado sin iniciar sesion.'}</p>{publicEnabled && <code>{publicUrl}</code>}</div><div className="publication-actions"><button className="outline-button" type="button" onClick={() => setPublicEnabled((enabled) => !enabled)}>{publicEnabled ? 'Desactivar pagina' : 'Publicar pagina'}</button>{publicEnabled && <><button className="copy-button" type="button" onClick={copyPublicUrl}>Copiar enlace</button><button className="open-public-button" type="button" onClick={onShowPublic}>Abrir pagina ↗</button></>}</div></section>

        <section className="metric-grid" aria-label="Metricas principales">
          <article className="metric-card"><div className="metric-label"><span>Disponibilidad global</span><span className="metric-icon">◎</span></div><strong>99,94%</strong><span className="positive">↑ 0,12% vs. período anterior</span></article>
          <article className="metric-card alert-metric"><div className="metric-label"><span>Servicios monitoreados</span><span className="metric-icon">▦</span></div><strong>4</strong><span className="warning">1 requiere atencion</span></article>
          <article className="metric-card"><div className="metric-label"><span>Incidentes abiertos</span><span className="metric-icon">◷</span></div><strong>1</strong><span className="muted">Ultima deteccion hace 8 min</span></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">RF-05 / HISTORIAL</p><h2>Disponibilidad</h2></div><button className="period-button" type="button">Ultimos 30 dias <span>⌄</span></button></div><div className="chart-summary"><strong>99,94%</strong><span>Promedio del periodo</span></div><div className="chart" aria-label="Grafico de disponibilidad de los ultimos 30 dias">{chartValues.map((value, index) => <i key={`${value}-${index}`} className={index === 21 ? 'chart-bar dip' : 'chart-bar'} style={{ height: `${Math.max(32, (value - 99.9) * 900)}%` }} title={`${value}%`} />)}</div><div className="chart-axis"><span>12 ago</span><span>19 ago</span><span>26 ago</span><span>Hoy</span></div></article>
          <article className="panel level-panel"><div className="panel-heading"><div><p className="eyebrow">NIVELES DE DISPONIBILIDAD</p><h2>Tus nueves</h2></div><span className="level-badge">Nivel 3</span></div><p className="level-description">El nivel mas alto alcanzado en este periodo.</p><div className="level-scale">{levelScale.map((item, index) => <div className={`level-row ${index < 3 ? 'achieved' : ''}`} key={item.level}><span className="level-check">{index < 3 ? '✓' : '·'}</span><div><strong>{item.level}</strong><span>{item.name}</span></div><b>{item.value}</b></div>)}</div><div className="downtime"><span>Caida acumulada</span><strong>26 min 14 s</strong></div></article>
        </section>

        <section className="panel services-panel" id="services"><div className="panel-heading"><div><p className="eyebrow">RF-02 / RF-03</p><h2>Tus servicios</h2></div><button className="outline-button" type="button" onClick={openCreateForm}>+ Agregar servicio</button></div><div className="service-list">{serviceList.map((service) => <ServiceRow service={service} key={service.name} onEdit={openEditForm} onDelete={deleteService} />)}</div></section>
      </section>
      {isFormOpen && <ServiceModal service={editingService} onClose={() => setIsFormOpen(false)} onSave={saveService} />}
    </main>
  )
}

function PublicStatusPage({ onBack }: { onBack: () => void }) {
  const publicServices = initialServices.filter((service) => service.isPublic)
  const [searchTerm, setSearchTerm] = useState('')
  const filteredServices = publicServices.filter((service) => `${service.name} ${service.url}`.toLowerCase().includes(searchTerm.toLowerCase().trim()))
  const hasIncident = publicServices.some((service) => service.status !== 'operational')

  return <main className="public-page"><header className="public-header"><div className="public-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><strong>StatusHub</strong></div><span className="public-url">statushub.app/status/eduardo</span><button className="public-back" type="button" onClick={onBack}>Volver al panel</button></header><section className="public-hero"><div><p className="eyebrow">PAGINA DE ESTADO</p><h1>Estado de los servicios</h1><p>Una vista publica de la infraestructura de StatusHub.</p></div><div className={`public-overall ${hasIncident ? 'attention' : ''}`}><i />{hasIncident ? 'Hay un incidente activo' : 'Todos los sistemas operativos'}</div></section><section className="public-content"><div className="public-summary"><span className="summary-icon">{hasIncident ? '!' : '✓'}</span><div><strong>{hasIncident ? 'Estamos investigando un incidente' : 'Todo funciona correctamente'}</strong><span>Ultima actualizacion hace 2 minutos</span></div></div><label className="public-search" htmlFor="public-service-search"><span aria-hidden="true">⌕</span><input id="public-service-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar servicio por nombre o URL" /></label><div className="public-service-list">{filteredServices.length > 0 ? filteredServices.map((service) => <article className="public-service" key={service.name}><div className="public-service-title"><span className={`service-dot ${service.status}`} /><div><strong>{service.name}</strong><span>{service.url}</span></div></div><div className="public-service-state"><strong>{service.status === 'operational' ? 'Operativo' : 'Degradado'}</strong><span>Disponibilidad {service.availability}</span></div><span className="public-service-chevron">›</span></article>) : <p className="empty-search">No encontramos servicios públicos que coincidan con “{searchTerm}”.</p>}</div><p className="public-footer">Los datos de esta pagina son de solo lectura. StatusHub verifica estos servicios periodicamente.</p></section></main>
}

function ServiceRow({ service, onEdit, onDelete }: { service: Service; onEdit: (service: Service) => void; onDelete: (service: Service) => void }) {
  const statusText = service.status === 'down' ? 'Caido' : service.status === 'degraded' ? 'Degradado' : 'Operativo'
  return <div className={`service-row ${service.status === 'down' ? 'is-down' : ''}`}><div className="service-name"><span className={`service-dot ${service.status}`} /><div><strong>{service.name}</strong><span>{service.url}</span></div></div><div className="service-status"><span className={`status-label ${service.status}`}>{statusText}</span>{service.incident && <span className="incident-text">{service.incident}</span>}</div><div className="service-stat"><span>Disponibilidad</span><strong>{service.availability}</strong></div><div className="service-stat"><span>Latencia</span><strong>{service.latency}</strong></div><div className="service-actions"><button type="button" onClick={() => onEdit(service)}>Editar</button><button type="button" onClick={() => onDelete(service)}>Eliminar</button></div></div>
}

function ServiceModal({ service, onClose, onSave }: { service: Service | null; onClose: () => void; onSave: (values: ServiceFormValues) => void }) {
  const [name, setName] = useState(service?.name ?? '')
  const [url, setUrl] = useState(service?.url ?? '')
  const [interval, setInterval] = useState(service?.interval ?? 60)
  const [isPublic, setIsPublic] = useState(service?.isPublic ?? false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ name, url, interval, isPublic })
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="service-modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title"><div className="modal-heading"><div><p className="eyebrow">RF-02 / SERVICIO PROPIO</p><h2 id="service-modal-title">{service ? 'Editar servicio' : 'Agregar servicio'}</h2></div><button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">×</button></div><p className="modal-copy">Configurá el recurso que el checker verificará periódicamente.</p><form className="service-form" onSubmit={handleSubmit}><label htmlFor="service-name">Nombre del servicio</label><input id="service-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. API de pagos" required /><label htmlFor="service-url">URL o endpoint</label><input id="service-url" type="url" value={url.startsWith('http') ? url : `https://${url}`} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.ejemplo.com" required /><label htmlFor="service-interval">Intervalo de chequeo</label><select id="service-interval" value={interval} onChange={(event) => setInterval(Number(event.target.value))}><option value={30}>Cada 30 segundos</option><option value={60}>Cada 1 minuto</option><option value={300}>Cada 5 minutos</option><option value={600}>Cada 10 minutos</option></select><label className="public-check" htmlFor="service-public"><input id="service-public" type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /><span><strong>Mostrar en pagina publica</strong><small>Los visitantes podran consultar el estado de este servicio.</small></span></label><div className="modal-actions"><button className="cancel-button" type="button" onClick={onClose}>Cancelar</button><button className="submit-button" type="submit">{service ? 'Guardar cambios' : 'Agregar servicio'}<span aria-hidden="true">-&gt;</span></button></div></form></section></div>
}

export default App
