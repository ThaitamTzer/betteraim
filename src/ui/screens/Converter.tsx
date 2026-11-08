import { useState } from 'react'
import { convertSensitivity, getGameProfile, readSensitivity } from '../../core'
import type { GameProfileId } from '../../core'
import { GameSelect, NumberField } from '../fields'
import { fmt } from '../format'
import type { ScreenProps } from '../routes'
import { loadSettings, validSetup } from '../settings'

/** Converts a Game Sensitivity between two games at one DPI, keeping cm/360 (360 degree distance matching). */
export function Converter({ go }: ScreenProps<'converter'>) {
  const [saved] = useState(loadSettings)
  const [from, setFrom] = useState<GameProfileId>(saved?.gameProfileId ?? 'valorant')
  const [to, setTo] = useState<GameProfileId>(from === 'cs2' ? 'valorant' : 'cs2')
  const [sens, setSens] = useState(String(saved?.gameSensitivity ?? getGameProfile(from).defaultSensitivity))
  const [dpi, setDpi] = useState(String(saved?.dpi ?? 800))
  const gameSensitivity = Number(sens)
  const mouseDpi = Number(dpi)
  const valid = validSetup(from, gameSensitivity, mouseDpi)
  const rows = valid ? [readSensitivity(from, gameSensitivity, mouseDpi), convertSensitivity(from, to, gameSensitivity, mouseDpi)] : []

  return (
    <main className="page">
      <p className="eyebrow">Converter</p>
      <h1>Move your sensitivity to another game.</h1>
      <p className="lede">The distance your mouse travels for a full turn (cm/360) stays the same. Only the number you type in changes.</p>

      <div className="setup">
        <GameSelect
          label="From"
          value={from}
          onChange={(id) => {
            setFrom(id)
            setSens(String(getGameProfile(id).defaultSensitivity))
          }}
        />
        <NumberField label="Game Sensitivity" value={sens} onChange={setSens} />
        <NumberField label="Mouse DPI" unit="DPI" value={dpi} onChange={setDpi} />
        <GameSelect label="To" value={to} onChange={setTo} />
      </div>

      {valid ? (
        <>
          <div className="table-wrap">
            <table className="results">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Game Sensitivity</th>
                  <th>eDPI</th>
                  <th>cm/360</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{getGameProfile(r.game).name}</td>
                    <td className={i === 1 ? 'answer' : undefined}>{fmt(r.gameSensitivity)}</td>
                    <td>{fmt(r.eDpi)}</td>
                    <td>{fmt(r.cm360)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.map((r, i) => {
            const { name, note } = getGameProfile(r.game)
            const lines = [
              r.vertical && `Set ${r.vertical.label} to ${fmt(r.vertical.value)} to keep vertical the same as horizontal.`,
              note,
            ].filter(Boolean)
            return lines.length > 0 && <p key={i} className="hint">{`${name}: ${lines.join(' ')}`}</p>
          })}
        </>
      ) : (
        <p className="hint">Enter a DPI from 100 to 32000 and a Game Sensitivity that works out to between 0.1 and 1000 cm/360.</p>
      )}

      <div className="actions">
        <button type="button" onClick={() => go({ name: 'home' })}>
          Back
        </button>
      </div>
    </main>
  )
}
