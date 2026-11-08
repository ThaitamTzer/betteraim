import { useRef, useState } from 'react'
import { exportData, ImportError, importData } from '../core'
import { errorMessage } from '../error-message'
import { runStore } from '../storage/runs'
import { applyPlayerData, checkPlayerData, readPlayerData } from './player-data'

type Notice = { kind: 'ok' | 'problem'; text: string }

/**
 * Export and import of all the player's data as one file: Runs, Reset Finder markers, setup, Options and Player Context (never the AI Coach's
 * key). Shared by Past Runs and Options; `onImported` lets the screen read what the import changed.
 */
export function ExportImport({ onImported }: { onImported: () => void }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const exportAll = async () => {
    try {
      const url = URL.createObjectURL(new Blob([await exportData(await runStore(), readPlayerData())], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `betteraim-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setNotice({ kind: 'problem', text: `Export failed: ${errorMessage(error)}` })
    }
  }

  const importFile = async (file: File) => {
    try {
      const { runs, player } = await importData(await runStore(), await file.text(), checkPlayerData)
      if (player) applyPlayerData(player) // last: the file was valid and the Runs are stored, so a bad file never changes the setup
      setNotice({ kind: 'ok', text: `Imported ${runs} ${runs === 1 ? 'Run' : 'Runs'}${player ? ', your setup, Options and Player Context' : ''}.` })
      onImported()
    } catch (error) {
      setNotice({ kind: 'problem', text: `Nothing was imported and your existing data is unchanged. ${error instanceof ImportError ? error.message : errorMessage(error)}` })
    }
  }

  return (
    <>
      <div className="actions">
        <button type="button" onClick={exportAll}>
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
    </>
  )
}
