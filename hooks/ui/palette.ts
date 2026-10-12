// Crypto Gameplan colours, as cgp-effort and cgp-crew use them: gold for what is in progress, green for done.

import type { Category } from '../../types'

export const GOLD = '#ffab19'
export const DONE_LIGHT = '#3b9c5f'
export const DONE_DARK = '#7fe0a4'
export const TODO_LIGHT = '#5b8fc7'
export const TODO_DARK = '#7cc4ff'
export const MUTED = '#8d929a'
export const TROUBLE = '#d9534f'

/** Terminal colours per status; the terminal has no light or dark switch, so the dark-theme ones. */
export const TERM_COLOR: Record<Category, string> = { todo: TODO_DARK, doing: GOLD, done: DONE_DARK, unknown: MUTED }

/** Terminal glyphs per status: ring, half, filled, dotted. */
export const TERM_GLYPH: Record<Category, string> = { todo: '○', doing: '◐', done: '●', unknown: '◌' }
