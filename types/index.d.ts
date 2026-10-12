// The state cgp-follow-ups keeps in $.state, and the feed it hands cgp-effort for the shared bar.

/** Where an issue stands, in three steps every tracker maps onto. */
export type Category = 'todo' | 'doing' | 'done' | 'unknown'

export type Status = {
  /** The tracker's own word: `In Progress`, `Code Review`, `Closed`. */
  name: string
  category: Category
}

export type Tracker = 'jira' | 'github' | 'linear' | 'manual'

/** One issue created in this session (or added by hand). */
export type FollowUp = {
  /** `CGP-123` for Jira and Linear, `owner/repo#42` for GitHub. */
  key: string
  title: string
  url?: string
  tracker: Tracker
  /** The MCP server it was created through, which its status is read back from. */
  server?: string
  createdAt: number
  /** What the tracker last said. */
  status: Status
  /**
   * The person's own mark, kept until the tracker moves on: `trackerName` is the tracker's status when they
   * marked it, so a later change there wins again.
   */
  mark?: { category: 'todo' | 'done'; trackerName: string }
  /** When the tracker was last asked, 0 before the first answer. */
  checkedAt: number
  /** When the item became done, for the "just finished" moment in the bar. */
  doneAt?: number
  /** Why the last read failed, '' when it worked. */
  problem?: string
}

export type Panel = {
  isBandHidden: boolean
  showDone: boolean
  handledRequest: number
  lastSyncAt: number
  /** Jira site per MCP server, for links: `https://x.atlassian.net`. */
  sites: Record<string, string>
}

/** What cgp-effort draws in its bar: counts, the item to look at next, and one chip per issue. */
export type FollowFeed = {
  v: number
  open: number
  doing: number
  done: number
  /** The first open item, in progress before to do. */
  next: { key: string; title: string; status: string; category: Category } | null
  chips: { key: string; category: Category }[]
  isSyncing: boolean
}

export type FollowHost = { v: number; draws: boolean }
export type FollowRequest = { id: number; action: 'panel' | 'hide' | 'sync' }

declare module 'claude-code' {
  interface PluginState {
    'cgp-follow-ups': {
      items: FollowUp[]
      panel: Panel
      feed: FollowFeed | null
      syncing: boolean
    }
    'cgp-effort': {
      /** cgp-effort's own value, read here: set while its bar shows the follow-up row. */
      followHost: FollowHost | null
      /** The last press in that row, for cgp-follow-ups to carry out; `id` grows with each press. */
      followRequest: FollowRequest | null
    }
  }
}
