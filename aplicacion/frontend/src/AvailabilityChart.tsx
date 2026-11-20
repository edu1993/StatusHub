import { useMemo, useState } from 'react'
import type { ApiService } from './api'
import Icon from './Icon'

type HourBucket = {
  key: string
  label: string
  total: number
  up: number
  down: number
  availability: number
  avgLatency: number
}

export default function AvailabilityChart({ services }: { services: ApiService[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const buckets = useMemo<HourBucket[]>(() => {
    const map = new Map<string, { label: string; total: number; up: number; down: number; latencySum: number; latencyCount: number }>()
    for (const service of services) {
      for (const check of service.recent_checks) {
        const key = check.hour_start || check.timestamp
        const current = map.get(key) ?? {
          label: check.timestamp,
          total: 0,
          up: 0,
          down: 0,
          latencySum: 0,
          latencyCount: 0,
        }
        current.total += 1
        if (check.status === 'up') {
          current.up += 1
          current.latencySum += check.latency
          current.latencyCount += 1
        } else {
          current.down += 1
        }
        map.set(key, current)
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([key, item]) => ({
        key,
        label: item.label,
        total: item.total,
        up: item.up,
        down: item.down,
        availability: item.total > 0 ? (item.up / item.total) * 100 : 100,
        avgLatency: item.latencyCount > 0 ? Math.round(item.latencySum / item.latencyCount) : 0,
      }))
  }, [services])

  const overallAvailability = useMemo(() => {
    const total = buckets.reduce((acc, item) => acc + item.total, 0)
    const up = buckets.reduce((acc, item) => acc + item.up, 0)
    if (!total) return null
    return (up / total) * 100
  }, [buckets])

  const perfectHours = useMemo(() => buckets.filter((item) => item.down === 0).length, [buckets])
  const hovered = hoverIndex === null ? null : buckets[hoverIndex] ?? null

  const tooltipAlignClass = hoverIndex === null || buckets.length === 0
    ? ''
    : (hoverIndex + 0.5) / buckets.length < 0.2
      ? 'align-left'
      : (hoverIndex + 0.5) / buckets.length > 0.8
        ? 'align-right'
        : ''

  return (
    <section className="availability-history-card" aria-label="Disponibilidad histórica de las últimas 24 horas">
      <div className="availability-history-head">
        <div>
          <h3><Icon name="barChart" />Disponibilidad Histórica (Últimas 24 hs)</h3>
          <p>Evolución horaria de disponibilidad agregada de tus servicios monitoreados.</p>
        </div>
        {overallAvailability !== null && (
          <div className="availability-history-kpis">
            <span className={`availability-pill ${overallAvailability >= 99 ? 'good' : overallAvailability >= 90 ? 'warn' : 'bad'}`}>
              {overallAvailability.toFixed(2)}% en 24 hs
            </span>
            <span className="availability-meta-chip">
              {perfectHours}/{buckets.length} hs sin fallos
            </span>
          </div>
        )}
      </div>

      {buckets.length === 0 ? (
        <p className="availability-empty">
          Todavía no hay suficientes verificaciones históricas para graficar las últimas 24 horas.
        </p>
      ) : (
        <>
          <div className="availability-plot" onMouseLeave={() => setHoverIndex(null)}>
            <div className="availability-y-axis" aria-hidden="true">
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <div className="availability-bars-area" role="img" aria-label="Gráfico de barras de disponibilidad histórica por hora">
              <div className="bar-columns">
                {buckets.map((bucket, index) => {
                  const barPx = Math.max(8, Math.round((Math.min(100, Math.max(0, bucket.availability)) / 100) * 116))
                  const tone = bucket.availability >= 99 ? 'good' : bucket.availability >= 90 ? 'warn' : 'bad'
                  const dimmed = hoverIndex !== null && hoverIndex !== index
                  return (
                    <div
                      key={bucket.key}
                      className="bar-slot"
                      onMouseEnter={() => setHoverIndex(index)}
                    >
                      <span
                        className={`availability-bar-fill ${tone}${dimmed ? ' dimmed' : ''}`}
                        style={{ height: `${barPx}px` }}
                      />
                    </div>
                  )
                })}
              </div>

              {hovered && (
                <div
                  className={`chart-tooltip ${tooltipAlignClass}`}
                  style={{ left: `${((hoverIndex ?? 0) + 0.5) / buckets.length * 100}%` }}
                >
                  <strong><Icon name="clock" />{hovered.label} hs</strong>
                  <b className={hovered.availability < 90 ? 'tooltip-error' : ''}>
                    {hovered.availability.toFixed(1)}% disponible
                  </b>
                  <span>{hovered.up} operativos · {hovered.down} caídos</span>
                  {hovered.avgLatency > 0 && <span>Latencia media: {hovered.avgLatency} ms</span>}
                </div>
              )}
            </div>
          </div>

          <div className="availability-history-footer">
            <div className="availability-axis-labels">
              <span>{buckets[0]?.label ?? 'Hace 24 hs'}</span>
              {buckets.length > 2 && <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>}
              <span>{buckets.length > 1 ? buckets[buckets.length - 1]?.label : 'Ahora'}</span>
            </div>
            <div className="chart-legend compact">
              <span><i className="legend-up" /> ≥ 99%</span>
              <span><i className="legend-warn" /> 90–98.9%</span>
              <span><i className="legend-down" /> &lt; 90%</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
