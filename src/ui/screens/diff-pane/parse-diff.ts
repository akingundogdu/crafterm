// Pure unified-diff parser for the PR diff pane. Splits a `git diff` patch into
// per-file sections, tracking the new-file line number per hunk so added/context
// rows carry a selectable line and deleted rows do not.

export type RowKind = 'add' | 'del' | 'ctx' | 'hunk'

export interface ParsedRow {
  kind: RowKind
  text: string
  line: number | null // new-file line number (null when not selectable)
}

export interface FileDiff {
  path: string
  rows: ParsedRow[]
}

// The file header comes from `diff --git a/X b/Y` so deleted files (whose `+++`
// is /dev/null) still show up — just not as selectable rows.
export function parseDiff(patch: string): FileDiff[] {
  const files: FileDiff[] = []
  let cur: FileDiff | null = null
  let newLine = 0
  for (const raw of patch.split('\n')) {
    const gitHead = raw.match(/^diff --git a\/.+ b\/(.+)$/)
    if (gitHead) {
      cur = { path: gitHead[1], rows: [] }
      files.push(cur)
      newLine = 0
      continue
    }
    if (!cur) continue
    if (
      raw.startsWith('+++ ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('index ') ||
      raw.startsWith('new file') ||
      raw.startsWith('deleted file') ||
      raw.startsWith('similarity ') ||
      raw.startsWith('rename ') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode')
    ) {
      continue
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) newLine = Number(m[1])
      cur.rows.push({ kind: 'hunk', text: raw, line: null })
      continue
    }
    if (raw.startsWith('+')) {
      cur.rows.push({ kind: 'add', text: raw.slice(1), line: newLine })
      newLine++
    } else if (raw.startsWith('-')) {
      cur.rows.push({ kind: 'del', text: raw.slice(1), line: null })
    } else {
      cur.rows.push({ kind: 'ctx', text: raw.startsWith(' ') ? raw.slice(1) : raw, line: newLine })
      newLine++
    }
  }
  return files
}
