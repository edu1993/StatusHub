import { useState } from 'react'
import type { MouseEvent } from 'react'
import { getServiceHourChecks } from './api'
import type { ApiService } from './api'
import Icon from './Icon'

type Check = ApiService['recent_checks'][number]
type ChartView = { title: string; checks: Check[]; mode: 'hours' | 'minutes' }

export default function LatencyChart({ service, title = 'Latencia (24 hs)' }: {
  service: ApiService
  title?: string
}) {
  const [chartView, setChartView] = useState<ChartView | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [loadingHour, setLoadingHour] = useState(false)
  const [chartError, setChartError] = useState('')
  const [selectedHour, setSelectedHour] = useState('')

  const hourlyChecks = service.recent_checks
  const maxLatency = Math.max(...hourlyChecks.map((check) => check.latency), 100)

  function showHours() {
    setChartError('')
    setSelectedHour('')
    setChartView({
      title: 'Detalle de Monitoreo - Últimas 24 Horas',
      checks: hourlyChecks,
      mode: 'hours',
    })
  }

  async function showMinutes(check: Check) {
    setLoadingHour(true)
    setChartError('')
    try {
      const checks = await getServiceHourChecks(service.id, check.hour_start)
      setSelectedHour(check.hour_start)
      setChartView({
        title: `Desglose Minuto a Minuto (${check.timestamp} - ${check.timestamp.slice(0, 2)}:59)`,
        checks,
        mode: 'minutes',
      })
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'No fue posible cargar el detalle por minuto.')
    } finally {
      setLoadingHour(false)
    }
  }

  function onChartBarClick(event: MouseEvent, check: Check) {
    if (chartView?.mode === 'hours') {
      event.stopPropagation()
      void showMinutes(check)
    }
  }

  return (
    <>
      <button className="latency-chart" type="button" onClick={showHours} aria-label={`Abrir detalle de latencia de ${service.name}`}>
        <span className="latency-chart-heading"><span><Icon name="activity" /> {title} · clic para ampliar</span><span>{maxLatency} ms</span></span>
        <span className="latency-bars" aria-hidden="true">
          {hourlyChecks.map((check, index) => <i
            key={`${check.hour_start}-${index}`}
            className={check.status === 'down' ? 'latency-bar down' : 'latency-bar'}
            style={{ height: `${check.status === 'down' ? 100 : Math.max(6, check.latency / maxLatency * 100)}%` }}
            title={`${check.timestamp} · ${check.status === 'down' ? check.error_message ?? 'Fallo detectado' : `${check.latency} ms`}`}
          />)}
        </span>
        <span className="latency-chart-axis"><span>Hace 24 horas</span><span>Ahora</span></span>
      </button>
      {chartError && <p className="chart-error" role="alert">{chartError}</p>}

      {chartView && <div className="chart-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setChartView(null)}>
        <section className="chart-modal" role="dialog" aria-modal="true" aria-labelledby={`chart-title-${service.id}`}>
          <button className="chart-modal-close" type="button" onClick={() => setChartView(null)} aria-label="Cerrar gráfico"><Icon name="close" /></button>
          <div className="chart-modal-heading">
            <h2 id={`chart-title-${service.id}`}><Icon name="activity" />{chartView.title}</h2>
            {chartView.mode === 'minutes' && <button className="chart-back-button" type="button" onClick={showHours}><Icon name="arrowLeft" /> Volver a 24 hs</button>}
          </div>
          {chartView.mode === 'hours' && <label className="chart-period-selector">Período
            <select value={selectedHour} onChange={(event) => {
              const check = hourlyChecks.find((item) => item.hour_start === event.target.value)
              if (check) void showMinutes(check)
            }}>
              <option value="">Selecciona una hora para ver el detalle</option>
              {hourlyChecks.map((check) => <option key={check.hour_start} value={check.hour_start}>{check.timestamp}</option>)}
            </select>
          </label>}
          <p className="chart-modal-copy">{chartView.mode === 'hours'
            ? 'Pasa el ratón sobre una barra para ver el estado y haz clic para ver el detalle por minuto.'
            : 'Verificaciones reales registradas durante esta hora.'}</p>
          {loadingHour && <p className="chart-loading">Cargando verificaciones…</p>}
          {chartView.checks.length === 0
            ? <p className="chart-empty">Todavía no hay verificaciones registradas para este período.</p>
            : <ChartBars
              checks={chartView.checks}
              mode={chartView.mode}
              hoverIndex={hoverIndex}
              onHover={setHoverIndex}
              onClick={onChartBarClick}
            />}
          <div className="chart-legend"><span><i className="legend-up" /> Latencia (ms)</span><span><i className="legend-down" /> Fallo</span></div>
        </section>
      </div>}
    </>
  )
}

function ChartBars({ checks, mode, hoverIndex, onHover, onClick }: {
  checks: Check[]
  mode: ChartView['mode']
  hoverIndex: number | null
  onHover: (index: number | null) => void
  onClick: (event: MouseEvent, check: Check) => void
}) {
  const max = Math.max(...checks.map((check) => check.latency), 100)
  const hoveredCheck = hoverIndex === null ? null : checks[hoverIndex]
  return <div className={`chart-plot ${mode === 'minutes' ? 'minute-plot' : ''}`} onMouseLeave={() => onHover(null)}>
    <span className="chart-limit">{max} ms</span>
    <svg viewBox={`0 0 ${checks.length * 20} 300`} preserveAspectRatio="none" role="img" aria-label={mode === 'hours' ? 'Latencia por hora de las últimas 24 horas' : 'Latencia minuto a minuto'}>
      {checks.map((check, index) => {
        const height = check.status === 'down' ? 300 : Math.max((check.latency / max) * 300, 10)
        const step = 20
        const width = step * 0.72
        return <g key={`${check.timestamp}-${index}`}>
          <rect x={index * step + (step - width) / 2} y={300 - height} width={width} height={height} rx="2" className={check.status === 'down' ? 'plot-bar down' : 'plot-bar'} opacity={hoverIndex === null || hoverIndex === index ? 1 : 0.35} />
          <rect x={index * step} y="0" width={step} height="300" fill="transparent" onMouseEnter={() => onHover(index)} onClick={(event) => onClick(event, check)} className={mode === 'hours' ? 'plot-hit clickable' : 'plot-hit'} />
        </g>
      })}
    </svg>
    {hoveredCheck && <div className="chart-tooltip" style={{ left: `${((hoverIndex ?? 0) + 0.5) / checks.length * 100}%` }}>
      <strong><Icon name="clock" />{hoveredCheck.timestamp}{mode === 'hours' ? ' hs' : ''}</strong>
      {hoveredCheck.status === 'down'
        ? <span className="tooltip-error">{hoveredCheck.error_message ?? `HTTP ${hoveredCheck.status_code ?? 'sin respuesta'}`}</span>
        : <><b>{hoveredCheck.latency} ms</b><span>HTTP {hoveredCheck.status_code ?? '—'}</span></>}
    </div>}
    <div className="chart-plot-axis"><span>{mode === 'hours' ? 'Hace 24 horas' : '00 min'}</span><span>{mode === 'hours' ? 'Ahora' : `${checks.length} verificaciones`}</span></div>
  </div>
}
