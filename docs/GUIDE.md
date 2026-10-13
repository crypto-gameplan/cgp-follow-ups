# CGP Follow-ups guide

Version 1.0.2, updated 2026-10-13. This guide describes that version; a newer plugin may differ in details.

This is the reference for CGP Follow-ups, a Claude Code plugin by Crypto Gameplan. An agent that is asked how the plugin works should answer from this file. Names in quotes are the words the person sees in the app, so they can find them.

## What it does

CGP Follow-ups keeps the follow-up issues of a session in view. When Claude creates an issue in Jira, GitHub or Linear, the plugin adds it to a list. It then reads each open issue's status back from its tracker by itself, so an issue that someone closes elsewhere turns done in the list too.

A row above the prompt shows one status chip per issue and the counts. A panel lists every issue with its key, title, status and actions.

## Installing, updating and removing

CGP Follow-ups is listed in the Crypto Gameplan marketplace, `crypto-gameplan/cgp-marketplace`. Install in Claude Code with two commands:

```text
/plugin marketplace add crypto-gameplan/cgp-marketplace
/plugin install cgp-follow-ups@crypto-gameplan
```

Then run `/reload-plugins` or restart Claude Code. The plugin is a mod: it draws in the desktop app and in the terminal.

To update, run `/plugin marketplace update crypto-gameplan`, then `/plugin update cgp-follow-ups@crypto-gameplan`, and restart. To remove it, run `/plugin uninstall cgp-follow-ups@crypto-gameplan`.

## How issues get on the list

The plugin watches Claude's tool calls. An issue is added when:

| Claude runs | The plugin takes |
|---|---|
| A create tool of a Jira, Atlassian, GitHub or Linear MCP server (`create_issue`, `bulk_create_issues`, `issue_write` with method `create`, and similar names) | The new issue's key from the answer. A key the call only named, such as a parent or an epic, is left out. A bulk create adds every new issue. |
| `gh issue create` in Bash | The issue URL that `gh` prints. The key is `owner/repo#number`. |

A toast says "Follow-up tracked: CGP-812: Fix lock retry". The person can also add an issue by hand with `/cgp-follow-ups add`, given a Jira key or a GitHub issue URL. A hand-added Jira key is read from Jira when the list already has a Jira item or the session has an MCP server named `jira`; otherwise the item is the person's to tick off.

The list belongs to the session. A new session starts empty.

## How the status follows the tracker

Every item has one of three states, and the tracker's own word for it stays visible next to it ("In Progress", "Code Review", "Skipped").

| State | Chip | Comes from |
|---|---|---|
| To do | ring | Jira's status category "new", GitHub "Open", Linear "backlog", "unstarted" or "triage" |
| In progress | half filled, gold | Jira's category "indeterminate", Linear "started" |
| Done | filled with a tick, green | Jira's category "done", GitHub "Closed", Linear "completed" or "canceled" |
| Not checked | dotted ring | The tracker has not answered yet, or could not be read |

The plugin reads open items again:

- about 2.5 seconds after Claude creates an issue or runs a call that names a tracked key (a transition, an update, a comment);
- after `gh issue close`, `gh issue reopen`, `gh pr merge`, `gh pr close` or `git push`, for GitHub items, because a merged PR with "Closes #12" closes the issue;
- when the person sends a prompt and the last read is more than a minute old;
- when the panel gets the focus and the last read is more than 20 seconds old;
- every 5 minutes, or the interval set in "Sync every";
- on "Sync" in the panel or `/cgp-follow-ups sync`.

Jira items are read with one search for all keys (`key in (...)`, 50 keys per search) through the session's own Jira MCP server, with `search_issues`, or `get_issue` one by one when the server has no search. GitHub items are read with `gh issue view`. Linear items are read with the Linear MCP server's `get_issue`. A tracker that does not answer within 20 seconds is skipped; the item keeps its last status and shows why it could not be read.

Those reads run as the plugin's own calls. Claude Code asks for permission on MCP calls, and a plugin's call has no dialog to ask in, so the plugin allows exactly its own `search_issues`, `get_issue` and `get_server_info` calls. Calls Claude makes go through the normal permission check.

When an item turns done during a read, a toast says "CGP-812 is done".

### Marking an item by hand

"Done" in the panel marks an item done. The mark holds while the tracker still reports the status it had when the person pressed it. Once the tracker changes the status, the tracker wins again. "Reopen" works the same way the other direction. The card says "marked by you" while a mark holds.

## The row above the prompt

With CGP Effort installed and its "Look" set to "Dashboard", the row sits inside the CGP Effort bar, under the CGP Crew row when a crew runs. Otherwise CGP Follow-ups draws its own bar above the prompt.

| In the row | Meaning |
|---|---|
| ✦ Follow-ups (in the CGP Effort bar) or the CGP mark and "Follow-ups" (own bar) | The row belongs to CGP Follow-ups. |
| ◐ CGP-812 ○ CGP-815 ● CGP-809 | One chip per issue, in progress first, then to do, then done. Chips that do not fit become "+n". |
| "1 in progress · 2 to do · 1 done" | The counts. "all 3 done" in green when nothing is open. |
| "Follow-ups 4" | Opens or closes the panel. |
| ✕ | Hides the row for this session. |

The row shows while an item is open and for five minutes after the last one turned done. "Bar above the prompt" set to "off" leaves the row out entirely.

## The panel

`/cgp-follow-ups` or "Follow-ups n" opens the panel. Its head shows "CGP Follow-ups", the counts and when the list was last read ("synced 2m ago", "Syncing…").

Each issue is a card with its status dot, key, title, the tracker's word for the status, and the tracker (Jira, GitHub, Linear, or "added by hand"). Open issues come first, in progress before to do, newest first within each. Below each open card:

| Button | What it does |
|---|---|
| "Work on it" | Puts "Let's work on follow-up CGP-812: Fix lock retry (link)" into the prompt, replacing what is there. |
| "Done" | Marks the item done (see above). |
| "Open ↗" | Opens the issue in the browser. Jira links point at the site the Jira MCP server reports. |
| "Remove" | Takes the item off the list. |

Done items fold away under "Done · n" and have "Reopen" instead of "Work on it" and "Done". At the foot, "Sync" reads every open item now and "Clear done" removes every done item.

In the desktop app the cards are drawn as graphics. In the terminal the same content is text, with ○ ◐ ● ◌ as the status marks.

## Settings

The settings are in `/config` under cgp-follow-ups, or `/plugin configure cgp-follow-ups@crypto-gameplan`.

| Setting | Values | Default | Effect |
|---|---|---|---|
| "Sync every" | `2 min`, `5 min`, `15 min`, `off` | `5 min` | How often open items are read on a timer. With `off` they are still read after changes, on a prompt, on focus and on "Sync". |
| "Bar above the prompt" | `on`, `off` | `on` | `off` keeps only the panel and the command. |

## Commands

| Command | What it does |
|---|---|
| `/cgp-follow-ups` | Opens the panel and lists the items as text. |
| `/cgp-follow-ups list` | Lists the items as text, with status and link. |
| `/cgp-follow-ups sync` | Reads every open item now and says how many changed. |
| `/cgp-follow-ups add CGP-123 [title]` | Adds a Jira key or a GitHub issue URL and answers with its status. |
| `/cgp-follow-ups done CGP-123` | Marks an item done. |
| `/cgp-follow-ups reopen CGP-123` | Marks an item open again. |
| `/cgp-follow-ups remove CGP-123` | Takes an item off the list. |
| `/cgp-follow-ups clear` | Removes every done item. |

## Data and costs

The plugin reads issue statuses from the trackers the session is already connected to: Jira and Linear through their MCP servers, GitHub through the `gh` command line tool with its own login. It sends nothing anywhere else and calls no model, so it costs no tokens. The list lives in the session's state and is gone when the session ends.

## Troubleshooting

| What the person sees | What to do |
|---|---|
| An issue Claude created did not show up | The create tool's server name must contain "jira", "atlassian", "github" or "linear". Add the issue with `/cgp-follow-ups add`. |
| "Not checked" with "not found in jira" | The key does not exist in that Jira, or the account cannot see it. |
| "Not checked" with a server message | The tracker did not answer. Check the MCP server under `/mcp`, then press "Sync". |
| A GitHub item says "gh is not available" | Install the GitHub CLI and run `gh auth login`. |
| The row does not show | No item is open, the row was hidden with ✕, or "Bar above the prompt" is `off`. |
| Two follow-up bars | An older follow-up mod is still loaded. Remove it, then restart. |
| `/cgp-follow-ups` is unknown in the terminal | Add `{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }` to `~/.claude/settings.json` and restart. |
| Bugs | Open an issue on `crypto-gameplan/cgp-follow-ups`. |
