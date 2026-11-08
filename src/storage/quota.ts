/** Warn when this share of the browser's storage allowance for the site is used. */
export const QUOTA_WARN_AT = 0.8

/** The share of storage in use, or null when the browser cannot tell (no `navigator.storage.estimate`). */
export async function storageUsed(): Promise<{ usage: number; quota: number; share: number } | null> {
  const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {}
  return usage !== undefined && quota ? { usage, quota, share: usage / quota } : null
}
