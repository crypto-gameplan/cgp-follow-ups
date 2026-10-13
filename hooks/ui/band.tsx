// The follow-up bar above the prompt, drawn only when cgp-effort does not host it: the CGP mark, one status chip
// per issue and the counts. Desktop draws the row as one SVG; the terminal draws it in text.

import type { FollowFeed } from '../../types'
import { esc, fit, measure } from '../core/format'
import { T } from '../core/strings'
import { TERM_COLOR, TERM_GLYPH } from './palette'
import { doc, dot, mark, text } from './svg'

export type BandDraw = {
  // From $.ui.resolve(e): the surface's own elements.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Box: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Svg?: any
  isDesktop: boolean
  columns: number
  feed: FollowFeed
  onPanel: () => unknown
  onHide: () => unknown
}

const ROW_H = 24
const MARK = 18
const CHIP_GAP = 14

export const countsText = (f: FollowFeed): string => (f.open === 0 ? T.allDone(f.done) : T.counts(f.open - f.doing, f.doing, f.done))

/** Status chips from `x`, as many as fit `room` px; the rest become `+n`. */
function chipsSvg(f: FollowFeed, x: number, room: number): string {
  let at = x
  const out: string[] = []
  for (let i = 0; i < f.chips.length; i++) {
    const c = f.chips[i]
    if (!c) continue
    const w = 14 + measure(c.key, 12)
    const left = f.chips.length - i - 1
    if (at + w > x + room - (left > 0 ? 28 : 0)) {
      out.push(text(at, 16.5, `+${f.chips.length - i}`, 12, 'mu'))
      break
    }
    out.push(dot(at + 5, ROW_H / 2, 5, c.category, f.isSyncing), text(at + 14, 16.5, esc(c.key), 12, c.category === 'done' ? 'mu' : 'tx', 'font-variant-numeric="tabular-nums"'))
    at += w + CHIP_GAP
  }
  return out.join('')
}

export function bandSvg(f: FollowFeed, width: number): string {
  const counts = countsText(f)
  const countsW = Math.ceil(measure(counts, 12)) + 4
  const name = T.paneTitle
  const chipsX = Math.round(MARK + 10 + measure(name, 13) + 16)
  const room = Math.max(40, width - chipsX - countsW - 16)
  return doc(
    width,
    ROW_H,
    `${mark(0, (ROW_H - MARK) / 2, MARK)}
${text(MARK + 10, 16.5, esc(name), 13, 'tx', 'font-weight="600"')}
${chipsSvg(f, chipsX, room)}
${text(width, 16.5, esc(fit(counts, 12, countsW + 8)), 12, f.open === 0 ? 'c-done' : 'mu', `text-anchor="end" font-variant-numeric="tabular-nums"${f.open === 0 ? ' font-weight="600"' : ''}`)}`,
  )
}

export function bandTree(d: BandDraw) {
  const { Box, Text, Button, feed } = d
  const panel = <Button key="fu-panel" plain label={`${T.paneTitle} ${feed.open + feed.done}`} onPress={d.onPanel} />
  const hide = <Button key="fu-hide" plain role="dismiss" label="✕" onPress={d.onHide} />
  if (d.isDesktop && d.Svg) {
    const Svg = d.Svg
    // About 8 CSS px per column, less the two buttons ("Follow-ups n" is the wider one), their gaps and the slot padding.
    const width = Math.max(200, Math.min(1600, (d.columns || 100) * 8 - 210))
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg source={bandSvg(feed, width)} alt={`${T.paneTitle}: ${countsText(feed)}`} width={width} height={ROW_H} />
        {panel}
        {hide}
      </Box>
    )
  }
  const cols = d.columns || 80
  const counts = countsText(feed)
  let room = Math.max(10, cols - counts.length - T.paneTitle.length - 24)
  const chips = []
  for (const c of feed.chips) {
    const w = c.key.length + 3
    if (w > room) break
    room -= w
    chips.push(
      <Text key={`c-${c.key}`} color={TERM_COLOR[c.category]} dimColor={c.category === 'done'}>
        {`${TERM_GLYPH[c.category]} ${c.key} `}
      </Text>,
    )
  }
  return (
    <Box flexDirection="row" gap={1}>
      <Text color="#ffab19">▮</Text>
      <Text bold>{T.paneTitle}</Text>
      <Box flexShrink={1} overflow="hidden">
        <Text>{chips}</Text>
      </Box>
      <Box flexGrow={1} />
      <Text color={feed.open === 0 ? TERM_COLOR.done : undefined} dimColor={feed.open > 0}>
        {counts}
      </Text>
      {panel}
      {hide}
    </Box>
  )
}
