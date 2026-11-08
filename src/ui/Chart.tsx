import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
// A real CSS file in the build, which the production CSP (style-src 'self') allows; uPlot injects no <style> itself.
import 'uplot/dist/uPlot.min.css'

export interface ChartSeries {
  label: string
  /** One value per x; `null` leaves a gap (the line carries on across it). */
  values: readonly (number | null)[]
}

export interface ChartProps {
  /** Ascending x values shared by every series. */
  x: readonly number[]
  series: readonly ChartSeries[]
  /** Vertical lines at an x, for example the Curve Peak of the Performance Curve. */
  markers?: readonly { x: number; label?: string }[]
  /** Shaded ranges of x behind the lines, for example a confidence interval. */
  bands?: readonly { from: number; to: number }[]
  /** What the x axis and the legend call an x. Default: the number as it is. */
  formatX?: (x: number) => string
  xLabel?: string
  /** For people who cannot see the chart. */
  description: string
  height?: number
}

const palette = ['#ffb35c', '#6cb6ff', '#4ade80', '#f472b6']

/** A line chart (uPlot, ADR-0001) in the colours of the app. It is rebuilt when its props change, so pass stable props. */
export function Chart({ x, series, markers = [], bands = [], formatX = String, xLabel = 'x', description, height = 220 }: ChartProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const css = getComputedStyle(el)
    const muted = css.getPropertyValue('--muted').trim() || '#98a2b3'
    const line = css.getPropertyValue('--line').trim() || '#243044'
    const accent = css.getPropertyValue('--accent').trim() || palette[0]!
    const axis = { stroke: muted, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 } }
    const plot = new uPlot(
      {
        width: el.clientWidth || 480,
        height,
        // a little room so the first and last points do not sit on the frame (and a lone point is not on a collapsed axis)
        scales: { x: { time: false, range: (_u, min, max) => [min - ((max - min) * 0.04 || 1), max + ((max - min) * 0.04 || 1)] } },
        axes: [
          { ...axis, space: 70, incrs: [1, 2, 5, 10, 20, 50, 100], values: (_u, splits) => splits.map((v) => formatX(v)) },
          axis,
        ],
        series: [
          { label: xLabel, value: (_u, v) => (v == null ? '--' : formatX(v)) },
          ...series.map((s, i) => ({ label: s.label, stroke: palette[i % palette.length]!, width: 2, spanGaps: true })),
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
              u.ctx.strokeStyle = accent
              u.ctx.fillStyle = accent
              u.ctx.setLineDash([6, 4])
              u.ctx.font = `${12 * devicePixelRatio}px system-ui, sans-serif`
              for (const m of markers) {
                const at = u.valToPos(m.x, 'x', true)
                u.ctx.beginPath()
                u.ctx.moveTo(at, u.bbox.top)
                u.ctx.lineTo(at, u.bbox.top + u.bbox.height)
                u.ctx.stroke()
                if (m.label) u.ctx.fillText(m.label, at + 4 * devicePixelRatio, u.bbox.top + 14 * devicePixelRatio)
              }
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
  }, [x, series, markers, bands, formatX, xLabel, height])
  return <div ref={host} className="chart" role="img" aria-label={description} />
}
