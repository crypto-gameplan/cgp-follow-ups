# CGP Follow-ups

A Claude Code plugin by [Crypto Gameplan](https://github.com/crypto-gameplan). It keeps the follow-up issues of your session in view. Every issue Claude creates in Jira, GitHub or Linear is tracked. Its status follows the tracker by itself, and a row above the prompt shows what is still open.

How everything works, in detail: [docs/GUIDE.md](docs/GUIDE.md). The same as a PDF is attached to every release ([latest](https://github.com/crypto-gameplan/cgp-follow-ups/releases/latest/download/CGP-Follow-ups-Guide.pdf)). In Claude Code you can also just ask, for example "why does an issue say Not checked?": the plugin brings a skill that answers from the guide.

## Install

CGP Follow-ups is listed in the Crypto Gameplan marketplace ([crypto-gameplan/cgp-marketplace](https://github.com/crypto-gameplan/cgp-marketplace)). In Claude Code, run:

```text
/plugin marketplace add crypto-gameplan/cgp-marketplace
```

```text
/plugin install cgp-follow-ups@crypto-gameplan
```

Then run `/reload-plugins` or restart Claude Code.

## What it does

- **It notices new issues.** When Claude creates an issue through a Jira, GitHub or Linear MCP server, or with `gh issue create`, the issue is added to the list. A toast says so.
- **The status follows the tracker.** Open issues are read back from their tracker every few minutes. They are also read right after Claude creates or changes one, when you send a prompt, and when you open the panel. An issue someone closes in the browser, through a Jira automation or by merging a PR with "Closes #12" turns done by itself.
- **Jira is read without permission prompts.** The plugin reads statuses through the session's own MCP connection, with one search for all keys. Links point at your Jira site.
- **Three steps for every tracker.** To do (ring), in progress (half, CGP gold) and done (green tick). The tracker's own word stays visible next to it, for example "Code Review" or "Skipped".
- **Your marks hold until the tracker moves.** "Done" on an item that Jira still shows as In Progress stays done. Once Jira changes the status, Jira wins again.

## The bar and the panel

With [CGP Effort](https://github.com/crypto-gameplan/cgp-effort) installed, the follow-ups show as a row inside its bar, in the same look as the CGP Crew row. Without it, CGP Follow-ups draws its own bar above the prompt. Either way, the row has one status chip per issue, the counts, a button for the panel and a ✕.

The panel lists every issue, open ones first. Each shows its key, title, status and tracker. Each open issue has three buttons: **Work on it** puts "Let's work on follow-up CGP-812: …" into the prompt, **Done** marks it done, and **Open ↗** opens it in the tracker. Done issues fold away under "Done · n" and have **Reopen** instead.

## Command

| Command | What it does |
| --- | --- |
| `/cgp-follow-ups` | Opens the panel and lists the follow-ups |
| `/cgp-follow-ups list` | Lists them as text |
| `/cgp-follow-ups sync` | Reads every open one from its tracker now |
| `/cgp-follow-ups add CGP-123 [title]` | Adds an issue by hand: a Jira key or a GitHub issue URL |
| `/cgp-follow-ups done CGP-123` / `reopen CGP-123` | Marks one done or open |
| `/cgp-follow-ups remove CGP-123` | Takes one off the list |
| `/cgp-follow-ups clear` | Removes everything that is done |

## Settings

All settings are in `/config` under cgp-follow-ups.

| Setting | Default | What it does |
| --- | --- | --- |
| Sync every | `5 min` | How often open follow-ups are read back: `2 min`, `5 min`, `15 min` or `off`. The reads after a change and on a prompt happen either way. |
| Bar above the prompt | `on` | `off` keeps only the panel and the command. |

## Safe by design

- A failure in the plugin never blocks Claude. Every hook that a tool call or prompt waits on lets the call through if the plugin's own work fails.
- A tracker that does not answer within 20 seconds is skipped. The item keeps its last known status and says why it could not be read.

## Development

```bash
claude plugin validate .
claude plugin test .
```

`CLAUDE.md` describes the layout of `hooks/`.

## License

[MIT](LICENSE).
