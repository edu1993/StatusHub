import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { getServiceHourChecks } from './api'
import type { ApiService } from './api'
import Icon from './Icon'

type Check = ApiService['recent_checks'][number]
type ChartMode = 'hours' | 'minutes'

export default function LatencyChart({
  service,
  title = 'Latencia (24 hs)',
  embedded = false,
  canInspectMinutes = true,
}: {
  service: ApiService
  title?: string
  embedded?: boolean
  canInspectMinutes?: boolean
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState<ChartMode>('hours')
  const [minuteChecks, setMinuteChecks] = useState<Check[]>([])
  const [minuteLabel, setMinuteLabel] = useState('')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [loadingHour, setLoadingHour] = useState(false)
  const [chartError, setChartError] = useState('')
  const [selectedHour, setSelectedHour] = useState('')

  const hourlyChecks = service.recent_checks
  const activeChecks = mode === 'hours' ? hourlyChecks : minuteChecks
  const maxLatency = Math.max(...hourlyChecks.map((check) => check.latency), 100)

  useEffect(() => {
    setMode('hours')
    setSelectedHour('')
    setMinuteChecks([])
    setMinuteLabel('')
    setHoverIndex(null)
    setChartError('')
  }, [service.id])

  useEffect(() => {
    if (!modalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen])

  function showHours() {
    setChartError('')
    setSelectedHour('')
    setHoverIndex(null)
    setMode('hours')
  }

  function openModal() {
    showHours()
    setModalOpen(true)
  }

  async function showMinutes(check: Check) {
    if (!canInspectMinutes) return
    setLoadingHour(true)
    setChartError('')
    setHoverIndex(null)
    try {
      const checks = await getServiceHourChecks(service.id, check.hour_start)
      setSelectedHour(check.hour_start)
      setMinuteLabel(`${check.timestamp} - ${check.timestamp.slice(0, 2)}:59`)
      setMinuteChecks(checks)
      setMode('minutes')
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'No fue posible cargar el detalle por minuto.')
    } finally {
      setLoadingHour(false)
    }
  }

  function onChartBarClick(event: MouseEvent, check: Check) {
    if (mode === 'hours' && canInspectMinutes) {
      event.stopPropagation()
      void showMinutes(check)
    }
  }

  const stats = useMemo(() => {
    const upChecks = activeChecks.filter((c) => c.status === 'up')
    const avg = upChecks.length
      ? Math.round(upChecks.reduce((sum, c) => sum + c.latency, 0) / upChecks.length)
      : null
    const max = upChecks.length ? Math.max(...upChecks.map((c) => c.latency)) : null
    const min = upChecks.length ? Math.min(...upChecks.map((c) => c.latency)) : null
    const uptimePct = activeChecks.length
      ? ((upChecks.length / activeChecks.length) * 100).toFixed(1)
      : null
    return { avg, max, min, uptimePct }
  }, [activeChecks])

  const interactiveBody = (
    <div className={embedded ? 'latency-embedded' : 'latency-modal-body'}>
      <div className="chart-toolbar">
        <div className="chart-toolbar-left">
          <h3>
            <Icon name="activity" />
            {mode === 'hours' ? 'Latencia · Últimas 24 Horas' : `Minuto a Minuto (${minuteLabel})`}
          </h3>
          <p className="chart-modal-copy">
            {mode === 'hours'
              ? (canInspectMinutes
                ? 'Haz clic en cualquier barra o elige una hora para ver el desglose minuto a minuto.'
                : 'Latencia promedio por hora en las últimas 24 horas.')
              : 'Verificaciones reales registradas durante esta franja horaria.'}
          </p>
        </div>

        <div className="chart-toolbar-actions">
          {mode === 'minutes' ? (
            <button className="chart-back-button" type="button" onClick={showHours}>
              <Icon name="arrowLeft" /> Volver a 24 hs
            </button>
          ) : (
            canInspectMinutes && hourlyChecks.length > 0 && (
              <label className="chart-period-selector">
                <span>Ir a hora</span>
                <select
                  value={selectedHour}
                  onChange={(event) => {
                    const check = hourlyChecks.find((item) => item.hour_start === event.target.value)
                    if (check) void showMinutes(check)
                  }}
                >
                  <option value="">Seleccionar hora…</option>
                  {hourlyChecks.map((check) => (
                    <option key={check.hour_start} value={check.hour_start}>
                      {check.timestamp} hs ({check.status === 'down' ? 'Fallo' : `${check.latency} ms`})
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
        </div>
      </div>

      {activeChecks.length > 0 && (
        <div className="chart-stats-row">
          <div><span>Promedio</span><strong>{stats.avg === null ? '—' : `${stats.avg} ms`}</strong></div>
          <div><span>Máxima</span><strong>{stats.max === null ? '—' : `${stats.max} ms`}</strong></div>
          <div><span>Mínima</span><strong>{stats.min === null ? '—' : `${stats.min} ms`}</strong></div>
          <div><span>Disponibilidad</span><strong>{stats.uptimePct === null ? '—' : `${stats.uptimePct}%`}</strong></div>
        </div>
      )}

      {chartError && <p className="chart-error-banner" role="alert">{chartError}</p>}

      {loadingHour ? (
        <p className="chart-loading">Cargando verificaciones…</p>
      ) : activeChecks.length === 0 ? (
        <p className="chart-empty">Todavía no hay verificaciones registradas para este período.</p>
      ) : (
        <ChartBars
          checks={activeChecks}
          mode={mode}
          canInspectMinutes={canInspectMinutes}
          avgLatency={stats.avg}
          hoverIndex={hoverIndex}
          onHover={setHoverIndex}
          onClick={onChartBarClick}
        />
      )}

      <div className="chart-legend">
        <span><i className="legend-up" /> Latencia (ms)</span>
        <span><i className="legend-down" /> Fallo</span>
        {stats.avg !== null && <span><i className="legend-avg" /> Promedio ({stats.avg} ms)</span>}
      </div>
    </div>
  )

  if (embedded) {
    return interactiveBody
  }

  return (
    <>
      <button
        className="latency-chart"
        type="button"
        onClick={openModal}
        aria-label={`Abrir detalle de latencia de ${service.name}`}
      >
        <span className="latency-chart-heading">
          <span><Icon name="activity" /> {title}</span>
          <span className="latency-expand-cta">{maxLatency} ms · Ampliar</span>
        </span>
        <span className="latency-bars" aria-hidden="true">
          {hourlyChecks.length === 0 ? (
            <span className="latency-bars-empty">Sin datos recientes</span>
          ) : (
            hourlyChecks.map((check, index) => (
              <i
                key={`${check.hour_start}-${index}`}
                className={check.status === 'down' ? 'latency-bar down' : 'latency-bar'}
                style={{ height: `${check.status === 'down' ? 40 : Math.max(5, Math.round((check.latency / maxLatency) * 40))}px` }}
                title={`${check.timestamp} · ${check.status === 'down' ? check.error_message ?? 'Fallo detectado' : `${check.latency} ms`}`}
              />
            ))
          )}
        </span>
        <span className="latency-chart-axis">
          <span>Hace 24 horas</span>
          <span>Ahora</span>
        </span>
      </button>

      {modalOpen && createPortal(
        <div
          className="chart-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false)
          }}
        >
          <section className="chart-modal" role="dialog" aria-modal="true" aria-labelledby={`chart-title-${service.id}`}>
            <button
              className="chart-modal-close"
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Cerrar gráfico"
            >
              <Icon name="close" />
            </button>
            <div className="chart-modal-service-header">
              <h2 id={`chart-title-${service.id}`}>{service.name}</h2>
              <span>{service.url}</span>
            </div>
            {interactiveBody}
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

function ChartBars({
  checks,
  mode,
  canInspectMinutes,
  avgLatency,
  hoverIndex,
  onHover,
  onClick,
}: {
  checks: Check[]
  mode: ChartMode
  canInspectMinutes: boolean
  avgLatency: number | null
  hoverIndex: number | null
  onHover: (index: number | null) => void
  onClick: (event: MouseEvent, check: Check) => void
}) {
  const max = Math.max(...checks.map((check) => check.latency), 100)
  const hoveredCheck = hoverIndex === null ? null : checks[hoverIndex] ?? null
  const avgPx = avgLatency !== null ? Math.min(168, Math.max(0, Math.round((avgLatency / max) * 168))) : null
  const ratio = hoverIndex === null ? 0.5 : (hoverIndex + 0.5) / checks.length
  const alignClass = ratio < 0.2 ? 'align-left' : ratio > 0.8 ? 'align-right' : ''

  return (
    <div className={`chart-plot ${mode === 'minutes' ? 'minute-plot' : ''}`} onMouseLeave={() => onHover(null)}>
      <div className="chart-y-axis" aria-hidden="true">
        <span>{max} ms</span>
        <span>{Math.round(max / 2)} ms</span>
        <span>0 ms</span>
      </div>

      <div
        className="chart-bars-area"
        role="img"
        aria-label={mode === 'hours' ? 'Latencia por hora de las últimas 24 horas' : 'Latencia minuto a minuto'}
      >
        {avgPx !== null && (
          <div className="chart-avg-rule" style={{ bottom: `${avgPx}px` }} aria-hidden="true" />
        )}

        <div className={`bar-columns latency-columns ${mode === 'minutes' && checks.length > 24 ? 'dense' : ''}`}>
          {checks.map((check, index) => {
            const barPx = check.status === 'down' ? 168 : Math.max(8, Math.round((check.latency / max) * 168))
            const dimmed = hoverIndex !== null && hoverIndex !== index
            const clickable = mode === 'hours' && canInspectMinutes
            return (
              <div
                key={`${check.timestamp}-${index}`}
                className={`bar-slot ${clickable ? 'clickable' : ''}`}
                onMouseEnter={() => onHover(index)}
                onClick={(event) => onClick(event, check)}
              >
                <span
                  className={`latency-bar-fill ${check.status === 'down' ? 'down' : 'up'}${dimmed ? ' dimmed' : ''}`}
                  style={{ height: `${barPx}px` }}
                />
              </div>
            )
          })}
        </div>

        {hoveredCheck && (
          <div
            className={`chart-tooltip ${alignClass}`}
            style={{ left: `${ratio * 100}%` }}
          >
            <strong><Icon name="clock" />{hoveredCheck.timestamp}{mode === 'hours' ? ' hs' : ''}</strong>
            {hoveredCheck.status === 'down'
              ? <span className="tooltip-error">{hoveredCheck.error_message ?? `HTTP ${hoveredCheck.status_code ?? 'sin respuesta'}`}</span>
              : <><b>{hoveredCheck.latency} ms</b><span>HTTP {hoveredCheck.status_code ?? '—'}</span></>}
            {mode === 'hours' && canInspectMinutes && <span className="tooltip-cta">Clic para ver minuto a minuto</span>}
          </div>
        )}
      </div>

      <div className="chart-plot-axis">
        <span>{mode === 'hours' ? (checks[0]?.timestamp ? `${checks[0].timestamp} hs` : 'Hace 24 horas') : '00 min'}</span>
        <span>{mode === 'hours' ? 'Ahora' : `${checks.length} verificaciones`}</span>
      </div>
    </div>
  )
}
