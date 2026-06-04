// Parse a plan filename and recover which session/pane owns it, in any of:
//   <branch>-<slug>--pane-<uuid>.<ext>        — explicit pane stableId tag
//   <branch>-<slug>-<uuid>.<ext>              — trailing Claude session id (hook)
//   <branch>-<slug>.<ext>                     — legacy / shared (no owner)
//
// Returns null when the filename does not match the branch at all. Otherwise:
//   `ownerStableId`  — set from a `--pane-<uuid>` tag (a pane's CRAFTERM_PANE_ID)
//   `ownerSessionId` — set from a trailing `-<uuid>` (a Claude session id)
// Both null means a legacy/shared plan. The two are matched independently in the
// sidebar (pane.stableId vs pane.claudeSessionId), so a plan named either way
// attaches to its producing session.

const EXT_RE = /\.(md|mdx|mdc)$/i
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
// Match `--pane-<UUID>` anywhere in the tail. Additional trailing segments
// (e.g. a session-id appended by harness hooks) are allowed and ignored — the
// pane UUID is the source of truth for sidebar attribution.
const OWNER_TAG_RE = new RegExp(`--pane-(${UUID_RE.source})`, 'i')
// Match a bare `-<UUID>` at the very end of the tail — the session id the
// SessionStart hook instructs the model to append to plan filenames.
const SESSION_TAG_RE = new RegExp(`-(${UUID_RE.source})$`, 'i')

export interface ParsedPlan {
  slug: string
  ownerStableId: string | null
  ownerSessionId: string | null
}

export function parsePlanFilename(filename: string, branch: string): ParsedPlan | null {
  if (!EXT_RE.test(filename)) return null
  const base = filename.replace(EXT_RE, '')
  // Filenames can't contain "/" — the branch's "/" is rewritten to "-".
  const prefixes = [branch + '-', branch.replace(/\//g, '-') + '-']
  const prefix = prefixes.find((p) => base.startsWith(p))
  if (!prefix) return null
  const tail = base.slice(prefix.length)
  // A `--pane-<uuid>` tag wins and pins the pane's stableId. Any trailing
  // session segment after it is left as-is (the pane tag is authoritative).
  const pane = tail.match(OWNER_TAG_RE)
  if (pane && typeof pane.index === 'number') {
    const slug = tail.slice(0, pane.index).replace(/-+$/, '')
    return { slug, ownerStableId: pane[1].toLowerCase(), ownerSessionId: null }
  }
  // Otherwise a bare trailing `-<uuid>` is the Claude session id.
  const session = tail.match(SESSION_TAG_RE)
  if (session) {
    const slug = tail.slice(0, tail.length - session[0].length).replace(/-+$/, '')
    return { slug, ownerStableId: null, ownerSessionId: session[1].toLowerCase() }
  }
  return { slug: tail, ownerStableId: null, ownerSessionId: null }
}
