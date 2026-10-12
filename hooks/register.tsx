// cgp-follow-ups' hooks. This file owns the session state and every `$` call; the logic lives in core/ and the
// drawing in ui/, both pure, so they are tested without an engine.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FollowUp, Panel } from '../types'
import { createdByBash, createdByMcp, manualItem, serverOf, touchedBy, trackerOf } from './core/detect'
import { addNew, feedOf, hostDraws, isDone, linkOf, marked, newRequest, sameFeed, summary, withProblem, withStatus } from './core/items'
import { readSettings, type Settings } from './core/settings'
import { githubStatus, jiraStatuses, jqlFor, linearStatus, resultText, siteOf } from './core/status'
import { T } from './core/strings'
import { bandTree } from './ui/band'
import { PANE, paneTree } from './ui/pane'

const NO_PANEL: Panel = { isBandHidden: false, showDone: false, handledRequest: 0, lastSyncAt: 0, sites: {} }

const items = atom({ plugin: 'cgp-follow-ups', key: 'items' } as const, [])
const panel = atom({ plugin: 'cgp-follow-ups', key: 'panel' } as const, NO_PANEL)
const feed = atom({ plugin: 'cgp-follow-ups', key: 'feed' } as const, null)
const syncing = atom({ plugin: 'cgp-follow-ups', key: 'syncing' } as const, false)
// cgp-effort's own values, read only: set while its bar shows the follow-up row. Absent without cgp-effort.
const followHost = atom({ plugin: 'cgp-effort', key: 'followHost' } as const, null)
const followRequest = atom({ plugin: 'cgp-effort', key: 'followRequest' } as const, null)

/** A prompt reads open items again when the last read is older than this. */
const PROMPT_SYNC_AFTER_MS = 60_000
/** Opening the panel reads them again when the last read is older than this. */
const FOCUS_SYNC_AFTER_MS = 20_000
/** After a create or a call that touched an item, its status is read this much later, once the tracker settled. */
const SOON_MS = 2_500
/** Jira keys read in one search. */
const JQL_BATCH = 50
const MCP_TIMEOUT_MS = 20_000

let settings: Settings = readSettings(undefined)
let ticker: Timer | null = null
let syncRun: Promise<number> | null = null
let syncAgain: string[] | null = null
let soon: Timer | null = null
let soonKeys = new Set<string>()

async function getPanel($: EngineInterface): Promise<Panel> {
  return { ...NO_PANEL, ...(await read($, panel)) }
}

const toast = ($: EngineInterface, text: string) => void Promise.resolve($.ui.toast(text)).catch(() => undefined)

/** Rewrites the feed cgp-effort draws from, only when what it shows changed. */
async function publish($: EngineInterface): Promise<void> {
  const next = feedOf(await read($, items), await read($, syncing), await $.clock.now())
  if (!sameFeed(await read($, feed), next)) await update($, feed, () => next)
}

/** An MCP call with a deadline, so a hanging server never holds a sync. */
async function mcp($: EngineInterface, server: string, tool: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const call = $.mcp.call(server, tool, args).then(r => ({ text: resultText(r), isError: r.isError }))
  let timer: Timer | null = null
  const late = new Promise<{ text: string; isError: boolean }>(resolve => {
    timer = $.clock.after(MCP_TIMEOUT_MS, () => resolve({ text: `${server} did not answer`, isError: true }))
  })
  try {
    return await Promise.race([call, late])
  } finally {
    ;(timer as Timer | null)?.cancel()
  }
}

// --- reading status back

type Answer = { key: string; status?: FollowUp['status']; title?: string; problem?: string }

async function readJira($: EngineInterface, server: string, keys: string[]): Promise<Answer[]> {
  const out: Answer[] = []
  for (let i = 0; i < keys.length; i += JQL_BATCH) {
    const batch = keys.slice(i, i + JQL_BATCH)
    const run = await mcp($, server, 'search_issues', { jql: jqlFor(batch), fields: ['summary', 'status'], maxResults: 100 }).catch((err: unknown) => ({
      text: err instanceof Error ? err.message : String(err),
      isError: true,
    }))
    let found = run.isError ? new Map() : jiraStatuses(run.text)
    // A server without search_issues, or a search Jira refused: one issue at a time.
    if (run.isError) {
      found = new Map()
      for (const key of batch) {
        const one = await mcp($, server, 'get_issue', { issueKey: key, fields: ['summary', 'status'] }).catch(() => ({ text: '', isError: true }))
        const hit = one.isError ? undefined : jiraStatuses(one.text).get(key)
        if (hit) found.set(key, hit)
      }
    }
    for (const key of batch) {
      const hit = found.get(key)
      out.push(hit ? { key, status: hit.status, title: hit.title } : { key, problem: run.isError ? `${server}: ${run.text.split('\n')[0]?.slice(0, 120) ?? 'no answer'}` : `not found in ${server}` })
    }
  }
  return out
}

async function readGithub($: EngineInterface, i: FollowUp): Promise<Answer> {
  try {
    const run = await $.process.run(['gh', 'issue', 'view', i.url ?? i.key, '--json', 'state,stateReason,title'], { timeoutMs: 15_000 })
    const hit = run.exitCode === 0 ? githubStatus(run.stdout) : null
    return hit ? { key: i.key, status: hit.status, title: hit.title } : { key: i.key, problem: `gh: ${run.stderr.trim().split('\n')[0] || `exit ${run.exitCode}`}` }
  } catch {
    return { key: i.key, problem: 'gh is not available' }
  }
}

async function readLinear($: EngineInterface, i: FollowUp): Promise<Answer> {
  if (!i.server) return { key: i.key, problem: 'no Linear server' }
  const run = await mcp($, i.server, 'get_issue', { id: i.key }).catch(() => ({ text: '', isError: true }))
  const hit = run.isError ? null : linearStatus(run.text)
  return hit ? { key: i.key, status: hit.status, title: hit.title } : { key: i.key, problem: `${i.server}: no status` }
}

/** Learns the Jira site of each server once, for links. */
async function learnSites($: EngineInterface, servers: string[]): Promise<void> {
  const known = (await getPanel($)).sites
  for (const server of servers) {
    if (known[server]) continue
    const run = await mcp($, server, 'get_server_info', {}).catch(() => ({ text: '', isError: true }))
    const site = run.isError ? '' : siteOf(run.text)
    if (site) await update($, panel, p => ({ ...NO_PANEL, ...p, sites: { ...p.sites, [server]: site } }))
  }
}

/**
 * Reads every given item (all open ones without keys) back from its tracker and applies the answers. One sync at
 * a time; a request meanwhile runs once more afterwards. Resolves to how many items changed category.
 */
function sync($: EngineInterface, keys?: string[]): Promise<number> {
  if (syncRun) {
    syncAgain = keys && syncAgain !== null ? [...syncAgain, ...keys] : (keys ?? [])
    return syncRun
  }
  syncRun = (async () => {
    let changed = 0
    await update($, syncing, () => true)
    await publish($)
    try {
      const all = await read($, items)
      const wanted = all.filter(i => i.tracker !== 'manual' && (keys ? keys.includes(i.key) : !isDone(i) || i.checkedAt === 0))
      const answers: Answer[] = []
      const jira = new Map<string, string[]>()
      for (const i of wanted) {
        if (i.tracker === 'jira' && i.server) jira.set(i.server, [...(jira.get(i.server) ?? []), i.key])
      }
      await learnSites($, [...jira.keys()]).catch(() => undefined)
      for (const [server, list] of jira) answers.push(...(await readJira($, server, list)))
      for (const i of wanted) {
        if (i.tracker === 'github') answers.push(await readGithub($, i))
        else if (i.tracker === 'linear') answers.push(await readLinear($, i))
      }
      const at = await $.clock.now()
      const finished: string[] = []
      await update($, items, list =>
        list.map(i => {
          const a = answers.find(x => x.key === i.key)
          if (!a) return i
          if (!a.status) return withProblem(i, a.problem ?? '')
          const next = withStatus(i, a.status, a.title ?? '', at)
          if (isDone(next) !== isDone(i) || next.status.category !== i.status.category) changed++
          if (isDone(next) && !isDone(i) && i.checkedAt > 0) finished.push(i.key)
          return next
        }),
      )
      for (const key of finished) toast($, T.nowDone(key))
      await update($, panel, p => ({ ...NO_PANEL, ...p, lastSyncAt: at }))
    } finally {
      await update($, syncing, () => false)
      await publish($)
    }
    return changed
  })().finally(() => {
    syncRun = null
    if (syncAgain !== null) {
      const again = syncAgain
      syncAgain = null
      void sync($, again.length ? again : undefined).catch(() => undefined)
    }
  })
  return syncRun
}

/** Reads these items shortly, once the tracker has settled; requests in the meantime join the same read. */
function syncSoon($: EngineInterface, keys: string[]): void {
  for (const k of keys) soonKeys.add(k)
  if (soon) return
  soon = $.clock.after(SOON_MS, () => {
    soon = null
    const list = [...soonKeys]
    soonKeys = new Set()
    void sync($, list).catch(() => undefined)
  })
}

// --- changing the list

async function addItems($: EngineInterface, found: FollowUp[]): Promise<FollowUp[]> {
  if (found.length === 0) return []
  let added: FollowUp[] = []
  await update($, items, list => {
    const r = addNew(list, found)
    added = r.added
    return r.list
  })
  if (added.length === 0) return []
  await update($, panel, p => ({ ...NO_PANEL, ...p, isBandHidden: false }))
  const [first] = added
  toast($, added.length === 1 && first ? T.tracked(first.key, first.title) : T.trackedMany(added.map(i => i.key)))
  await publish($)
  syncSoon($, added.map(i => i.key))
  return added
}

async function mark($: EngineInterface, key: string, category: 'todo' | 'done'): Promise<boolean> {
  const at = await $.clock.now()
  let hit = false
  await update($, items, list =>
    list.map(i => {
      if (i.key.toLowerCase() !== key.toLowerCase()) return i
      hit = true
      return marked(i, category, at)
    }),
  )
  await publish($)
  return hit
}

async function remove($: EngineInterface, key: string): Promise<boolean> {
  let hit = false
  await update($, items, list =>
    list.filter(i => {
      const same = i.key.toLowerCase() === key.toLowerCase()
      hit ||= same
      return !same
    }),
  )
  await publish($)
  return hit
}

async function clearDone($: EngineInterface): Promise<number> {
  let n = 0
  await update($, items, list => {
    const keep = list.filter(i => !isDone(i))
    n = list.length - keep.length
    return keep
  })
  await publish($)
  return n
}

/** Takes the statuses a tracker call of Claude's already returned, for free. */
async function learnFromResult($: EngineInterface, out: string): Promise<void> {
  const found = jiraStatuses(out)
  if (found.size === 0) return
  const at = await $.clock.now()
  const list = await read($, items)
  if (!list.some(i => i.tracker === 'jira' && found.has(i.key))) return
  await update($, items, all =>
    all.map(i => {
      const hit = i.tracker === 'jira' ? found.get(i.key) : undefined
      return hit ? withStatus(i, hit.status, hit.title, at) : i
    }),
  )
  await publish($)
}

async function afterTool($: EngineInterface, tool: string, args: Record<string, unknown>, out: string): Promise<void> {
  const at = await $.clock.now()
  if (tool === 'Bash') await addItems($, createdByBash(String(args.command ?? ''), out, at))
  else if (tool.startsWith('mcp__')) {
    await addItems($, createdByMcp(tool, args, out, at))
    if (trackerOf(serverOf(tool)) === 'jira') await learnFromResult($, out)
  }
  const touched = touchedBy(tool, args, out, await read($, items))
  if (touched.length) syncSoon($, touched.map(i => i.key))
}

// --- the panel and the shared bar

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

async function openPane($: EngineInterface): Promise<void> {
  try {
    await $.ui.open({ id: PANE, title: T.paneTitle })
  } catch {
    // No surface (`claude -p`, the SDK): nothing to open.
  }
}

async function togglePane($: EngineInterface): Promise<void> {
  if (await isPaneOpen($).catch(() => false)) await $.ui.close({ id: PANE })
  else await openPane($)
}

/** Carries out a press in cgp-effort's follow-up row, once. */
async function answerHost($: EngineInterface): Promise<void> {
  const req = newRequest(await read($, followRequest), (await getPanel($)).handledRequest)
  if (!req) return
  await update($, panel, p => ({ ...NO_PANEL, ...p, handledRequest: req.id, ...(req.action === 'hide' ? { isBandHidden: true } : {}) }))
  if (req.action === 'panel') await togglePane($)
  else if (req.action === 'sync') await sync($)
  await publish($)
}

/** Every second: answers the host, ends the "all done" moment, and reads open items when they are due. */
async function tick($: EngineInterface): Promise<void> {
  await answerHost($)
  await publish($)
  if (!settings.syncEveryMs || syncRun) return
  const list = await read($, items)
  if (!list.some(i => i.tracker !== 'manual' && !isDone(i))) return
  if ((await $.clock.now()) - (await getPanel($)).lastSyncAt >= settings.syncEveryMs) await sync($)
}

async function workOn($: EngineInterface, key: string): Promise<void> {
  const i = (await read($, items)).find(x => x.key === key)
  if (!i) return
  await $.prompt.fill({ text: T.workPrompt(i.key, i.title, linkOf(i, (await getPanel($)).sites)), mode: 'replace' })
}

async function runCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const [verb = '', ref = '', ...rest] = args.trim().split(/\s+/)
  switch (verb.toLowerCase()) {
    case 'add': {
      const list = await read($, items)
      const jiraServer = list.find(i => i.tracker === 'jira')?.server ?? ((await $.tool.list().catch(() => [])).some(t => t.name.startsWith('mcp__jira__')) ? 'jira' : '')
      const one = ref ? manualItem(ref, rest.join(' '), await $.clock.now(), jiraServer) : null
      if (!one) return { text: T.usageAdd }
      await addItems($, [one])
      return { text: T.added(one.key) }
    }
    case 'done':
    case 'reopen':
      return { text: (await mark($, ref, verb.toLowerCase() === 'done' ? 'done' : 'todo')) ? (verb.toLowerCase() === 'done' ? T.setDone(ref) : T.setOpen(ref)) : T.notFound(ref) }
    case 'remove':
      return { text: (await remove($, ref)) ? T.removed(ref) : T.notFound(ref) }
    case 'clear':
      return { text: T.cleared(await clearDone($)) }
    case 'sync': {
      const n = await sync($)
      return { text: `${T.syncResult(n)}\n\n${summary(await read($, items), (await getPanel($)).sites)}` }
    }
    case 'list':
      return { text: summary(await read($, items), (await getPanel($)).sites) }
    default:
      await openPane($)
      return { text: summary(await read($, items), (await getPanel($)).sites) }
  }
}

export const register: Register = (on, options) => {
  settings = readSettings(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: T.command, description: T.commandHelp })
    ticker?.cancel()
    ticker = $.clock.every(1_000, () => void tick($).catch(() => undefined))
    void (async () => {
      await update($, syncing, () => false)
      await publish($)
      if ((await read($, items)).length) await sync($)
    })().catch(() => undefined)
    return next(e)
  })

  // Each gating hook ends in `.catch(... next(e))`: if the list's own work fails, the call goes on as if the plugin
  // were not installed. Follow-ups must never block Claude.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const tool = String(e.tool)
    if (tool === 'Bash' || tool.startsWith('mcp__')) {
      const out = ran.text ?? (typeof ran.result === 'string' ? ran.result : JSON.stringify(ran.result ?? ''))
      void afterTool($, tool, e as unknown as Record<string, unknown>, out).catch(() => undefined)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    void (async () => {
      const list = await read($, items)
      if (!list.some(i => i.tracker !== 'manual' && !isDone(i))) return
      if ((await $.clock.now()) - (await getPanel($)).lastSyncAt > PROMPT_SYNC_AFTER_MS) await sync($)
    })().catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: T.command }, async ($, e) =>
    runCommand($, e.args ?? '').catch((err: unknown) => ({ text: `cgp-follow-ups: ${err instanceof Error ? err.message : String(err)}` })),
  ).catch(($, e, next) => next(e))

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const result = await next(e)
    void (async () => {
      if ((await $.clock.now()) - (await getPanel($)).lastSyncAt > FOCUS_SYNC_AFTER_MS) await sync($)
    })().catch(() => undefined)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!settings.showBar || e.props.hasSurvey) return next(e)
    const f = await read($, feed)
    if (!f || (await getPanel($)).isBandHidden || hostDraws(await read($, followHost))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    return bandTree({
      Box,
      Text,
      Button,
      Svg: 'Svg' in ui ? ui.Svg : undefined,
      isDesktop: e.surface === 'desktop' && 'Svg' in ui,
      columns: typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : 100,
      feed: f,
      onPanel: () => void togglePane($).catch(() => undefined),
      onHide: () => void update($, panel, p => ({ ...NO_PANEL, ...p, isBandHidden: true })).catch(() => undefined),
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Link } = ui
    const p = await getPanel($)
    return paneTree({
      Box,
      Text,
      Button,
      Link,
      Svg: 'Svg' in ui ? ui.Svg : undefined,
      isDesktop: e.surface === 'desktop' && 'Svg' in ui,
      columns: e.props.bodyColumns,
      items: await read($, items),
      panel: p,
      isSyncing: await read($, syncing),
      at: await $.clock.now(),
      onSync: () =>
        void sync($)
          .then(n => toast($, T.syncResult(n)))
          .catch(() => undefined),
      onClearDone: () => void clearDone($).catch(() => undefined),
      onToggleDone: () => void update($, panel, cur => ({ ...NO_PANEL, ...cur, showDone: !cur.showDone })).catch(() => undefined),
      actionsFor: key => ({
        work: () => void workOn($, key).catch(() => undefined),
        done: () => void mark($, key, 'done').catch(() => undefined),
        reopen: () => void mark($, key, 'todo').catch(() => undefined),
        remove: () => void remove($, key).catch(() => undefined),
      }),
    })
  })
}
