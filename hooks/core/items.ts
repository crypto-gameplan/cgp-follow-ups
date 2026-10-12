// The follow-up list: what each item shows, how the tracker's answers and the person's marks combine, and the
// order the bar and the panel list them in.

import type { Category, FollowFeed, FollowHost, FollowRequest, FollowUp, Status } from '../../types'

/** The feed format this build writes. A host that knows another leaves cgp-follow-ups to draw its own bar. */
export const FEED_VERSION = 1

/** The status an item shows: the person's mark while it stands, else the tracker's. */
export function shown(i: FollowUp): Status {
  if (!i.mark) return i.status
  return i.mark.category === 'done' ? { name: 'Done', category: 'done' } : { name: i.status.category === 'done' ? 'Reopened' : i.status.name, category: 'todo' }
}

export const isDone = (i: FollowUp): boolean => shown(i).category === 'done'

const RANK: Record<Category, number> = { doing: 0, todo: 1, unknown: 2, done: 3 }

/** In progress first, then to do, then unchecked, then done; newest first within each. */
export function ordered(list: readonly FollowUp[]): FollowUp[] {
  return [...list].sort((a, b) => RANK[shown(a).category] - RANK[shown(b).category] || b.createdAt - a.createdAt)
}

export type Counts = { open: number; doing: number; done: number; total: number }

export function countsOf(list: readonly FollowUp[]): Counts {
  let doing = 0
  let done = 0
  for (const i of list) {
    const c = shown(i).category
    if (c === 'done') done++
    else if (c === 'doing') doing++
  }
  return { open: list.length - done, doing, done, total: list.length }
}

/** Adds what is new; an item already tracked keeps its state but takes a title or URL it lacked. */
export function addNew(list: readonly FollowUp[], found: readonly FollowUp[]): { list: FollowUp[]; added: FollowUp[] } {
  const byKey = new Map(list.map(i => [i.key, i]))
  const added: FollowUp[] = []
  for (const f of found) {
    const was = byKey.get(f.key)
    if (was) byKey.set(f.key, { ...was, title: was.title || f.title, ...(was.url || !f.url ? {} : { url: f.url }) })
    else {
      byKey.set(f.key, f)
      added.push(f)
    }
  }
  return { list: [...byKey.values()], added }
}

/**
 * Takes the tracker's answer. A mark stays while the tracker still says what it said when the person marked the
 * item; once the tracker moves, the tracker wins.
 */
export function withStatus(i: FollowUp, status: Status, title: string, at: number): FollowUp {
  const mark = i.mark && i.mark.trackerName === status.name ? i.mark : undefined
  const wasDone = isDone(i)
  const next: FollowUp = { ...i, status, checkedAt: at, problem: '', title: i.title || title }
  if (mark) next.mark = mark
  else delete next.mark
  if (!wasDone && isDone(next)) next.doneAt = at
  return next
}

/** A failed read keeps the last known status; an item never read says so instead of "Checking…". */
export function withProblem(i: FollowUp, problem: string): FollowUp {
  return { ...i, problem, ...(i.checkedAt === 0 ? { status: { name: 'Not checked', category: 'unknown' as const } } : {}) }
}

/** The person's own Done or Reopen. Items without a tracker simply take it as their status. */
export function marked(i: FollowUp, category: 'todo' | 'done', at: number): FollowUp {
  if (i.tracker === 'manual') {
    const next: FollowUp = { ...i, status: category === 'done' ? { name: 'Done', category: 'done' } : { name: 'Open', category: 'todo' } }
    if (category === 'done') next.doneAt = at
    return next
  }
  const next: FollowUp = { ...i, mark: { category, trackerName: i.status.name } }
  // Marking it the way the tracker already has it is no mark at all.
  if ((category === 'done') === (i.status.category === 'done')) delete next.mark
  if (category === 'done' && !isDone(i)) next.doneAt = at
  return next
}

/** The link to an issue: the one it was created with, or the Jira site's browse URL. */
export function linkOf(i: FollowUp, sites: Record<string, string>): string {
  if (i.url) return i.url
  const site = i.server ? sites[i.server] : ''
  return i.tracker === 'jira' && site ? `${site}/browse/${i.key}` : ''
}

/** How long the bar keeps showing after the last item became done. */
export const DONE_LINGER_MS = 5 * 60_000

/** The bar shows while something is open, and a few minutes after the last item became done. */
export function bandShows(list: readonly FollowUp[], at: number): boolean {
  if (list.length === 0) return false
  if (list.some(i => !isDone(i))) return true
  const last = Math.max(0, ...list.map(i => i.doneAt ?? 0))
  return at - last < DONE_LINGER_MS
}

export function feedOf(list: readonly FollowUp[], isSyncing: boolean, at: number): FollowFeed | null {
  if (!bandShows(list, at)) return null
  const c = countsOf(list)
  const first = ordered(list).find(i => !isDone(i))
  return {
    v: FEED_VERSION,
    open: c.open,
    doing: c.doing,
    done: c.done,
    next: first ? { key: first.key, title: first.title, status: shown(first).name, category: shown(first).category } : null,
    chips: ordered(list)
      .slice(0, 12)
      .map(i => ({ key: i.key, category: shown(i).category })),
    isSyncing,
  }
}

export const sameFeed = (a: FollowFeed | null, b: FollowFeed | null): boolean => JSON.stringify(a) === JSON.stringify(b)

/** True when cgp-effort says it draws this feed version, so cgp-follow-ups draws no bar of its own. */
export const hostDraws = (host: FollowHost | null | undefined): boolean => !!host && host.v === FEED_VERSION && host.draws === true

/** The host request to act on now: a well-formed one newer than the last handled, else null. */
export const newRequest = (req: FollowRequest | null | undefined, handled: number): FollowRequest | null =>
  req && Number.isInteger(req.id) && req.id > handled && ['panel', 'hide', 'sync'].includes(req.action) ? req : null

/** The list as plain text, for `/cgp-follow-ups list` and for Claude. */
export function summary(list: readonly FollowUp[], sites: Record<string, string>): string {
  if (list.length === 0) return 'No follow-up issues in this session yet.'
  const line = (i: FollowUp) => {
    const link = linkOf(i, sites)
    return `- ${i.key} [${shown(i).name}]${i.title ? ` ${i.title}` : ''}${link ? ` (${link})` : ''}`
  }
  const open = ordered(list).filter(i => !isDone(i))
  const done = ordered(list).filter(isDone)
  return [`Open follow-ups (${open.length}):`, ...(open.length ? open.map(line) : ['- none']), ...(done.length ? ['', `Done (${done.length}):`, ...done.map(line)] : [])].join('\n')
}
