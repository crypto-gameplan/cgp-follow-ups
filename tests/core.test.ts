import { expect, test } from 'claude-code/testing'

import type { FollowUp } from '../types'
import { createdByBash, createdByMcp, manualItem, touchedBy } from '../hooks/core/detect'
import { addNew, bandShows, countsOf, DONE_LINGER_MS, feedOf, hostDraws, linkOf, marked, newRequest, ordered, shown, withStatus } from '../hooks/core/items'
import { readSettings } from '../hooks/core/settings'
import { githubStatus, jiraCategory, jiraStatuses, jqlFor, linearStatus, nameCategory, resultText, siteOf } from '../hooks/core/status'
import { bandSvg } from '../hooks/ui/band'
import { cardSvg } from '../hooks/ui/pane'

const jira = (key: string, name: string, cat: string, summary = '') => ({ key, fields: { summary, status: { name, statusCategory: { key: cat } } } })
const base = (key: string, extra: Partial<FollowUp> = {}): FollowUp => ({
  key,
  title: '',
  tracker: 'jira',
  server: 'jira',
  createdAt: 1,
  status: { name: 'To Do', category: 'todo' },
  checkedAt: 1,
  ...extra,
})

test('status: Jira categories, plain names and the JSON of every tracker', () => {
  expect(jiraCategory('done', 'Skipped')).toBe('done')
  expect(jiraCategory('indeterminate')).toBe('doing')
  expect(jiraCategory('new')).toBe('todo')
  expect(jiraCategory(undefined, 'Code Review')).toBe('doing')
  expect(nameCategory('Won’t do')).toBe('unknown')
  expect(nameCategory("Won't do")).toBe('done')
  expect(nameCategory('Erledigt')).toBe('done')
  const found = jiraStatuses(JSON.stringify({ issues: [jira('CGP-1', 'In Progress', 'indeterminate', 'Fix'), jira('CGP-2', 'Skipped', 'done')] }))
  expect(found.get('CGP-1')).toEqual({ status: { name: 'In Progress', category: 'doing' }, title: 'Fix' })
  expect(found.get('CGP-2')?.status.category).toBe('done')
  expect(jiraStatuses('not json').size).toBe(0)
  expect(githubStatus('{"state":"CLOSED","stateReason":"NOT_PLANNED","title":"x"}')?.status).toEqual({ name: 'Not planned', category: 'done' })
  expect(githubStatus('{"state":"OPEN","title":"x"}')?.status.category).toBe('todo')
  expect(linearStatus('{"issue":{"title":"t","state":{"name":"In Review","type":"started"}}}')?.status).toEqual({ name: 'In Review', category: 'doing' })
  expect(jqlFor(['CGP-1', 'nope', 'OPS-22'])).toBe('key in (CGP-1, OPS-22)')
  expect(siteOf('{"baseUrl":"https://crypto-gameplan.atlassian.net/"}')).toBe('https://crypto-gameplan.atlassian.net')
  expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
})

test('detect: a Jira create keeps the new key, not the parent it named', () => {
  const out = JSON.stringify({ key: 'CGP-812', self: 'https://x.atlassian.net/rest/api/3/issue/1' })
  const [one, ...rest] = createdByMcp('mcp__jira__create_issue', { projectKey: 'CGP', summary: 'Fix lock retry', parentKey: 'CGP-800' }, `${out} parent CGP-800`, 5)
  expect(rest).toEqual([])
  expect(one).toMatchObject({ key: 'CGP-812', title: 'Fix lock retry', tracker: 'jira', server: 'jira', checkedAt: 0 })
  expect(one?.url).toBeUndefined()
  const bulk = createdByMcp('mcp__jira__bulk_create_issues', { issues: [{ summary: 'A' }, { summary: 'B' }] }, '{"issues":[{"key":"CGP-1"},{"key":"CGP-2"}]}', 5)
  expect(bulk.map(i => `${i.key}:${i.title}`)).toEqual(['CGP-1:A', 'CGP-2:B'])
  expect(createdByMcp('mcp__jira__get_issue', {}, '{"key":"CGP-1"}', 5)).toEqual([])
  expect(createdByMcp('mcp__github__issue_write', { method: 'update' }, 'https://github.com/o/r/issues/3', 5)).toEqual([])
  expect(createdByMcp('mcp__github__issue_write', { method: 'create', title: 'T' }, 'https://github.com/o/r/issues/3', 5)[0]).toMatchObject({ key: 'o/r#3', tracker: 'github', title: 'T' })
})

test('detect: gh issue create, and the calls that may have moved a tracked item', () => {
  const [gh] = createdByBash('gh issue create --title "Retry \\"lock\\"" --body x', 'https://github.com/crypto-gameplan/cgp-files/issues/7\n', 1)
  expect(gh).toMatchObject({ key: 'crypto-gameplan/cgp-files#7', title: 'Retry \\"lock\\"', url: 'https://github.com/crypto-gameplan/cgp-files/issues/7' })
  const list = [base('CGP-1'), base('CGP-2'), base('o/r#3', { tracker: 'github', server: undefined })]
  expect(touchedBy('mcp__jira__transition_issue', { issueKey: 'CGP-2', transitionId: '31' }, '', list).map(i => i.key)).toEqual(['CGP-2'])
  expect(touchedBy('mcp__jira__search_issues', { jql: 'project = CGP' }, '', list)).toEqual([])
  expect(touchedBy('Bash', { command: 'gh pr merge 12 --squash' }, '', list).map(i => i.key)).toEqual(['o/r#3'])
  expect(touchedBy('Bash', { command: 'npm test' }, '', list)).toEqual([])
  expect(manualItem('cgp-9', 'x', 1, 'jira')).toMatchObject({ key: 'CGP-9', tracker: 'jira', server: 'jira' })
  expect(manualItem('CGP-9', '', 1)?.tracker).toBe('manual')
  expect(manualItem('hello', '', 1)).toBe(null)
})

test('items: a mark holds until the tracker moves, and the tracker then wins', () => {
  const open = base('CGP-1', { status: { name: 'In Progress', category: 'doing' } })
  const m = marked(open, 'done', 10)
  expect(shown(m)).toEqual({ name: 'Done', category: 'done' })
  expect(m.doneAt).toBe(10)
  const same = withStatus(m, { name: 'In Progress', category: 'doing' }, '', 20)
  expect(shown(same).category).toBe('done')
  const moved = withStatus(m, { name: 'In Review', category: 'doing' }, '', 30)
  expect(moved.mark).toBeUndefined()
  expect(shown(moved).name).toBe('In Review')
  const closed = withStatus(open, { name: 'Done', category: 'done' }, 'Fix', 40)
  expect(closed.doneAt).toBe(40)
  expect(closed.title).toBe('Fix')
  // Marking it the way the tracker already has it leaves no mark.
  expect(marked(closed, 'done', 50).mark).toBeUndefined()
  const manual = marked(base('X-1', { tracker: 'manual' }), 'done', 5)
  expect(manual.status.category).toBe('done')
  expect(manual.mark).toBeUndefined()
})

test('items: order, counts, adding, links, and when the bar shows', () => {
  const list = [base('A-1', { createdAt: 1 }), base('A-2', { createdAt: 2, status: { name: 'Done', category: 'done' }, doneAt: 100 }), base('A-3', { createdAt: 3, status: { name: 'In Progress', category: 'doing' } })]
  expect(ordered(list).map(i => i.key)).toEqual(['A-3', 'A-1', 'A-2'])
  expect(countsOf(list)).toEqual({ open: 2, doing: 1, done: 1, total: 3 })
  const r = addNew(list, [base('A-1', { title: 'late title' }), base('A-4')])
  expect(r.added.map(i => i.key)).toEqual(['A-4'])
  expect(r.list.find(i => i.key === 'A-1')?.title).toBe('late title')
  expect(linkOf(base('A-1'), { jira: 'https://x.atlassian.net' })).toBe('https://x.atlassian.net/browse/A-1')
  const allDone = [base('A-2', { status: { name: 'Done', category: 'done' }, doneAt: 100 })]
  expect(bandShows(allDone, 100 + DONE_LINGER_MS - 1)).toBe(true)
  expect(bandShows(allDone, 100 + DONE_LINGER_MS + 1)).toBe(false)
  const f = feedOf(list, false, 200)
  expect(f?.next).toEqual({ key: 'A-3', title: '', status: 'In Progress', category: 'doing' })
  expect(f?.chips.map(c => c.category)).toEqual(['doing', 'todo', 'done'])
  expect(feedOf([], false, 1)).toBe(null)
})

test('items: the host protocol', () => {
  expect(hostDraws({ v: 1, draws: true })).toBe(true)
  expect(hostDraws({ v: 2, draws: true })).toBe(false)
  expect(hostDraws(null)).toBe(false)
  expect(newRequest({ id: 3, action: 'panel' }, 2)?.action).toBe('panel')
  expect(newRequest({ id: 3, action: 'panel' }, 3)).toBe(null)
  expect(newRequest({ id: 4, action: 'nuke' as 'panel' }, 0)).toBe(null)
})

test('drawing: the bar and a card are valid SVG with every key and status escaped', () => {
  const list = [base('CGP-1', { title: 'A <b> & "c"', status: { name: 'In Progress', category: 'doing' } }), base('CGP-2', { status: { name: 'Done', category: 'done' } })]
  const f = feedOf(list, true, 0)
  const bar = f ? bandSvg(f, 600) : ''
  expect(bar).toContain('CGP-1')
  expect(bar).toContain('1 in progress · 1 done')
  expect(bar).toContain('class="r-doing pulse"')
  const card = cardSvg(500, list[0] as FollowUp, false)
  expect(card).toContain('A &lt;b&gt; &amp; &quot;c&quot;')
  expect(card).not.toContain('<b>')
  expect(readSettings({ syncEvery: '2 min', bar: 'off' })).toEqual({ syncEveryMs: 120_000, showBar: false })
  expect(readSettings(undefined).syncEveryMs).toBe(300_000)
})
