# cgp-follow-ups

A Claude Code plugin: one function-hooks mod that tracks the follow-up issues of a session.

- Validate: `claude plugin validate .`
- Test: `claude plugin test .`
- Type-check: `bunx -p typescript@5.6.3 tsc -p .`. This needs `.claude-plugin/types/`, which appears after the mod has loaded once with `claude --plugin-dir .`.

Layout of `hooks/`:
- `register.tsx` holds every hook, the `$.state` atoms and every `$` call: detecting issues after tool calls, reading statuses back (`$.mcp.call` for Jira and Linear, `gh` for GitHub), the one-second tick, and the handshake with cgp-effort.
- `core/` is pure logic: `detect` (which tool calls create or touch an issue), `status` (parsing tracker answers into to do / in progress / done), `items` (marks, order, counts, the feed), `settings`, `format`, `strings`.
- `ui/` is pure drawing: `band.tsx` (the own bar), `pane.tsx` (the panel), `svg.ts` (the CGP mark and the status dot), `palette.ts`.

Conventions:
- UI text is English and lives in `hooks/core/strings.ts`.
- Statuses are read with `$.mcp.call`. It goes through the permission check like any tool call and a plugin's call has no dialog, so the `tool.check` hook allows exactly the plugin's own `search_issues`, `get_issue` and `get_server_info` calls (`isStatusRead` in `core/detect.ts`), never Claude's.
- Every gating hook ends in `.catch(($, e, next) => next(e))`, and every fire-and-forget promise has a `.catch`.
- SVG is drawn only when `e.surface === 'desktop'` and the surface has an `Svg` element.
- Shared bar with cgp-effort: `cgp-follow-ups.feed` (format `FEED_VERSION` in `core/items.ts`) is read by cgp-effort's `hooks/ui/follow.tsx`. cgp-effort answers with `cgp-effort.followHost` and passes presses back through `cgp-effort.followRequest`. Change the feed shape only together with a new version on both sides.
- Colours match cgp-effort and cgp-crew: CGP gold `#ffab19` for in progress, green for done.

Guide:
- `docs/GUIDE.md` is the reference the `cgp-follow-ups-help` skill answers from. Change it with every change a user can see.
- On a version bump, run `node tools/sync-version.mjs docs/GUIDE.md .claude-plugin/plugin.json` so its version line follows.
- The PDF is built from `../cgp-follow-ups-docs/guide/guide.html` with the cgp-guide skill and attached to the GitHub release as `CGP-Follow-ups-Guide.pdf`.
