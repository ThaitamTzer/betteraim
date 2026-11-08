import { useEffect, useState } from 'react'
import { QUOTA_WARN_AT, storageUsed } from '../storage/quota'

/** Shown on every screen but the Run while the browser's storage for BetterAim is nearly full. */
export function StorageWarning() {
  const [share, setShare] = useState<number | null>(null)
  useEffect(() => {
    storageUsed().then(
      (used) => setShare(used && used.share >= QUOTA_WARN_AT ? used.share : null),
      () => setShare(null), // no estimate available: nothing to warn about
    )
  }, [])
  if (share === null) return null
  return (
    <div className="storage-warning">
      <p className="warning" role="status">
        Browser storage is {Math.round(share * 100)}% full. Export your data from Past Runs now; when it is full, new Runs
        cannot be saved.
      </p>
    </div>
  )
}
