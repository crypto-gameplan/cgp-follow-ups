// The follow-up panel: a head with the counts and the last sync, then one card per issue, open ones first, with
// the actions for it. Desktop draws each card as an SVG; the terminal draws the same in text.

import type { FollowUp, Panel } from '../../types'
import { ago, clip, esc, fit, measure } from '../core/format'
import { countsOf, isDone, linkOf, ordered, shown } from '../core/items'
import { T } from '../core/strings'
import { TERM_COLOR, TERM_GLYPH } from './palette'
import { doc, dot, mark, text } from './svg'

export const PANE = 'cgp-follow-ups'

export type ItemActions = { work: () => unknown; done: () => unknown; reopen: () => unknown; remove: () => unknown }

export type PaneDraw = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Box: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Svg?: any
  isDesktop: boolean
  columns: number
  items: FollowUp[]
  panel: Panel
  isSyncing: boolean
  at: number
  onSync: () => unknown
  onClearDone: () => unknown
  onToggleDone: () => unknown
  actionsFor: (key: string) => ItemActions
}

const HEAD_H = 44
const CARD_H = 50

const trackerWord = (i: FollowUp): string => (i.tracker === 'manual' ? 'added by hand' : i.tracker === 'github' ? 'GitHub' : i.tracker === 'jira' ? 'Jira' : 'Linear')

const syncWord = (d: PaneDraw): string => (d.isSyncing ? T.syncing : d.panel.lastSyncAt ? T.synced(ago(d.at - d.panel.lastSyncAt)) : T.neverSynced)

export function headSvg(w: number, d: PaneDraw): string {
  const c = countsOf(d.items)
  const counts = c.total === 0 ? T.counts(0, 0, 0) : c.open === 0 ? T.allDone(c.done) : T.counts(c.open - c.doing, c.doing, c.done)
  return doc(
    w,
    HEAD_H,
    `${mark(0, 2, 20)}
${text(30, 17, esc(T.name), 15, 'tx', 'font-weight="600"')}
${text(w, 17, esc(syncWord(d)), 11, d.isSyncing ? 'mu pulse' : 'mu', 'text-anchor="end"')}
${text(30, 36, esc(counts), 12, c.total > 0 && c.open === 0 ? 'c-done' : 'mu', 'font-variant-numeric="tabular-nums"')}`,
  )
}

export function cardSvg(w: number, i: FollowUp, isSyncing: boolean): string {
  const s = shown(i)
  const done = s.category === 'done'
  const x = 30
  const word = s.name + (i.mark ? ' ·' : '')
  const wordW = measure(word, 11) + 4
  // Bold runs about a tenth wider than `measure` assumes.
  const keyW = measure(i.key, 13) * 1.12 + 12
  const meta = [trackerWord(i), i.mark ? T.marked : '', i.problem ? clip(i.problem, 60) : ''].filter(Boolean).join(' · ')
  return doc(
    w,
    CARD_H,
    `${dot(11, 17, 7, s.category, isSyncing && !done)}
${text(x, 21, esc(i.key), 13, done ? 'mu' : 'tx', 'font-weight="600" font-variant-numeric="tabular-nums"')}
${text(x + keyW, 21, esc(fit(i.title || '—', 13, w - x - keyW - wordW - 10)), 13, done ? 'mu' : 'tx', done ? 'text-decoration="line-through"' : '')}
${text(w, 21, esc(word), 11, `c-${s.category}`, 'text-anchor="end" font-weight="600"')}
${text(x, 38, esc(fit(meta, 11, w - x)), 11, i.problem ? '' : 'mu', i.problem ? 'fill="#d9534f"' : '')}
<line class="ln" x1="0" y1="${CARD_H - 0.5}" x2="${w}" y2="${CARD_H - 0.5}"/>`,
  )
}

function actions(d: PaneDraw, i: FollowUp) {
  const { Box, Button, Link } = d
  const a = d.actionsFor(i.key)
  const link = linkOf(i, d.panel.sites)
  const done = isDone(i)
  return (
    <Box key={`act-${i.key}`} flexDirection="row" gap={1}>
      {done ? null : <Button key={`work-${i.key}`} label={T.workOn} variant="primary" onPress={a.work} />}
      {done ? (
        <Button key={`reopen-${i.key}`} label={T.reopen} plain onPress={a.reopen} />
      ) : (
        <Button key={`done-${i.key}`} label={T.markDone} plain onPress={a.done} />
      )}
      {link ? <Link key={`link-${i.key}`} href={link} label={T.openLink} /> : null}
      <Button key={`remove-${i.key}`} label={T.remove} plain dimColor onPress={a.remove} />
    </Box>
  )
}

export function paneTree(d: PaneDraw) {
  const { Box, Text, Button } = d
  const list = ordered(d.items)
  const open = list.filter(i => !isDone(i))
  const done = list.filter(isDone)
  const footer = (
    <Box key="foot" flexDirection="row" gap={1}>
      <Button key="sync" label={d.isSyncing ? T.syncing : T.sync} plain onPress={d.onSync} />
      {done.length ? <Button key="clear" label={T.clearDone} plain dimColor onPress={d.onClearDone} /> : null}
    </Box>
  )
  const doneToggle = done.length ? (
    <Button key="toggle-done" plain label={`${d.panel.showDone ? '▾' : '▸'} ${T.showDone(done.length)}`} onPress={d.onToggleDone} />
  ) : null

  if (d.isDesktop && d.Svg) {
    const Svg = d.Svg
    const w = Math.max(240, Math.min(900, d.columns * 8 - 8))
    const card = (i: FollowUp) => (
      <Box key={`card-${i.key}`} flexDirection="column">
        <Svg source={cardSvg(w, i, d.isSyncing)} alt={`${i.key} ${shown(i).name}: ${i.title}`} width={w} height={CARD_H} />
        {actions(d, i)}
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1}>
        <Svg source={headSvg(w, d)} alt={`${T.name}: ${syncWord(d)}`} width={w} height={HEAD_H} />
        {list.length === 0 ? <Text dimColor>{T.empty}</Text> : null}
        {list.length === 0 ? <Text dimColor>{T.addHint}</Text> : null}
        {open.map(card)}
        {doneToggle}
        {d.panel.showDone ? done.map(card) : null}
        {list.length ? footer : null}
      </Box>
    )
  }

  const cols = Math.max(30, d.columns)
  const c = countsOf(d.items)
  const row = (i: FollowUp) => {
    const s = shown(i)
    const isOff = s.category === 'done'
    return (
      <Box key={`row-${i.key}`} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={TERM_COLOR[s.category]}>{TERM_GLYPH[s.category]}</Text>
          <Text bold={!isOff} dimColor={isOff}>
            {i.key}
          </Text>
          <Box flexGrow={1} />
          <Text color={TERM_COLOR[s.category]}>{s.name + (i.mark ? ' ·' : '')}</Text>
        </Box>
        {i.title ? (
          <Text dimColor={isOff} strikethrough={isOff} wrap="truncate-end">
            {`  ${clip(i.title, cols - 2)}`}
          </Text>
        ) : null}
        {i.problem ? <Text color="#d9534f" wrap="truncate-end">{`  ${clip(i.problem, cols - 2)}`}</Text> : null}
        {actions(d, i)}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="#ffab19">▮</Text>
        <Text bold>{T.name}</Text>
        <Box flexGrow={1} />
        <Text dimColor>{syncWord(d)}</Text>
      </Box>
      <Text dimColor>{c.total === 0 ? T.empty : c.open === 0 ? T.allDone(c.done) : T.counts(c.open - c.doing, c.doing, c.done)}</Text>
      {list.length === 0 ? <Text dimColor>{T.addHint}</Text> : null}
      {open.map(row)}
      {doneToggle}
      {d.panel.showDone ? done.map(row) : null}
      {list.length ? footer : null}
    </Box>
  )
}
