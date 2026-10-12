// Text fitting for SVG and short times, as cgp-crew draws them.

/** Escapes text for SVG. */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

// System UI fonts average about 0.55em per character; narrow and wide glyphs are corrected for.
const NARROW = /[ .,:;'!|il1()[\]{}ftj]/
const WIDE = /[A-Z@%MWmw]/
const glyphEm = (ch: string): number => (NARROW.test(ch) ? 0.3 : WIDE.test(ch) ? 0.74 : 0.56)

/** Rough rendered width of `s` at `size` px. */
export const measure = (s: string, size: number): number => [...s].reduce((w, ch) => w + glyphEm(ch) * size, 0)

/** `s` shortened with an ellipsis until it fits `maxWidth` px at `size`. */
export const fit = (s: string, size: number, maxWidth: number): string => {
  if (measure(s, size) <= maxWidth) return s
  const chars = [...s]
  while (chars.length > 1 && measure(`${chars.join('')}…`, size) > maxWidth) chars.pop()
  return `${chars.join('').trimEnd()}…`
}

/** `s` cut to `n` characters with an ellipsis, for the terminal. */
export const clip = (s: string, n: number): string => {
  const chars = [...s]
  return chars.length > n ? `${chars.slice(0, Math.max(1, n - 1)).join('')}…` : s
}

/** `just now`, `4m ago`, `2h ago`. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}
