import { useEffect, useState } from 'react'
import type { RunSummary } from '../../core'
import { runStore } from '../../storage/runs'
import { ExportImport } from '../ExportImport'
import { errorMessage } from '../format'
import type { Go, ScreenProps } from '../routes'
import { formatScore } from '../score'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A Run saved before Sessions existed has none to summarise. */
function SessionLink({ sessionId, go }: { sessionId: string | undefined; go: Go }) {
  if (sessionId === undefined) return null
  return (
    <button type="button" className="link" onClick={() => go({ name: 'session', sessionId, back: { name: 'runs' } })}>
      Summary
    </button>
  )
}

export function Runs({ go }: ScreenProps<'runs'>) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    try {
      setRuns((await (await runStore()).list()).reverse()) // newest first
    } catch (error) {
      setNotice(`Your Runs could not be read: ${errorMessage(error)}`)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <main className="page">
      <p className="eyebrow">Past Runs</p>
      <h1>Your Runs</h1>
      <p className="lede">
        Every finished Run is saved in this browser. Export keeps a copy of your Runs, setup and Options (never your AI Coach key), for a backup or another browser. The same
        buttons are in Options.
      </p>

      <ExportImport onImported={load} />

      {notice && (
        <p className="warning" role="alert">
          {notice}
        </p>
      )}

      {runs?.length === 0 && (
        <p className="lede">
          No Runs yet. <button type="button" className="link" onClick={() => go({ name: 'home' })}>Play one</button> and it will show up here.
        </p>
      )}
      {runs && runs.length > 0 && (
        <div className="table-wrap">
          <table className="runs">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Scenario</th>
                <th scope="col">Score</th>
                <th scope="col">Sensitivity</th>
                <th scope="col">Mode</th>
                <th scope="col">Session</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>{capitalize(r.scenario)}</td>
                  <td>{formatScore(r.scenario, r.score)}</td>
                  <td>{r.sensitivity} cm/360</td>
                  <td>
                    {capitalize(r.mode)}
                    {r.warmup && ', warm-up'}
                  </td>
                  <td>
                    <SessionLink sessionId={r.sessionId} go={go} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
