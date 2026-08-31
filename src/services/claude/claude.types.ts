// Claude domain data models (moved out of the former bridge api.d.ts).

// A stored Claude conversation (one .jsonl under ~/.claude/projects/<cwd>/).
export interface ClaudeSession {
  id: string // session UUID (filename) — used with `claude --resume <id>`
  cwd: string | null
  summary: string // first user prompt (truncated)
  mtimeMs: number
}

// Coarse session state from the JSONL tail for the sidebar status dot.
export type ClaudeSessionStatus = 'in-progress' | 'question' | 'idle'

// Real server-side usage from `GET /api/oauth/usage`. Each window's
// `utilization` is an already-computed 0-100 percentage; `resetsAt` is ms epoch.
export interface ClaudeUsageWindow {
  utilization: number
  resetsAt: number
}
export interface ClaudeRealUsage {
  fiveHour: ClaudeUsageWindow | null
  sevenDay: ClaudeUsageWindow | null
  sevenDaySonnet: ClaudeUsageWindow | null
  modelName: string | null
  fetchedAt: number
  error?: 'no-token' | 'auth-expired' | 'network' | 'unavailable'
}

export interface ClaudeUsageBucket {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}
export interface ClaudeUsageSummary {
  today: ClaudeUsageBucket
  thisWeek: ClaudeUsageBucket
  thisMonth: ClaudeUsageBucket
  sessions: number
  lastModel: string | null
  lastSpeed: string | null
  thinkingDetected: boolean
  resetTimes: { day: number; week: number; month: number }
}

// The model actually in use, read from the most recently written session jsonl.
// `model` is the raw id (e.g. claude-opus-4-5-20251101); `speed` is Claude's
// output speed for that turn ('standard' | 'fast'); `at` is the message time.
export interface ClaudeLastModel {
  model: string
  speed: string | null
  at: number
}

export interface ClaudeRealUsageOptions {
  keychainService?: string
  fallbackToken?: string | null
  force?: boolean
}
