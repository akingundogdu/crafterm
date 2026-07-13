// Pure path helpers for the code pane: home-collapsed display, a short
// breadcrumb for the header, and a terminal-relative ref path for mentions.

export function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

// A light breadcrumb: the last few path segments joined with "›".
export function breadcrumb(path: string): string {
  const parts = shortPath(path).split('/').filter(Boolean)
  return parts.slice(-3).join('  ›  ')
}

// Path relative to a terminal's cwd when the file lives under it; else absolute.
export function refPath(absPath: string, cwd: string | null): string {
  if (cwd) {
    const base = cwd.endsWith('/') ? cwd : cwd + '/'
    if (absPath.startsWith(base)) return absPath.slice(base.length)
  }
  return absPath
}
