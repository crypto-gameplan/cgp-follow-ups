// Every piece of UI text, in English.

import type { Category } from '../../types'

export const T = {
  command: 'cgp-follow-ups',
  commandHelp: 'Follow-up issues of this session: show | list | sync | add KEY|URL [title] | done KEY | reopen KEY | remove KEY | clear',
  name: 'CGP Follow-ups',
  paneTitle: 'Follow-ups',
  empty: 'No follow-ups yet. Issues Claude creates in Jira, GitHub or Linear show up here, and their status follows the tracker.',
  addHint: 'Add one by hand: /cgp-follow-ups add CGP-123',
  open: 'Open',
  done: 'Done',
  showDone: (n: number) => `Done · ${n}`,
  workOn: 'Work on it',
  markDone: 'Done',
  reopen: 'Reopen',
  remove: 'Remove',
  openLink: 'Open ↗',
  sync: 'Sync',
  syncing: 'Syncing…',
  clearDone: 'Clear done',
  synced: (when: string) => `synced ${when}`,
  neverSynced: 'not synced yet',
  marked: 'marked by you',
  tracked: (key: string, title: string) => `Follow-up tracked: ${key}${title ? ` – ${title}` : ''}`,
  trackedMany: (keys: string[]) => `${keys.length} follow-ups tracked: ${keys.join(', ')}`,
  nowDone: (key: string) => `${key} is done`,
  counts: (todo: number, doing: number, done: number) =>
    [doing ? `${doing} in progress` : '', todo ? `${todo} to do` : '', done ? `${done} done` : ''].filter(Boolean).join(' · ') || 'none',
  allDone: (n: number) => `all ${n} done`,
  workPrompt: (key: string, title: string, link: string) => `Let's work on follow-up ${key}${title ? `: ${title}` : ''}${link ? ` (${link})` : ''}`,
  usageAdd: 'Usage: /cgp-follow-ups add CGP-123 [title], or a GitHub issue URL',
  notFound: (key: string) => `${key} is not in the list.`,
  added: (key: string) => `${key} added.`,
  addedWith: (key: string, status: string, title: string) => `${key} added: ${status}${title ? ` – ${title}` : ''}.`,
  removed: (key: string) => `${key} removed.`,
  setDone: (key: string) => `${key} marked done.`,
  setOpen: (key: string) => `${key} is open again.`,
  cleared: (n: number) => `Removed ${n} done follow-up${n === 1 ? '' : 's'}.`,
  syncResult: (n: number) => (n === 0 ? 'Follow-ups are up to date.' : `${n} follow-up${n === 1 ? '' : 's'} changed.`),
}

export const CATEGORY_WORD: Record<Category, string> = { todo: 'to do', doing: 'in progress', done: 'done', unknown: 'unchecked' }
