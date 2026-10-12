import { expect, mock, test } from 'claude-code/testing'

// A fake Jira behind the MCP server "jira", a fake `gh`, and a record of what the plugin asked them.
type Issue = { name: string; cat: 'new' | 'indeterminate' | 'done'; summary: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function world(on: any, jira: Record<string, Issue>, gh: Record<string, string> = {}, isBroken = false) {
  const calls: { server: string; tool: string; args: Record<string, unknown> }[] = []
  const toasts: string[] = []
  const opened: unknown[] = []
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', (_$: unknown, e: { text?: string }) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.open', (_$: unknown, e: unknown) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  // Nothing sits beneath the plugin in a test: an empty row stands for the engine's own drawing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('ui.render', ($: any, e: unknown) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('tool.list', () => ({ value: [{ name: 'mcp__jira__get_issue' }] }))
  // cgp-effort's side of the shared bar, and the feed this plugin writes for it.
  const effort: Record<string, unknown> = {}
  const feeds: unknown[] = []
  on('state.get', async (_$: unknown, e: { plugin: string; key: string }, next: (e: unknown) => unknown) =>
    e.plugin === 'cgp-effort' && e.key in effort ? { value: { value: effort[e.key] } } : next(e),
  )
  on('state.set', async (_$: unknown, e: { plugin: string; key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.plugin === 'cgp-follow-ups' && e.key === 'feed') feeds.push(e.value)
    return next(e)
  })
  on('mcp.call', (_$: unknown, e: { server: string; tool: string; args: Record<string, unknown> }) => {
    calls.push(e)
    if (isBroken) throw new Error('server gone')
    const text = (t: string) => ({ value: { content: [{ type: 'text', text: t }], isError: false } })
    if (e.tool === 'get_server_info') return text('{"baseUrl":"https://crypto-gameplan.atlassian.net"}')
    if (e.tool === 'search_issues') {
      const keys = String(e.args.jql).match(/[A-Z]+-\d+/g) ?? []
      return text(JSON.stringify({ issues: keys.filter(k => jira[k]).map(k => ({ key: k, fields: { summary: jira[k]?.summary, status: { name: jira[k]?.name, statusCategory: { key: jira[k]?.cat } } } })) }))
    }
    return { value: { content: [{ type: 'text', text: 'unknown tool' }], isError: true } }
  })
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    const url = e.argv[3] ?? ''
    return { value: { exitCode: gh[url] ? 0 : 1, stdout: gh[url] ?? '', stderr: gh[url] ? '' : 'not found', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The tracker tools Claude calls: create answers with the new key, transitions move the fake issue.
  on('tool.call', (_$: unknown, e: Record<string, unknown>) => {
    if (e.tool === 'mcp__jira__create_issue') {
      const key = `CGP-${800 + Object.keys(jira).length}`
      jira[key] = { name: 'To Do', cat: 'new', summary: String(e.summary) }
      return { result: { key }, text: JSON.stringify({ key }) }
    }
    if (e.tool === 'mcp__jira__transition_issue') {
      const issue = jira[String(e.issueKey)]
      if (issue) Object.assign(issue, { name: 'Done', cat: 'done' })
      return { result: {}, text: '{}' }
    }
    if (e.tool === 'Bash') return { result: { stdout: 'https://github.com/o/r/issues/5\n' }, text: 'https://github.com/o/r/issues/5\n' }
    return { result: {}, text: '' }
  })
  return { clock, calls, toasts, opened, effort, feeds }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drawn(ui: any): Promise<string> {
  return JSON.stringify(await ui.drawn())
}

const pane = (surface: 'desktop' | 'terminal') => ({
  plugin: 'cgp-follow-ups',
  surface,
  component: 'Pane',
  requestId: 'cgp-follow-ups',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: { title: 'Follow-ups', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as any,
})

test('a Jira issue Claude creates is tracked, read back without a permission prompt, and turns done by itself', { timeoutMs: 20_000 }, async ($, on) => {
  const jira: Record<string, Issue> = {}
  const w = world(on, jira)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  await $.tool.call({ tool: 'mcp__jira__create_issue', projectKey: 'CGP', issueType: 'Task', summary: 'Fix lock retry' } as never)
  await w.clock.settle()
  expect(w.toasts).toContain('Follow-up tracked: CGP-800 – Fix lock retry')
  await w.clock.advance(3_000)
  await w.clock.settle()
  expect(w.calls.some(c => c.server === 'jira' && c.tool === 'search_issues' && String(c.args.jql) === 'key in (CGP-800)')).toBe(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ui: any = await $.ui.mount(pane('terminal') as never)
  await w.clock.settle()
  let view = await drawn(ui)
  expect(view).toContain('CGP-800')
  expect(view).toContain('To Do')
  expect(view).toContain('Fix lock retry')
  // Someone closes it outside the session; the periodic read picks it up.
  Object.assign(jira['CGP-800'] as Issue, { name: 'Done', cat: 'done' })
  const before = w.calls.filter(c => c.tool === 'search_issues').length
  await w.clock.advance(5 * 60_000 + 1_000)
  await w.clock.settle()
  expect(w.calls.filter(c => c.tool === 'search_issues').length).toBeGreaterThan(before)
  expect(w.toasts).toContain('CGP-800 is done')
  view = await drawn(ui)
  expect(view).toContain('all 1 done')
  await ui.unmount()
})

test('a transition Claude runs is read back right after, even when its answer says nothing about the status', { timeoutMs: 20_000 }, async ($, on) => {
  const jira: Record<string, Issue> = { 'CGP-5': { name: 'In Progress', cat: 'indeterminate', summary: 'Audit log' } }
  const w = world(on, jira)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  await $.command.run({ command: 'cgp-follow-ups', args: 'add CGP-5', origin: { kind: 'person' } } as never)
  await w.clock.advance(3_000)
  await w.clock.settle()
  let list = await $.command.run({ command: 'cgp-follow-ups', args: 'list', origin: { kind: 'person' } } as never)
  expect(JSON.stringify(list)).toContain('CGP-5 [In Progress] Audit log (https://crypto-gameplan.atlassian.net/browse/CGP-5)')
  await $.tool.call({ tool: 'mcp__jira__transition_issue', issueKey: 'CGP-5', transitionId: '31' } as never)
  await w.clock.advance(3_000)
  await w.clock.settle()
  list = await $.command.run({ command: 'cgp-follow-ups', args: 'list', origin: { kind: 'person' } } as never)
  expect(JSON.stringify(list)).toContain('Done (1)')
})

test('gh issue create is tracked and its state comes from gh', { timeoutMs: 20_000 }, async ($, on) => {
  const w = world(on, {}, { 'https://github.com/o/r/issues/5': '{"state":"CLOSED","stateReason":"COMPLETED","title":"Docs"}' })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'gh issue create --title "Docs" --body x' } as never)
  await w.clock.advance(3_000)
  await w.clock.settle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ui: any = await $.ui.mount(pane('desktop') as never)
  await w.clock.settle()
  expect(await drawn(ui)).toContain('all 1 done')
  await ui.press({ key: 'toggle-done' })
  await w.clock.settle()
  const view = await drawn(ui)
  expect(view).toContain('o/r#5')
  expect(view).toContain('Closed')
  await ui.unmount()
})

test('the bar steps aside while cgp-effort hosts it, and the host feed is written', { timeoutMs: 20_000 }, async ($, on) => {
  const jira: Record<string, Issue> = { 'CGP-7': { name: 'To Do', cat: 'new', summary: 'Rename field' } }
  const w = world(on, jira)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  await $.command.run({ command: 'cgp-follow-ups', args: 'add CGP-7', origin: { kind: 'person' } } as never)
  await w.clock.advance(3_000)
  await w.clock.settle()
  const bandProps = { bodyColumns: 120 } as never
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own: any = await $.ui.mount({ plugin: 'cgp-follow-ups', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as never)
  await w.clock.settle()
  expect(await drawn(own)).toContain('CGP-7')
  await own.unmount()
  expect(JSON.stringify(w.feeds.at(-1))).toContain('"next":{"key":"CGP-7"')
  w.effort.followHost = { v: 1, draws: true }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hosted: any = await $.ui.mount({ plugin: 'cgp-follow-ups', surface: 'terminal', component: 'AbovePrompt', props: bandProps } as never)
  await w.clock.settle()
  expect(await drawn(hosted)).not.toContain('CGP-7')
  await hosted.unmount()
  // A press in the host's row reaches the plugin within a tick.
  w.effort.followRequest = { id: 1, action: 'panel' }
  await w.clock.advance(1_100)
  await w.clock.settle()
  expect(w.opened.length).toBeGreaterThan(0)
})

test('a broken tracker never blocks a tool call, and the item says why it is unchecked', { timeoutMs: 20_000 }, async ($, on) => {
  const w = world(on, {}, {}, true)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  const ran = await $.tool.call({ tool: 'mcp__jira__create_issue', projectKey: 'CGP', issueType: 'Task', summary: 'X' } as never)
  expect(JSON.stringify(ran)).toContain('CGP-800')
  await w.clock.advance(3_000)
  await w.clock.settle()
  const list = await $.command.run({ command: 'cgp-follow-ups', args: 'list', origin: { kind: 'person' } } as never)
  expect(JSON.stringify(list)).toContain('CGP-800 [Not checked]')
})
