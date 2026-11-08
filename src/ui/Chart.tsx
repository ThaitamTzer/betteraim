import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
// A real CSS file in the build, which the production CSP (style-src 'self') allows; uPlot injects no <style> itself.
import 'uplot/dist/uPlot.min.css'

export interface ChartSeries {
  label: string
  /** One value per x; `null` leaves a gap (the line carries on across it). */
  values: readonly (number | null)[]
  /** Draw dots at the values instead of a line (for measured points next to a fitted curve). */
  dots?: boolean
}

export interface ChartProps {
  /** Ascending x values shared by every series. */
  x: readonly number[]
  series: readonly ChartSeries[]
  /**
   * Vertical lines at an x, for example the Curve Peak of the Performance Curve. Labels sit one line lower per marker, so markers close
   * together (the Curve Peak and the AI Coach's choice) stay readable; `tone` picks the line's colour (default `accent`).
   */
  markers?: readonly { x: number; label?: string; tone?: 'accent' | 'highlight' }[]
  /** Shaded ranges of x behind the lines, for example a confidence interval. */
  bands?: readonly { from: number; to: number }[]
  /** What the x axis and the legend call an x. Default: the number as it is. */
  formatX?: (x: number) => string
  xLabel?: string
  /** A logarithmic x axis (x must be > 0): equal ratios are equal distances, as for Sensitivity. */
  logX?: boolean
  /** For people who cannot see the chart. */
  description: string
  height?: number
}

const palette = ['#ffb35c', '#6cb6ff', '#4ade80', '#f472b6']

const TICK_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9]
/** Round ticks (20, 25, 30 ... 100, 150) for a log axis from `min` to `max`, whose own splits are decades and leave a short range bare. */
const logTicks = (min: number, max: number): number[] => {
  const ticks: number[] = []
  for (let decade = 10 ** Math.floor(Math.log10(min)); decade <= max; decade *= 10) {
    for (const step of TICK_STEPS) if (step * decade >= min && step * decade <= max) ticks.push(step * decade)
  }
  return ticks
}

/** A line chart (uPlot, ADR-0001) in the colours of the app. It is rebuilt when its props change, so pass stable props. */
export function Chart({ x, series, markers = [], bands = [], formatX = String, xLabel = 'x', logX = false, description, height = 220 }: ChartProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const css = getComputedStyle(el)
    const muted = css.getPropertyValue('--muted').trim() || '#98a2b3'
    const line = css.getPropertyValue('--line').trim() || '#243044'
    const accent = css.getPropertyValue('--accent').trim() || palette[0]!
    const tones = { accent, highlight: css.getPropertyValue('--on-target').trim() || palette[2]! }
    const axis = { stroke: muted, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 } }
    const plot = new uPlot(
      {
        width: el.clientWidth || 480,
        height,
        // a little room so the first and last points do not sit on the frame (and a lone point is not on a collapsed axis)
        scales: {
          x: logX
            ? { time: false, distr: 3, log: 10, range: (_u, min, max) => [min / 1.04, max * 1.04] }
            : { time: false, range: (_u, min, max) => [min - ((max - min) * 0.04 || 1), max + ((max - min) * 0.04 || 1)] },
        },
        axes: [
          {
            ...axis,
            space: 70,
            values: (_u, splits) => splits.map((v) => (v == null ? '' : formatX(v))),
            // uPlot's default log filter keeps only 1s, 2s and 3s or so of each decade and would blank these
            ...(logX && { splits: (_u: uPlot, _axis: number, min: number, max: number) => logTicks(min, max), filter: (_u: uPlot, splits: number[]) => splits }),
          },
          axis,
        ],
        series: [
          { label: xLabel, value: (_u, v) => (v == null ? '--' : formatX(v)) },
          ...series.map((s, i) => {
            const color = palette[i % palette.length]!
            return s.dots
              ? { label: s.label, stroke: color, width: 0, paths: () => null, points: { show: true, size: 7, fill: color, stroke: color } }
              : { label: s.label, stroke: color, width: 2, spanGaps: true }
          }),
        ],
        cursor: { drag: { x: false, y: false } },
        hooks: {
          // canvas drawing is not subject to the CSP; bands go behind the lines, markers in front
          drawClear: [
            (u) => {
              u.ctx.save()
              u.ctx.fillStyle = `${accent}33`
              for (const b of bands) {
                const left = u.valToPos(b.from, 'x', true)
                u.ctx.fillRect(left, u.bbox.top, u.valToPos(b.to, 'x', true) - left, u.bbox.height)
              }
              u.ctx.restore()
            },
          ],
          draw: [
            (u) => {
              u.ctx.save()
              u.ctx.setLineDash([6, 4])
              u.ctx.font = `${12 * devicePixelRatio}px system-ui, sans-serif`
              markers.forEach((m, i) => {
                const at = u.valToPos(m.x, 'x', true)
                u.ctx.strokeStyle = u.ctx.fillStyle = tones[m.tone ?? 'accent']
                u.ctx.beginPath()
                u.ctx.moveTo(at, u.bbox.top)
                u.ctx.lineTo(at, u.bbox.top + u.bbox.height)
                u.ctx.stroke()
                if (m.label) {
                  const nearRight = at > u.bbox.left + u.bbox.width * 0.8 // the label turns to the left of its line rather than run off the plot
                  u.ctx.textAlign = nearRight ? 'right' : 'left'
                  u.ctx.fillText(m.label, at + (nearRight ? -4 : 4) * devicePixelRatio, u.bbox.top + (14 + 16 * i) * devicePixelRatio)
                }
              })
              u.ctx.restore()
            },
          ],
        },
      },
      [[...x], ...series.map((s) => [...s.values])],
      el,
    )
    const resize = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }))
    resize.observe(el)
    return () => {
      resize.disconnect()
      plot.destroy()
    }
  }, [x, series, markers, bands, formatX, xLabel, logX, height])
  return <div ref={host} className="chart" role="img" aria-label={description} />
}
