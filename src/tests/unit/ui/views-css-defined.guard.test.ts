import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

// Every class a view puts in the DOM must be defined in SOME stylesheet — or be a
// deliberate unstyled marker (a `display: contents` wrapper, a JS/e2e selector
// hook, a variant tag beside a styled class). The gea migration shipped markup
// whose CSS was never written (the close-actions modal rendered as bare text),
// and class-name drift between a view and its stylesheet (`danger` vs
// `button-danger`) silently un-styles elements. This guard catches both.
//
// KNOWN_UNSTYLED is an ALLOWLIST of intentional markers, kept tight both ways:
// a NEW undefined class fails (add CSS, or consciously add the marker here); an
// entry that is no longer undefined (styled or removed) also fails, so the list
// never rots. A token ending in '-' is a dynamic prefix (`'priority-' + p`) and
// passes when any defined class starts with it.
const SRC = join(process.cwd(), 'src')
const VIEWS = join(SRC, 'views')

const KNOWN_UNSTYLED: string[] = [
  // display:contents wrappers (layout delegated to children by design)
  'accounts-root',
  'bookmarks-root',
  'db-run-icon',
  'improve-search-mode',
  'improve-tab-mode',
  'meeting-note-archived-cards',
  'meeting-note-group',
  'meeting-notes-root',
  'notifications-root',
  'pr-root',
  'reminders-root',
  'time-root',
  'tree-above',
  'tree-actions',
  'tree-header-slot',
  'treeview-root',
  'treeview-rows',
  // picker roots: the modal box comes from overlayModal('picker-modal')
  'claude-accounts-picker',
  'claude-dashboard-picker',
  'claude-resume-picker',
  'feature-apps-section',
  'feature-setup',
  'finders-picker',
  'folder-picker',
  'git-picker',
  'global-search-picker',
  'plans-picker',
  'processes-picker',
  'project-picker',
  'ssh-picker',
  'worktree-picker',
  // JS / e2e selector hooks and mode flags
  'browser-pane',
  'code-pane',
  'daily-plan-form-overlay',
  'db-row-modal-nullcb',
  'doc-pane',
  'nb-sub-notes',
  'usage-text',
  'version-text',
  // variant tags / text spans styled through a parent or sibling class
  'accounts-list-wrap',
  'action-menu-panel',
  'btn-label',
  'file',
  'improve-ontop-btn',
  'improve-popout-btn',
  'mdfile-row',
  'meeting-notes-body',
  'notif-open-chip',
  'notif-open-row',
  'picker-row',
  'project-row',
  'reminders-panel',
  'settings-subtab-body',
  'settings-subtab-panel',
  'settings-subtabs-host',
  'shortcuts-panel',
  'spot-tab-name',
  'st-back',
  'tab-list',
  'time-report-name',
  'update-label',
  'worktree-progress-label'
]

// Third-party widget roots style themselves (their CSS ships with the library).
const THIRD_PARTY_PREFIXES = ['monaco', 'xterm']

function collect(dir: string, exts: string[], acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) collect(path, exts, acc)
    else if (exts.includes(extname(entry.name))) acc.push(path)
  }
}

// Every `.foo` selector token in any stylesheet under src/.
function definedClasses(): Set<string> {
  const files: string[] = []
  collect(SRC, ['.css'], files)
  const defined = new Set<string>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of source.matchAll(/\.([a-zA-Z_][\w-]*)/g)) defined.add(m[1])
  }
  return defined
}

// Literal class names a view puts in the DOM: class="a b" / class={'a b' + …} /
// class={`a ${…}`} (literal words only), classList.add/toggle, .className = 'a b'.
function usedClasses(): Set<string> {
  const files: string[] = []
  collect(VIEWS, ['.ts', '.tsx'], files)
  const used = new Set<string>()
  const add = (cls: string): void => {
    if (!cls || /^\d/.test(cls)) return
    if (THIRD_PARTY_PREFIXES.some((p) => cls.startsWith(p))) return
    used.add(cls)
  }
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(/\bclass(?:Name)?\s*=\s*(?:"([^"]+)"|\{\s*'([^']+)')/g)) {
      for (const c of (m[1] ?? m[2]).split(/\s+/)) add(c)
    }
    for (const m of source.matchAll(/\bclass(?:Name)?\s*=\s*\{`([^`]*)`\}/g)) {
      for (const c of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) add(c)
    }
    for (const m of source.matchAll(/classList\.(?:add|toggle)\(\s*'([^']+)'/g)) add(m[1])
    for (const m of source.matchAll(/\.className\s*=\s*'([^']+)'/g)) {
      for (const c of m[1].split(/\s+/)) add(c)
    }
  }
  return used
}

describe('views CSS-defined guard', () => {
  it('every class a view emits is styled somewhere or a known unstyled marker', () => {
    const defined = definedClasses()
    const undefinedUsed = [...usedClasses()]
      .filter((c) =>
        c.endsWith('-') ? ![...defined].some((d) => d.startsWith(c)) : !defined.has(c)
      )
      .sort()

    const unexpected = undefinedUsed.filter((c) => !KNOWN_UNSTYLED.includes(c))
    const stale = KNOWN_UNSTYLED.filter((c) => !undefinedUsed.includes(c))

    expect(
      unexpected,
      `these classes are used in views but defined in no stylesheet — add the CSS (co-located <name>.css), fix the drifted name, or list a deliberate marker in KNOWN_UNSTYLED: ${unexpected.join(', ')}`
    ).toEqual([])
    expect(
      stale,
      `no longer undefined — drop from KNOWN_UNSTYLED: ${stale.join(', ')}`
    ).toEqual([])
  })
})
