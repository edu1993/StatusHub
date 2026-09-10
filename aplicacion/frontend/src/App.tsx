import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AuthMode = 'login' | 'register'
type ServiceStatus = 'operational' | 'degraded' | 'down'

type Service = {
  name: string
  url: string
  status: ServiceStatus
  availability: string
  latency: string
  incident?: string
}

const services: Service[] = [
  {
    name: 'API principal',
    url: 'api.statushub.app',
    status: 'operational',
    availability: '99,98%',
    latency: '184 ms',
  },
  {
    name: 'Tienda online',
    url: 'tienda.ejemplo.com',
    status: 'down',
    availability: '96,42%',
    latency: '--',
    incident: 'Timeout · hace 8 min',
  },
  {
    name: 'Web institucional',
    url: 'statushub.app',
    status: 'operational',
    availability: '99,999%',
    latency: '92 ms',
  },
  {
    name: 'Panel de clientes',
    url: 'panel.statushub.app',
    status: 'degraded',
    availability: '99,72%',
    latency: '642 ms',
    incident: 'Latencia elevada · hace 22 min',
  },
]

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

  if (isAuthenticated) {
    return <Dashboard email={email} onLogout={() => setIsAuthenticated(false)} />
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

function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><strong>StatusHub</strong></div>
        <nav className="main-nav" aria-label="Navegacion principal">
          <a className="nav-link active" href="#dashboard"><span aria-hidden="true">◈</span> Resumen</a>
          <a className="nav-link" href="#services"><span aria-hidden="true">▦</span> Servicios</a>
          <a className="nav-link" href="#incidents"><span aria-hidden="true">◷</span> Incidentes</a>
          <a className="nav-link" href="#public-page"><span aria-hidden="true">↗</span> Pagina publica</a>
        </nav>
        <div className="sidebar-bottom"><div className="help-box"><strong>Todo bajo control</strong><span>Tu monitoreo esta activo.</span></div><button className="logout-button" type="button" onClick={onLogout}>Salir <span aria-hidden="true">↗</span></button></div>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header"><div><p className="eyebrow">VISTA GENERAL / 30 DIAS</p><h1>Buenos dias, {email ? email.split('@')[0] : 'cliente'}.</h1></div><div className="header-actions"><button className="icon-button" type="button" aria-label="Notificaciones">◌<span className="notification-dot" /></button><div className="avatar" aria-label="Perfil del cliente">CL</div></div></header>
        <div className="dashboard-banner"><div><span className="live-pill"><i /> EN VIVO</span><strong>Tu infraestructura esta operativa</strong><p>3 de 4 servicios funcionan normalmente. Hay un incidente que requiere tu atencion.</p></div><span className="banner-time">Actualizado hace 2 min</span></div>

        <section className="metric-grid" aria-label="Metricas principales">
          <article className="metric-card"><div className="metric-label"><span>Disponibilidad global</span><span className="metric-icon">◎</span></div><strong>99,94%</strong><span className="positive">↑ 0,12% vs. período anterior</span></article>
          <article className="metric-card alert-metric"><div className="metric-label"><span>Servicios monitoreados</span><span className="metric-icon">▦</span></div><strong>4</strong><span className="warning">1 requiere atencion</span></article>
          <article className="metric-card"><div className="metric-label"><span>Incidentes abiertos</span><span className="metric-icon">◷</span></div><strong>1</strong><span className="muted">Ultima deteccion hace 8 min</span></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">RF-05 / HISTORIAL</p><h2>Disponibilidad</h2></div><button className="period-button" type="button">Ultimos 30 dias <span>⌄</span></button></div><div className="chart-summary"><strong>99,94%</strong><span>Promedio del periodo</span></div><div className="chart" aria-label="Grafico de disponibilidad de los ultimos 30 dias">{chartValues.map((value, index) => <i key={`${value}-${index}`} className={index === 21 ? 'chart-bar dip' : 'chart-bar'} style={{ height: `${Math.max(32, (value - 99.9) * 900)}%` }} title={`${value}%`} />)}</div><div className="chart-axis"><span>12 ago</span><span>19 ago</span><span>26 ago</span><span>Hoy</span></div></article>
          <article className="panel level-panel"><div className="panel-heading"><div><p className="eyebrow">NIVELES DE DISPONIBILIDAD</p><h2>Tus nueves</h2></div><span className="level-badge">Nivel 3</span></div><p className="level-description">El nivel mas alto alcanzado en este periodo.</p><div className="level-scale">{levelScale.map((item, index) => <div className={`level-row ${index < 3 ? 'achieved' : ''}`} key={item.level}><span className="level-check">{index < 3 ? '✓' : '·'}</span><div><strong>{item.level}</strong><span>{item.name}</span></div><b>{item.value}</b></div>)}</div><div className="downtime"><span>Caida acumulada</span><strong>26 min 14 s</strong></div></article>
        </section>

        <section className="panel services-panel" id="services"><div className="panel-heading"><div><p className="eyebrow">RF-02 / RF-03</p><h2>Tus servicios</h2></div><button className="outline-button" type="button">+ Agregar servicio</button></div><div className="service-list">{services.map((service) => <ServiceRow service={service} key={service.name} />)}</div></section>
      </section>
    </main>
  )
}

function ServiceRow({ service }: { service: Service }) {
  const statusText = service.status === 'down' ? 'Caido' : service.status === 'degraded' ? 'Degradado' : 'Operativo'
  return <div className={`service-row ${service.status === 'down' ? 'is-down' : ''}`}><div className="service-name"><span className={`service-dot ${service.status}`} /><div><strong>{service.name}</strong><span>{service.url}</span></div></div><div className="service-status"><span className={`status-label ${service.status}`}>{statusText}</span>{service.incident && <span className="incident-text">{service.incident}</span>}</div><div className="service-stat"><span>Disponibilidad</span><strong>{service.availability}</strong></div><div className="service-stat"><span>Latencia</span><strong>{service.latency}</strong></div><button className="row-menu" type="button" aria-label={`Opciones de ${service.name}`}>•••</button></div>
}

export default App
