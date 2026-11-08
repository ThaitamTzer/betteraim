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
