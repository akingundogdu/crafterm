import './code-pane.css'
import { codePanes, panes, state, paneActions, uid, settings } from '../../state'
import { persistence } from '@services/storage/persistence.service'
import { findTabByPane, panesInLayout } from '../../tree'
import { setupPaneDnd } from '../../pane'
import { createButton, createSelect } from '@ui/components'
import { createCodeEditor, type CodeEditor } from '../../editor/code-editor'
import { ALL_THEME_NAMES, currentThemeName, applyTheme } from '../../editor/monaco-setup'
import { DEFAULT_EDITOR_THEME } from '../../editor/editor-themes'
import { terminalService, fsService } from '@services'
import { breadcrumb, refPath } from './path-ref'

// An editable code editor pane (Monaco) opened from the Files panel.
// Syntax-highlights by file extension, supports Cmd +/- zoom, and saves the
// buffer back to disk on Cmd+S / the Save button. A single pane is reused for
// successive file clicks (openFile). Transient — not persisted.

const DEFAULT_FONT = 13
const MIN_FONT = 8
const MAX_FONT = 28

// Per-pane teardown (destroys the Monaco view on close).
const cleanups = new Map<string, () => void>()

// The terminal to target for "Add to chat": prefer a Claude session in the same
// tab as this code pane, else the tab's first terminal, else the active terminal.
function targetTerminalFor(codePaneId: string): { id: string; cwd: string | null } | null {
  const tab = findTabByPane(state.tree, codePaneId)
  if (tab) {
    const ids = panesInLayout(tab.root).filter((pid) => panes.has(pid))
    const pick = ids.find((pid) => panes.get(pid)?.claude) ?? ids[0]
    if (pick) return { id: pick, cwd: panes.get(pick)?.cwd ?? null }
  }
  if (state.activePaneId && panes.has(state.activePaneId)) {
    return { id: state.activePaneId, cwd: panes.get(state.activePaneId)?.cwd ?? null }
  }
  return null
}

export function createCodePane(opts: { path: string; themeName?: string; line?: number }): string {
  const id = uid('cp')
  const themeName = opts.themeName ?? DEFAULT_EDITOR_THEME
  let path = opts.path

  const el = document.createElement('div')
  el.className = 'pane-box diff-pane code-pane'
  el.dataset.paneId = id

  // ---- header: breadcrumb · dirty · save · copy · reveal · reload · close ----
  const header = document.createElement('div')
  header.className = 'pane-header diff-header'
  const center = document.createElement('div')
  center.className = 'diff-hcenter'
  const dirtyDot = document.createElement('span')
  dirtyDot.className = 'code-dirty-dot'
  dirtyDot.title = 'Unsaved changes'
  dirtyDot.style.display = 'none'
  const htitle = document.createElement('span')
  htitle.className = 'diff-path'
  htitle.textContent = breadcrumb(path)
  htitle.title = path
  center.append(dirtyDot, htitle)

  // Global Monaco theme picker (changes every editor — themes are global).
  const themeSel = createSelect({ options: [...ALL_THEME_NAMES], value: currentThemeName() })
  themeSel.className = 'code-theme-sel'
  themeSel.title = 'Editor theme'
  themeSel.addEventListener('mousedown', (e) => e.stopPropagation())
  themeSel.addEventListener('change', () => {
    settings.editorTheme = themeSel.value
    void applyTheme(themeSel.value)
    persistence.save()
  })

  // Build the `@<relpath>:<start>:<end>` mention for the current selection
  // (resolved against the target terminal's cwd). Drives the floating selection
  // actions (Copy / Add to Chat) rendered inside the editor.
  const buildMention = (): string | null => {
    if (!editor) return null
    const sel = editor.getSelection()
    if (!sel) return null
    const tgt = targetTerminalFor(id)
    const rel = refPath(path, tgt?.cwd ?? null)
    // Single line → `@path:14`; range → `@path:14-15`.
    const lines = sel.startLine === sel.endLine ? `${sel.startLine}` : `${sel.startLine}-${sel.endLine}`
    return `@${rel}:${lines}`
  }

  const copyRef = (): void => {
    const m = buildMention()
    if (m) void navigator.clipboard.writeText(m)
  }

  const addToChat = (): void => {
    const m = buildMention()
    const tgt = targetTerminalFor(id)
    if (!m || !tgt) return
    terminalService.input(tgt.id, m + ' ')
    paneActions.select(tgt.id)
    panes.get(tgt.id)?.term.focus()
  }

  const saveBtn = createButton({ className: 'diff-hbtn', text: '💾', title: 'Save (⌘S)' })
  const copyBtn = createButton({
    className: 'diff-hbtn',
    text: '⧉',
    title: 'Copy full path',
    onClick: (e) => {
      e.stopPropagation()
      void navigator.clipboard.writeText(path)
      const prev = copyBtn.textContent
      copyBtn.textContent = '✓'
      setTimeout(() => (copyBtn.textContent = prev), 1000)
    }
  })
  const revealBtn = createButton({
    className: 'diff-hbtn',
    text: '⌕',
    title: 'Show in Finder',
    onClick: (e) => {
      e.stopPropagation()
      fsService.revealPath(path)
    }
  })
  const reload = createButton({
    className: 'diff-hbtn',
    text: '⟳',
    title: 'Reload from disk (discards unsaved edits)',
    onClick: (e) => {
      e.stopPropagation()
      void load()
    }
  })
  const close = createButton({
    className: 'diff-hbtn diff-hclose',
    text: '×',
    title: 'Close',
    onClick: (e) => {
      e.stopPropagation()
      paneActions.close(id)
    }
  })
  header.append(center, themeSel, saveBtn, copyBtn, revealBtn, reload, close)

  const body = document.createElement('div')
  body.className = 'diff-body code-body'

  el.append(header, body)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- state ----
  let fontSize = DEFAULT_FONT
  let dirty = false
  let editor: CodeEditor | null = null

  const applyFont = (): void => {
    editor?.setFontSize(fontSize)
  }

  const setDirty = (d: boolean): void => {
    dirty = d
    dirtyDot.style.display = d ? '' : 'none'
    saveBtn.classList.toggle('code-save-dirty', d)
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    const ok = await fsService.writeText(path, editor.getValue())
    if (ok) {
      setDirty(false)
      saveBtn.textContent = '✓'
      setTimeout(() => (saveBtn.textContent = '💾'), 1000)
    } else {
      saveBtn.textContent = '⚠'
      saveBtn.title = 'Save failed'
      setTimeout(() => {
        saveBtn.textContent = '💾'
        saveBtn.title = 'Save (⌘S)'
      }, 1500)
    }
  }
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void save()
  })

  const load = async (line?: number): Promise<void> => {
    editor?.destroy()
    editor = null
    body.replaceChildren()
    body.textContent = 'Loading file…'
    const res = await fsService.readText(path)
    body.replaceChildren()
    if (!res.ok) {
      body.textContent = res.error || 'Failed to load file.'
      return
    }
    editor = createCodeEditor({
      parent: body,
      doc: res.text ?? '',
      path,
      themeName,
      fontSize,
      line,
      onSave: () => void save(),
      onChange: () => setDirty(true),
      onCopyRef: copyRef,
      onAddToChat: addToChat
    })
    setDirty(false)
  }

  // Reopen this pane on a different file (single-editor reuse on file clicks /
  // go-to-definition). When already showing the file, just jump to `line`.
  const openFile = (next: string, line?: number): void => {
    if (next === path) {
      if (line) editor?.goToLine(line)
      editor?.focus()
      return
    }
    path = next
    htitle.textContent = breadcrumb(path)
    htitle.title = path
    void load(line)
  }

  codePanes.set(id, {
    id,
    el,
    get path() {
      return path
    },
    themeName,
    isDirty: () => dirty,
    openFile,
    setFont: (delta: number) => {
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, fontSize + delta))
      applyFont()
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      applyFont()
    },
    focus: () => editor?.focus()
  })
  cleanups.set(id, () => {
    editor?.destroy()
    editor = null
  })

  void load(opts.line)
  return id
}

export function destroyCodePane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  codePanes.delete(id)
}
