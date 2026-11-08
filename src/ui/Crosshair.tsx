import type { Preferences } from './preferences'

/** The crosshair overlay, centred in its positioned parent. The Run screen and the Options preview draw it the same way. */
export function Crosshair({ crosshair: c }: { crosshair: Preferences['crosshair'] }) {
  const dot = c.style === 'dot'
  const r = dot ? c.size / 2 : c.gap + c.size // outer radius in px
  const t = c.thickness
  return (
    <svg className="crosshair" width={2 * r} height={2 * r} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} fill={c.color} opacity={c.opacity} aria-hidden="true">
      {dot ? (
        <circle r={r} />
      ) : (
        <>
          <rect x={c.gap} y={-t / 2} width={c.size} height={t} />
          <rect x={-r} y={-t / 2} width={c.size} height={t} />
          <rect x={-t / 2} y={c.gap} width={t} height={c.size} />
          <rect x={-t / 2} y={-r} width={t} height={c.size} />
        </>
      )}
    </svg>
  )
}
