import type { SettingsRecord } from '../../types'
import { db } from './db'

const DEFAULTS: SettingsRecord = { id: 'app', theme: 'light', language: 'en', defaultZoom: 'fit-width', preferences: {} }

export async function getSettings(): Promise<SettingsRecord> {
  try {
    return (await db.settings.get('app')) ?? DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export async function updatePreferences(patch: Record<string, string | number | boolean | null>): Promise<void> {
  try {
    const cur = await getSettings()
    const preferences = { ...cur.preferences } as Record<string, string | number | boolean>
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete preferences[k]
      else preferences[k] = v
    }
    await db.settings.put({ ...cur, preferences })
  } catch {
    /* preferences are best-effort */
  }
}
