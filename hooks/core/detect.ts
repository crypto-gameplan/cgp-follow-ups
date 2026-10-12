// Spotting follow-ups in tool calls: issues Claude creates through an MCP tracker or `gh`, and calls that touch an
// issue already tracked, so its status is read again right after.

import type { FollowUp, Tracker } from '../../types'
import { isIssueKey, JIRA_KEY, jiraStatuses, UNKNOWN } from './status'

type Args = Record<string, unknown>

/** Tools that create issues: Jira, Linear and GitHub MCP servers, and the usual variants of their names. */
const CREATE_TOOL = /^mcp__.+__(create_issue|create_issues|bulk_create_issues|issue_create|create_ticket|issue_write|createJiraIssue|create_work_item)$/i
const BULK_TOOL = /bulk|create_issues/i
const GITHUB_ISSUE_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/g
const HTTPS_URL = /https:\/\/[^\s"'<>)\]\\]+/g

export const serverOf = (tool: string): string => tool.split('__')[1] ?? ''

export function trackerOf(server: string): Tracker | null {
  const s = server.toLowerCase()
  if (s.includes('github')) return 'github'
  if (s.includes('jira') || s.includes('atlassian')) return 'jira'
  if (s.includes('linear')) return 'linear'
  return null
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function titleOf(args: Args | undefined): string {
  if (!args) return ''
  const fields = (args.fields ?? {}) as Args
  return text(args.summary) || text(args.title) || text(fields.summary) || text(fields.title)
}

function titlesOf(args: Args): string[] {
  const list = args.issues ?? args.issueUpdates ?? args.items
  return Array.isArray(list) ? list.map(x => titleOf(x as Args)) : [titleOf(args)]
}

const item = (key: string, title: string, tracker: Tracker, now: number, extra: Partial<FollowUp> = {}): FollowUp => ({
  key,
  title,
  tracker,
  createdAt: now,
  status: UNKNOWN,
  checkedAt: 0,
  ...extra,
})

export function githubIssues(out: string, titles: string[], now: number, server?: string): FollowUp[] {
  const seen = new Set<string>()
  const found: FollowUp[] = []
  for (const m of out.matchAll(GITHUB_ISSUE_URL)) {
    const key = `${m[1]}#${m[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push(item(key, titles[found.length] ?? '', 'github', now, { url: m[0], ...(server ? { server } : {}) }))
  }
  return found
}

/** Keys in a create result, minus the keys the input already named (a parent, an epic, a link). */
function keyedIssues(out: string, args: Args, tracker: Tracker, server: string, titles: string[], now: number): FollowUp[] {
  const named = JSON.stringify(args)
  const quoted = [...out.matchAll(/"(?:key|identifier)"\s*:\s*"([A-Z][A-Z0-9_]+-\d+)"/g)].map(m => m[1] ?? '')
  const loose = out.match(JIRA_KEY) ?? []
  const keys = [...new Set([...quoted, ...loose])].filter(k => isIssueKey(k) && !named.includes(`"${k}"`))
  const urls = out.match(HTTPS_URL) ?? []
  const statuses = jiraStatuses(out)
  return keys.map((key, i) => {
    const url = urls.find(u => (u.endsWith(`/${key}`) || u.includes(`/${key}/`) || u.includes(`/browse/${key}`)) && !u.includes('/rest/'))
    const known = statuses.get(key)
    return item(key, titles[i] || known?.title || '', tracker, now, {
      server,
      ...(url ? { url } : {}),
      ...(known ? { status: known.status } : {}),
    })
  })
}

/** The issues an MCP tool call created, or none when it is not a create call or failed. */
export function createdByMcp(tool: string, args: Args, out: string, now: number): FollowUp[] {
  if (!CREATE_TOOL.test(tool)) return []
  // GitHub's issue_write does everything; only its create method makes a new issue.
  if (/issue_write$/i.test(tool) && args.method !== 'create') return []
  const server = serverOf(tool)
  const tracker = trackerOf(server)
  if (!tracker) return []
  const titles = titlesOf(args)
  const found = tracker === 'github' ? githubIssues(out, titles, now, server) : keyedIssues(out, args, tracker, server, titles, now)
  return BULK_TOOL.test(tool) ? found : found.slice(0, 1)
}

/** `gh issue create` prints the new issue's URL. */
export function createdByBash(command: string, out: string, now: number): FollowUp[] {
  if (!/\bgh\s+issue\s+create\b/.test(command)) return []
  const t = command.match(/(?:--title|-t)\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/)
  return githubIssues(out, [t?.[1] ?? t?.[2] ?? ''], now).slice(0, 1)
}

/**
 * The tracked items a tool call may have moved: a call on the item's tracker server that names its key, or a `gh`
 * or `git` command that can close GitHub issues (close, merge, a push with "Fixes #12").
 */
export function touchedBy(tool: string, args: Args, out: string, items: readonly FollowUp[]): FollowUp[] {
  if (tool === 'Bash') {
    const command = text(args.command)
    const closesGithub = /\bgh\s+(issue\s+(close|reopen|edit|comment)|pr\s+(merge|close))\b|\bgit\s+push\b/.test(command)
    return items.filter(i => {
      if (i.tracker === 'github') return closesGithub
      return command.includes(i.key) && /\b(acli|jira|linear)\b/.test(command)
    })
  }
  if (!tool.startsWith('mcp__')) return []
  const server = serverOf(tool)
  const named = JSON.stringify(args)
  const number = String(args.issue_number ?? args.issueNumber ?? '')
  return items.filter(i => {
    if (i.server && i.server !== server && trackerOf(server) !== i.tracker) return false
    if (i.tracker === 'github') return number !== '' && i.key.endsWith(`#${number}`)
    return named.includes(`"${i.key}"`) || (out.includes(`"${i.key}"`) && /transition|update|close|resolve/i.test(tool))
  })
}

/**
 * A manual entry: a GitHub issue URL, or a Jira-style key. With a Jira server at hand the key is read from there;
 * without one it is the person's to tick off.
 */
export function manualItem(ref: string, title: string, now: number, jiraServer = ''): FollowUp | null {
  const gh = githubIssues(ref, [title], now)[0]
  if (gh) return gh
  const key = ref.toUpperCase()
  if (!isIssueKey(key)) return null
  return jiraServer ? item(key, title, 'jira', now, { server: jiraServer }) : item(key, title, 'manual', now, { status: { name: 'Open', category: 'todo' } })
}
