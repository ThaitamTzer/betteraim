import { gameProfiles, isGameProfileId } from '../core'
import type { GameProfileId } from '../core'

export function GameSelect({ label, value, onChange }: { label: string; value: GameProfileId; onChange: (id: GameProfileId) => void }) {
  return (
    <label>
      <span>{label}</span>
      <span className="field">
        <select
          value={value}
          onChange={(e) => {
            if (isGameProfileId(e.target.value)) onChange(e.target.value)
          }}
        >
          {gameProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function NumberField({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <span className="field">
        <input type="number" inputMode="decimal" step="any" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
        {unit && (
          <span className="unit" aria-hidden="true">
            {unit}
          </span>
        )}
      </span>
    </label>
  )
}

export function Select<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: T
  choices: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="field">
        <select
          value={String(value)}
          onChange={(e) => {
            const choice = choices.find(([v]) => String(v) === e.target.value)
            if (choice) onChange(choice[0])
          }}
        >
          {choices.map(([v, name]) => (
            <option key={v} value={v}>
              {name}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function RangeField({
  label,
  unit = '',
  value,
  range: [min, max],
  step = 1,
  disabled,
  onChange,
}: {
  label: string
  unit?: string
  value: number
  range: readonly [number, number]
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>
        {label} <span className="value">{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="inline">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
