import { panes, state, paneActions, settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { findTabByPane, panesInLayout } from '@ui/tree/tree'
import { applyTheme } from '../../editor/monaco-setup'
import { terminalService, shellService } from '@services'
import { refPath } from './path-ref'
import type { CodeEditor } from '@ui/editor/code-editor/code-editor'
import type { TargetTerminal } from './code-pane.types'

export const DEFAULT_FONT = 13
export const MIN_FONT = 8
export const MAX_FONT = 28

// Per-pane teardown (destroys the Monaco view on close).
const cleanups = new Map<string, () => void>()

export function registerCodePaneCleanup(id: string, fn: () => void): void {
  cleanups.set(id, fn)
}

export function runCodePaneCleanup(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
}

// The terminal to target for "Add to chat": prefer a Claude session in the same
// tab as this code pane, else the tab's first terminal, else the active terminal.
export function targetTerminalFor(codePaneId: string): TargetTerminal | null {
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

// Build the `@<relpath>:<start>:<end>` mention for the current selection
// (resolved against the target terminal's cwd), or null when nothing's selected.
function buildMention(editor: CodeEditor | null, path: string, id: string): string | null {
  if (!editor) return null
  const sel = editor.getSelection()
  if (!sel) return null
  const tgt = targetTerminalFor(id)
  const rel = refPath(path, tgt?.cwd ?? null)
  // Single line → `@path:14`; range → `@path:14-15`.
  const lines = sel.startLine === sel.endLine ? `${sel.startLine}` : `${sel.startLine}-${sel.endLine}`
  return `@${rel}:${lines}`
}

// Clamps a font-size delta into the allowed range.
export function clampFont(current: number, delta: number): number {
  return Math.max(MIN_FONT, Math.min(MAX_FONT, current + delta))
}

// ---- Handlers (bound by the view) -----------------------------------------

export function stopMousedown(e: Event): void {
  e.stopPropagation()
}

// Global Monaco theme picker change: persists + applies the theme to all editors.
export function makeThemeChange(themeSel: HTMLSelectElement): () => void {
  return () => {
    settings.editorTheme = themeSel.value
    void applyTheme(themeSel.value)
    persistence.save()
  }
}

export function makeCopyRef(
  getEditor: () => CodeEditor | null,
  getPath: () => string,
  id: string
): () => void {
  return () => {
    const m = buildMention(getEditor(), getPath(), id)
    if (m) void navigator.clipboard.writeText(m)
  }
}

export function makeAddToChat(
  getEditor: () => CodeEditor | null,
  getPath: () => string,
  id: string
): () => void {
  return () => {
    const m = buildMention(getEditor(), getPath(), id)
    const tgt = targetTerminalFor(id)
    if (!m || !tgt) return
    terminalService.input(tgt.id, m + ' ')
    paneActions.select(tgt.id)
    panes.get(tgt.id)?.term.focus()
  }
}

export function makeCopyPathClick(getPath: () => string): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(getPath())
    const btn = e.currentTarget as HTMLButtonElement
    const prev = btn.textContent
    btn.textContent = '✓'
    setTimeout(() => (btn.textContent = prev), 1000)
  }
}

export function makeRevealClick(getPath: () => string): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    shellService.revealPath(getPath())
  }
}

export function makeReloadClick(reload: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    reload()
  }
}

export function makeCloseClick(id: string): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.close(id)
  }
}

export function makeSaveClick(save: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    save()
  }
}

export function makeSelectPane(id: string): () => void {
  return () => paneActions.select(id)
}
