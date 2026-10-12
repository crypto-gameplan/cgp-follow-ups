// Reading an issue's status out of what a tracker answers: Jira's JSON (search_issues, get_issue), `gh issue view
// --json` and Linear's issue JSON. Each lands on the same three categories.

import type { Category, Status } from '../../types'

export const UNKNOWN: Status = { name: 'Checking…', category: 'unknown' }

/** A Jira issue key: `CGP-12`. Common acronyms with a number (UTF-8, SHA-256) are not keys. */
export const JIRA_KEY = /\b[A-Z][A-Z0-9_]+-\d+\b/g
const NOT_A_KEY = /^(UTF|ISO|SHA|RFC|TLS|SSL|HTTP|MD|AES|RSA|ES|CVE|GPT|X|PR|V)-/

export function isIssueKey(key: string): boolean {
  return /^[A-Z][A-Z0-9_]+-\d+$/.test(key) && !NOT_A_KEY.test(key)
}

/** Jira's status categories: `new`, `indeterminate`, `done`. */
export function jiraCategory(key: string | undefined, name = ''): Category {
  if (key === 'done') return 'done'
  if (key === 'indeterminate') return 'doing'
  if (key === 'new') return 'todo'
  return nameCategory(name)
}

/** A status by its name alone, for trackers that send no category. */
export function nameCategory(name: string): Category {
  if (/\b(done|closed|resolved|completed?|merged|released|fixed|cancel+ed|won'?t do|skipped|erledigt|fertig|geschlossen|abgeschlossen)\b/i.test(name)) return 'done'
  if (/\b(progress|review|testing|qa|doing|started|active|blocked|in arbeit)\b/i.test(name)) return 'doing'
  if (/\b(to ?do|open|new|backlog|selected|ready|unstarted|triage|offen)\b/i.test(name)) return 'todo'
  return 'unknown'
}

/** Linear's state types: backlog, unstarted, started, completed, canceled, triage. */
export function linearCategory(type: string | undefined, name = ''): Category {
  if (type === 'completed' || type === 'canceled') return 'done'
  if (type === 'started') return 'doing'
  if (type === 'backlog' || type === 'unstarted' || type === 'triage') return 'todo'
  return nameCategory(name)
}

/** The text of an MCP result's content blocks, joined. */
export function resultText(result: unknown): string {
  if (typeof result === 'string') return result
  const content = (result as { content?: unknown })?.content
  if (!Array.isArray(content)) return result === undefined ? '' : JSON.stringify(result)
  return content.map(b => (typeof (b as { text?: unknown })?.text === 'string' ? (b as { text: string }).text : '')).join('\n')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type Found = { status: Status; title: string }

type Node = Record<string, unknown>
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null

/** Calls `fn` on every object in a JSON value, depth first, at most `limit` of them. */
function eachObject(value: unknown, fn: (o: Node) => void, limit = 5_000): void {
  let seen = 0
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || ++seen > limit) return
    if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else if (isNode(v)) {
      fn(v)
      for (const x of Object.values(v)) walk(x, depth + 1)
    }
  }
  walk(value, 0)
}

/** Every Jira issue in a JSON answer that carries a status: `{ key, fields: { status, summary } }`. */
export function jiraStatuses(text: string): Map<string, Found> {
  const out = new Map<string, Found>()
  eachObject(parseJson(text), o => {
    const key = typeof o.key === 'string' ? o.key : ''
    if (!isIssueKey(key)) return
    const fields = isNode(o.fields) ? o.fields : o
    const status = isNode(fields.status) ? fields.status : null
    if (!status) return
    const name = typeof status.name === 'string' ? status.name : ''
    const cat = isNode(status.statusCategory) && typeof status.statusCategory.key === 'string' ? status.statusCategory.key : undefined
    out.set(key, { status: { name: name || 'Unknown', category: jiraCategory(cat, name) }, title: typeof fields.summary === 'string' ? fields.summary : '' })
  })
  return out
}

/** `gh issue view --json state,stateReason,title`. */
export function githubStatus(text: string): Found | null {
  const o = parseJson(text)
  if (!isNode(o) || typeof o.state !== 'string') return null
  const state = o.state.toUpperCase()
  const reason = typeof o.stateReason === 'string' ? o.stateReason.toUpperCase() : ''
  const title = typeof o.title === 'string' ? o.title : ''
  if (state === 'CLOSED') return { status: { name: reason === 'NOT_PLANNED' ? 'Not planned' : 'Closed', category: 'done' }, title }
  return { status: { name: 'Open', category: 'todo' }, title }
}

/** A Linear issue's `state: { name, type }`, wherever it sits in the answer. */
export function linearStatus(text: string): Found | null {
  let found: Found | null = null
  eachObject(parseJson(text), o => {
    if (found || !isNode(o.state)) return
    const name = typeof o.state.name === 'string' ? o.state.name : ''
    const type = typeof o.state.type === 'string' ? o.state.type : undefined
    if (name || type) found = { status: { name: name || 'Unknown', category: linearCategory(type, name) }, title: typeof o.title === 'string' ? o.title : '' }
  })
  return found
}

/** The JQL that reads every given key in one search. */
export function jqlFor(keys: string[]): string {
  return `key in (${keys.filter(isIssueKey).join(', ')})`
}

/** `https://x.atlassian.net` from `get_server_info`. */
export function siteOf(text: string): string {
  const o = parseJson(text)
  const url = isNode(o) ? (o.baseUrl ?? o.displayUrl) : undefined
  return typeof url === 'string' && /^https:\/\//.test(url) ? url.replace(/\/+$/, '') : ''
}
