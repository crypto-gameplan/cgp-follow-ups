// Shared SVG pieces in the CGP look that cgp-crew and cgp-effort draw with: the CGP mark, theme-aware text, and
// the status dot every row uses.

import type { Category } from '../../types'
import { DONE_DARK, DONE_LIGHT, GOLD, TODO_DARK, TODO_LIGHT } from './palette'

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif"

// `tx` text, `mu` muted, `m` the mark's quiet bars, `ln` a divider; `c-*` the status colours as fill, `r-*` as ring.
const CSS = `<style>
.tx{fill:#1d1f24}.mu{fill:#6e737c}.m{fill:#8d929a}.ln{stroke:#e9eaed}
.c-todo{fill:${TODO_LIGHT}}.c-doing{fill:${GOLD}}.c-done{fill:${DONE_LIGHT}}.c-unknown{fill:#8d929a}
.r-todo{stroke:${TODO_LIGHT}}.r-doing{stroke:${GOLD}}.r-done{stroke:${DONE_LIGHT}}.r-unknown{stroke:#8d929a}
.ck{stroke:#ffffff}
@media (prefers-color-scheme: dark){.tx{fill:#eceef2}.mu{fill:#a0a5ad}.m{fill:#a0a5ad}.ln{stroke:#2b2e34}
.c-todo{fill:${TODO_DARK}}.c-done{fill:${DONE_DARK}}.c-unknown{fill:#6e737c}
.r-todo{stroke:${TODO_DARK}}.r-done{stroke:${DONE_DARK}}.r-unknown{stroke:#6e737c}.ck{stroke:#0f1c15}}
.pulse{animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.pulse{animation:none}}
</style>`

export const doc = (w: number, h: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${CSS}${body}</svg>`

export const text = (x: number, y: number, s: string, size: number, cls: string, extra = ''): string =>
  `<text${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"${extra ? ` ${extra}` : ''}>${s}</text>`

/** The CGP mark: two quiet bars and the gold one, `size` px square. */
export const mark = (x: number, y: number, size = 18): string =>
  `<g transform="translate(${x},${y}) scale(${size / 20})">\
<path class="m" d="M0 20A5.8 5.2 0 0 1 5.8 14.8V20Z"/>\
<path class="m" d="M7.64 20V9.56a2.3 2.3 0 0 1 2.3-2.3h3.04V20Z"/>\
<path fill="${GOLD}" d="M14.66 20V2.3A2.3 2.3 0 0 1 16.96 0H20v19.4a.6.6 0 0 1-.6.6Z"/></g>`

/**
 * A status dot centred on (cx, cy): an empty ring for to do, a half-filled gold ring for in progress, a filled
 * green dot with a tick for done, a dotted ring while unchecked.
 */
export function dot(cx: number, cy: number, r: number, category: Category, isSyncing = false): string {
  const sw = Math.max(1.4, r / 3.2)
  const ring = (cls: string, dash = '') =>
    `<circle class="${cls}${isSyncing ? ' pulse' : ''}" cx="${cx}" cy="${cy}" r="${(r - sw / 2).toFixed(2)}" fill="none" stroke-width="${sw.toFixed(2)}"${dash}/>`
  if (category === 'done') {
    const t = r * 0.5
    return `<circle class="c-done" cx="${cx}" cy="${cy}" r="${r}"/><path class="ck" d="M${(cx - t).toFixed(2)} ${cy.toFixed(2)}l${(t * 0.7).toFixed(2)} ${(t * 0.7).toFixed(2)}l${(t * 1.3).toFixed(2)} ${(-t * 1.4).toFixed(2)}" fill="none" stroke-width="${(sw * 0.9).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  if (category === 'doing') {
    const ir = r - sw * 1.6
    return `${ring('r-doing')}<path class="c-doing" d="M${cx} ${(cy - ir).toFixed(2)}A${ir.toFixed(2)} ${ir.toFixed(2)} 0 0 1 ${cx} ${(cy + ir).toFixed(2)}Z"/>`
  }
  if (category === 'todo') return ring('r-todo')
  return ring('r-unknown', ` stroke-dasharray="${(sw * 1.1).toFixed(2)} ${(sw * 1.1).toFixed(2)}"`)
}
