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
- Statuses are read with `$.mcp.call`, never `$.tool.call`: the latter goes through the permission dialog.
- Every gating hook ends in `.catch(($, e, next) => next(e))`, and every fire-and-forget promise has a `.catch`.
- SVG is drawn only when `e.surface === 'desktop'` and the surface has an `Svg` element.
- Shared bar with cgp-effort: `cgp-follow-ups.feed` (format `FEED_VERSION` in `core/items.ts`) is read by cgp-effort's `hooks/ui/follow.tsx`. cgp-effort answers with `cgp-effort.followHost` and passes presses back through `cgp-effort.followRequest`. Change the feed shape only together with a new version on both sides.
- Colours match cgp-effort and cgp-crew: CGP gold `#ffab19` for in progress, green for done.
