// Parse a plan filename in the form `<branch>-<slug>--pane-<uuid>.<ext>` (new
// format with ownership) or `<branch>-<slug>.<ext>` (legacy / shared).
//
// Returns null when the filename does not match the branch at all. When a match
// has no `--pane-<uuid>` suffix, `ownerStableId` is null (legacy → shown to
// every matching pane in the sidebar).

const EXT_RE = /\.(md|mdx|mdc)$/i
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const OWNER_SUFFIX_RE = new RegExp(`--pane-(${UUID_RE.source})$`, 'i')

export interface ParsedPlan {
  slug: string
  ownerStableId: string | null
}

export function parsePlanFilename(filename: string, branch: string): ParsedPlan | null {
  if (!EXT_RE.test(filename)) return null
  const base = filename.replace(EXT_RE, '')
  // Filenames can't contain "/" — the branch's "/" is rewritten to "-".
  const prefixes = [branch + '-', branch.replace(/\//g, '-') + '-']
  const prefix = prefixes.find((p) => base.startsWith(p))
  if (!prefix) return null
  const tail = base.slice(prefix.length)
  const m = tail.match(OWNER_SUFFIX_RE)
  if (m && typeof m.index === 'number') {
    const slug = tail.slice(0, m.index).replace(/-+$/, '')
    return { slug, ownerStableId: m[1].toLowerCase() }
  }
  return { slug: tail, ownerStableId: null }
}
