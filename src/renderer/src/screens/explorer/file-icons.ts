// File-explorer icon glyphs (inline SVG). Explorer-specific (not a reusable
// crafterm-ui primitive): each filename maps to an icon category that drives both
// the glyph and the color tint (expl-ic-<category>).

export const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const FILE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'

// A short letter/symbol badge glyph (e.g. "TS", "JS", "<>"), tinted via iconClass.
function letterGlyph(text: string, font = 'system-ui,-apple-system,sans-serif'): string {
  const size = text.length >= 2 ? 7 : 11
  return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><text x="8" y="11.5" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${size}" fill="currentColor">${text}</text></svg>`
}

// Config / settings glyph: three horizontal lines of varying length.
const LINES_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M3 5h10M3 8h7M3 11h10"/></g></svg>'

// Markdown mark: rounded square with the "M" + downward arrow.
const MD_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="1" y="3.5" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 10.5V5.5h1.4L6 7.6l1.6-2.1H9v5H7.6V7.7L6 9.7 4.4 7.7v2.8z" fill="currentColor"/><path d="M11.4 5.5h1.3v2.7h1.1l-1.75 2.1-1.75-2.1h1.1z" fill="currentColor"/></svg>'

// Image glyph: framed picture with a sun and a mountain.
const IMG_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5.5" cy="6.5" r="1.1" fill="currentColor"/><path d="M3 12l3.5-3.5L9 11l2-2 2 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'

// Distinct glyph per icon category (falls back to the generic file outline).
const GLYPHS: Record<string, string> = {
  ts: letterGlyph('TS'),
  js: letterGlyph('JS'),
  json: letterGlyph('{}', 'ui-monospace,monospace'),
  md: MD_SVG,
  sh: letterGlyph('$', 'ui-monospace,monospace'),
  config: LINES_SVG,
  data: LINES_SVG,
  web: letterGlyph('<>'),
  img: IMG_SVG,
  swift: letterGlyph('SW'),
  py: letterGlyph('PY'),
  go: letterGlyph('GO'),
  rust: letterGlyph('RS')
}

// Map a filename to an icon category — drives both the glyph and the color tint.
export function iconCategory(name: string): string {
  const lower = name.toLowerCase()
  // Special filenames (no or ambiguous extension).
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower === '.dockerignore') return 'config'
  if (lower === 'makefile' || lower === 'cmakelists.txt') return 'config'
  if (lower.startsWith('.env')) return 'config'
  if (
    lower === '.gitignore' ||
    lower === '.gitattributes' ||
    lower === '.npmrc' ||
    lower === '.editorconfig' ||
    lower === '.prettierrc'
  )
    return 'config'

  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  switch (ext) {
    case 'swift':
      return 'swift'
    case 'ts':
    case 'tsx':
      return 'ts'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'js'
    case 'json':
    case 'jsonc':
      return 'json'
    case 'md':
    case 'mdx':
    case 'mdc':
    case 'markdown':
      return 'md'
    case 'html':
    case 'htm':
    case 'css':
    case 'scss':
    case 'less':
      return 'web'
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return 'sh'
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'properties':
      return 'config'
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
    case 'plist':
      return 'data'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'icns':
      return 'img'
    case 'py':
      return 'py'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    default:
      return 'default'
  }
}

// The glyph for a file: a type-specific badge when known, else the file outline.
export function iconFor(name: string): string {
  return GLYPHS[iconCategory(name)] ?? FILE_SVG
}
