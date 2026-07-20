import { existsSync } from 'fs'

// Resolve a CLI by probing well-known install paths first, since GUI-launched
// apps don't inherit the user's shell PATH. Falls back to the bare name (a PATH
// lookup may still succeed).
export function resolveBin(candidates: string[], fallback: string): string {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return fallback
}

// What macOS hands a GUI-launched app (Finder/Dock) as PATH — no /opt/homebrew/bin,
// no /usr/local/bin. resolveBin() covers the binaries we spawn ourselves, but a
// binary those spawn by name (git looking up git-lfs for an LFS filter) is not
// found and the command fails.
const SYSTEM_PATH_ENTRIES = ['/usr/bin', '/bin', '/usr/sbin', '/sbin']

const splitPath = (path: string): string[] => path.split(':').filter(Boolean)

// True when PATH holds nothing beyond the system defaults, i.e. the app was
// launched from the GUI and needs the user's real PATH resolved. A PATH
// inherited from a shell (npm run dev) always carries more, so this is what
// keeps the login-shell probe off the dev startup path.
export function isBarePath(path: string): boolean {
  return splitPath(path).every((entry) => SYSTEM_PATH_ENTRIES.includes(entry))
}

// Prepend the entries `discovered` adds over `current`, keeping the login
// shell's own precedence (Homebrew ahead of /usr/bin, as in the user's terminal)
// and dropping duplicates. Null when discovered contributes nothing, so the
// caller can leave process.env.PATH untouched.
export function mergePath(current: string, discovered: string): string | null {
  const have = splitPath(current)
  const added = splitPath(discovered).filter((entry) => !have.includes(entry))
  if (!added.length) return null
  return [...added, ...have].join(':')
}

// Markers bracket the echoed PATH so anything the user's .zprofile prints on its
// own (banners, version managers) can't be mistaken for part of it.
export const PATH_MARKER_START = '__CRAFTERM_PATH__'
export const PATH_MARKER_END = '__CRAFTERM_PATH_END__'

// Pull the bracketed PATH out of the login shell's stdout. Null when the markers
// are missing or malformed — the shell failed before echoing.
export function extractMarkedPath(out: string): string | null {
  const start = out.indexOf(PATH_MARKER_START)
  if (start < 0) return null
  const from = start + PATH_MARKER_START.length
  const end = out.indexOf(PATH_MARKER_END, from)
  if (end < 0) return null
  return out.slice(from, end).trim()
}
