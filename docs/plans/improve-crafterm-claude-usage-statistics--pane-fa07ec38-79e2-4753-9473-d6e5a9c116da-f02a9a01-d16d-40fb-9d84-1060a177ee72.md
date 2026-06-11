# Claude Usage Statistics — real data from `/api/oauth/usage`

## Problem

The status-bar usage chip + popover compute percentages by summing raw tokens
from `~/.claude/projects/**/*.jsonl` and dividing by hardcoded caps
(`7M/50M/200M`). This is wrong on every axis: caps are guesses, cache reads
inflate totals, and Anthropic's real limits are a server-side weighted metric.
Result: chip shows `427% wk` while the real `/usage` shows `3%`.

## Source of truth (discovered from Claude Code 2.1.160 bundle)

```
GET https://api.anthropic.com/api/oauth/usage
Headers: Content-Type: application/json + Authorization: Bearer <oauth access token>
```

Response (relevant fields), `utilization` is the real 0-100 percentage:

```jsonc
{
  "five_hour":        { "utilization": <0-100>, "resets_at": <unix-sec> }, // Current session
  "seven_day":        { "utilization": <0-100>, "resets_at": <unix-sec> }, // Current week (all models)
  "seven_day_sonnet": { "utilization": <0-100>, "resets_at": <unix-sec> }, // Current week (Sonnet only)
  "seven_day_opus":   { "utilization": <0-100>, "resets_at": <unix-sec> }
}
```

Maps 1:1 to the official `/usage` screen.

## Decisions (confirmed with user)

- "Daily" threshold notifications bind to the **5-hour session** window (API has no daily).
- Popover shows three bars: **Session (5h) / Week (all) / Week (Sonnet only)**.
- Weekly threshold notifications watch **Week (all models)** (`seven_day`).
- Token source: **macOS keychain service name** (default `Claude Code-credentials`),
  **fallback** to a Crafterm account **secret** entry. Both editable in Settings.

## Implementation

### 1. Token source + endpoint (main)

- New IPC `claude:realUsage(opts: { keychainService: string; fallbackToken: string | null }): Promise<RealUsage>`.
  - Resolve token: `security find-generic-password -s <keychainService> -w` →
    JSON parse → `claudeAiOauth.accessToken`. If that fails/empty, use
    `opts.fallbackToken` (may itself be raw token OR the same JSON blob — handle both).
  - No token → `{ error: 'no-token' }`.
  - `GET /api/oauth/usage` with Bearer token (Node `https`/`fetch`, 5s timeout).
  - 401 / expired → best-effort refresh via `claudeAiOauth.refreshToken` +
    `oauth/token` (client_id grep'd from bundle); in-memory only, NO write-back.
    If refresh unavailable → `{ error: 'auth-expired' }`.
  - Map response → `RealUsage`; cache 60s in main to dedupe rapid calls.
- Add preload method + `api.d.ts` signature + `RealUsage` type.

### 2. Settings (renderer)

- `settings.claudeUsageAuth = { keychainService: 'Claude Code-credentials', fallbackSecretId: '', fallbackSecretKey: '' }`.
- Lockstep persist: field on `settings` (state.ts) + `persist()` payload +
  `loadSettings()` guard + `SavedState` in `api.d.ts`.
- Settings modal: text input for keychain service name + a select of existing
  `kind:'secret'`/account-field references for the fallback. Renderer resolves
  the fallback token via `secretGet(id,key)` before calling the IPC.

### 3. Status bar chip + popover (notifications.ts)

- Chip refresh now calls `claude:realUsage`; label uses `seven_day.utilization`
  → `<model?> · <effort> · N% wk` (real N).
- Auto-refresh interval 30s → **1h** (3600_000).
- Add a small **refresh button** next to the chip in `index.html` (+ css);
  click re-fetches immediately with a brief spinner state.
- Popover: replace Today/Week/Month token bars with three utilization bars
  (Session / Week / Week-Sonnet) showing `N% used` + `resets <time>` from
  `resets_at`. Error states ('no-token' / 'auth-expired') render a hint row.
- Drop dependence on `claudeUsageSummary` for the chip/popover (handler may stay
  for now, unused).

### 4. Threshold notifications (50/70/80/90/100)

- After each fetch, evaluate `five_hour.utilization` ("daily") and
  `seven_day.utilization` ("weekly") against `[50,70,80,90,100]`.
- Persisted state `settings.claudeUsageNotify = { session: {resetsAt,level}, week: {resetsAt,level} }`.
  - When `resets_at` changes (new period) → reset `level` to 0.
  - For each threshold newly crossed above stored `level`, `pushNotification`
    (group `Claude Usage`) and bump `level`. No re-fire within the same period.

## Verify

- `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` clean.
- `npm run build`.
- `npm run dev`: chip shows real `% wk`; popover three bars match `/usage`;
  refresh button works; lower a threshold temporarily to confirm a notification
  card appears.
