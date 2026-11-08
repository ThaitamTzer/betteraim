import { useEffect, useRef, useState } from 'react'
import { exportData, ImportError, importData } from '../../core'
import type { RunSummary } from '../../core'
import { runStore } from '../../storage/runs'
import type { ScreenProps } from '../routes'

type Notice = { kind: 'ok' | 'problem'; text: string }

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Runs({ go }: ScreenProps<'runs'>) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      setRuns((await (await runStore()).list()).reverse()) // newest first
    } catch (error) {
      setNotice({ kind: 'problem', text: `Your Runs could not be read: ${describe(error)}` })
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const exportAll = async () => {
    try {
      const url = URL.createObjectURL(new Blob([await exportData(await runStore())], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `betteraim-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setNotice({ kind: 'problem', text: `Export failed: ${describe(error)}` })
    }
  }

  const importFile = async (file: File) => {
    try {
      const count = await importData(await runStore(), await file.text())
      setNotice({ kind: 'ok', text: `Imported ${count} ${count === 1 ? 'Run' : 'Runs'}.` })
      await load()
    } catch (error) {
      const text = error instanceof ImportError ? error.message : describe(error)
      setNotice({ kind: 'problem', text: `Nothing was imported and your existing Runs are unchanged. ${text}` })
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Past Runs</p>
      <h1>Your Runs</h1>
      <p className="lede">Every finished Run is saved in this browser. Export them to keep a copy or to move to another browser.</p>

      <div className="actions">
        <button type="button" onClick={exportAll} disabled={!runs?.length}>
          Export all
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // so choosing the same file again still fires
            if (file) void importFile(file)
          }}
        />
      </div>

      {notice && (
        <p className={notice.kind === 'problem' ? 'warning' : 'hint'} role={notice.kind === 'problem' ? 'alert' : 'status'}>
          {notice.text}
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
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>{capitalize(r.scenario)}</td>
                  <td>{r.score.toFixed(1)}</td>
                  <td>{r.sensitivity} cm/360</td>
                  <td>
                    {capitalize(r.mode)}
                    {r.warmup && ', warm-up'}
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
