// The /config options, read once when the mod registers.

export type Settings = {
  /** How often open items are read back from their trackers, in ms; 0 for only on demand and after changes. */
  syncEveryMs: number
  /** The bar above the prompt: shown while something is open, or never. */
  showBar: boolean
}

const MINUTES: Record<string, number> = { '2 min': 2, '5 min': 5, '15 min': 15, off: 0 }

export function readSettings(options: Record<string, unknown> | undefined): Settings {
  const every = typeof options?.syncEvery === 'string' ? options.syncEvery.trim() : '5 min'
  return {
    syncEveryMs: (MINUTES[every] ?? 5) * 60_000,
    showBar: options?.bar !== 'off',
  }
}
