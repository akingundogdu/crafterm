import { diffPanes, panes, state, paneActions, uid, pushNotification } from './state'
import { setupPaneDnd } from './pane'

// A read-only PR diff pane. Shows one file at a time (prev/next + searchable file
// list). Click / click-drag / shift-click selects a contiguous line range; a
// floating "+" on the selection pastes a `path:line[-line]` reference into a
// terminal so the user can ask Claude about that exact spot. Transient — never
// persisted.

type RowKind = 'add' | 'del' | 'ctx' | 'hunk'

interface ParsedRow {
  kind: RowKind
  text: string
  line: number | null // new-file line number (null when not selectable)
}

interface FileDiff {
  path: string
  rows: ParsedRow[]
}

const DEFAULT_FONT = 12
const MIN_FONT = 8
const MAX_FONT = 28

// Per-pane teardown for document-level listeners (removed on close).
const cleanups = new Map<string, () => void>()

const SEARCH_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M11.7 10.3a5 5 0 1 0-1.4 1.4l3 3 1.4-1.4-3-3zM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>'

const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2v2.2L7.6 12H14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM3.5 6h9v1.2h-9V6zm0 2.6h6V9.8h-6V8.6z"/></svg>'

// Split a unified diff into per-file sections, tracking the new-file line number
// per hunk. The file header comes from `diff --git a/X b/Y` so deleted files
// (whose `+++` is /dev/null) still show up — just not as selectable rows.
function parseDiff(patch: string): FileDiff[] {
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
    if (raw.startsWith('+++ ') || raw.startsWith('--- ') || raw.startsWith('index ') ||
        raw.startsWith('new file') || raw.startsWith('deleted file') ||
        raw.startsWith('similarity ') || raw.startsWith('rename ') ||
        raw.startsWith('old mode') || raw.startsWith('new mode')) {
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

// Resolve the terminal to paste into: the captured target if it still exists,
// else the active pane when it is a terminal.
function resolveTarget(targetPaneId: string | null): string | null {
  if (targetPaneId && panes.has(targetPaneId)) return targetPaneId
  if (state.activePaneId && panes.has(state.activePaneId)) return state.activePaneId
  return null
}

export function createDiffPane(opts: {
  cwd: string
  prNumber: number
  title: string
  targetPaneId: string | null
}): string {
  const id = uid('df')

  const el = document.createElement('div')
  el.className = 'pane-box diff-pane'
  el.dataset.paneId = id

  // ---- header (tall): prev · search | path · counter | reload · next · close ----
  const header = document.createElement('div')
  header.className = 'pane-header diff-header'
  const prev = document.createElement('button')
  prev.className = 'diff-nav'
  prev.textContent = '‹'
  prev.title = 'Previous file'
  const searchBtn = document.createElement('button')
  searchBtn.className = 'diff-hbtn'
  searchBtn.innerHTML = SEARCH_SVG
  searchBtn.title = 'Find a file in this diff'
  const center = document.createElement('div')
  center.className = 'diff-hcenter'
  const htitle = document.createElement('span')
  htitle.className = 'diff-path'
  const counter = document.createElement('span')
  counter.className = 'diff-counter'
  center.append(htitle, counter)
  const reload = document.createElement('button')
  reload.className = 'diff-hbtn'
  reload.textContent = '⟳'
  reload.title = 'Reload diff'
  const next = document.createElement('button')
  next.className = 'diff-nav'
  next.textContent = '›'
  next.title = 'Next file'
  const close = document.createElement('button')
  close.className = 'diff-hbtn diff-hclose'
  close.textContent = '×'
  close.title = 'Close'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(prev, searchBtn, center, reload, next, close)

  // ---- search dropdown (file list + filter) ----
  const search = document.createElement('div')
  search.className = 'diff-search'
  search.style.display = 'none'
  const searchInput = document.createElement('input')
  searchInput.className = 'diff-search-input'
  searchInput.placeholder = 'Filter files…'
  searchInput.spellcheck = false
  const searchList = document.createElement('div')
  searchList.className = 'diff-search-list'
  search.append(searchInput, searchList)

  const body = document.createElement('div')
  body.className = 'diff-body'

  // Floating action cluster anchored to the first selected row (left side).
  const actions = document.createElement('div')
  actions.className = 'diff-actions'
  actions.style.display = 'none'
  const plus = document.createElement('button')
  plus.className = 'diff-act diff-act-term'
  plus.textContent = '+'
  plus.title = 'Send this reference to the terminal'
  const commentBtn = document.createElement('button')
  commentBtn.className = 'diff-act diff-act-comment'
  commentBtn.innerHTML = COMMENT_SVG
  commentBtn.title = 'Comment on these lines in the GitHub PR'
  actions.append(plus, commentBtn)

  el.append(header, search, body)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- state ----
  let files: FileDiff[] = []
  let activeIdx = 0
  let fontSize = DEFAULT_FONT
  const rows: HTMLElement[] = [] // selectable rows of the active file, in order
  let anchor = -1
  let selStart = -1
  let selEnd = -1
  let dragging = false

  const applyFont = (): void => {
    body.style.fontSize = fontSize + 'px'
  }

  const currentRef = (): string | null => {
    if (selStart < 0 || activeIdx >= files.length) return null
    const file = files[activeIdx].path
    const a = Number(rows[selStart].dataset.line)
    const b = Number(rows[selEnd].dataset.line)
    return a === b ? `${file}:${a}` : `${file}:${a}-${b}`
  }

  // New-file line numbers of the current selection (for the PR comment range).
  const currentRange = (): { path: string; a: number; b: number } | null => {
    if (selStart < 0 || activeIdx >= files.length) return null
    return {
      path: files[activeIdx].path,
      a: Number(rows[selStart].dataset.line),
      b: Number(rows[selEnd].dataset.line)
    }
  }

  const send = (): void => {
    const ref = currentRef()
    if (!ref) return
    const target = resolveTarget(opts.targetPaneId)
    if (!target) {
      plus.classList.add('warn')
      plus.title = 'Open a terminal first'
      return
    }
    window.crafterm.input(target, ref + ' ')
    paneActions.select(target)
    panes.get(target)?.term.focus()
  }
  plus.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  plus.addEventListener('click', (e) => {
    e.stopPropagation()
    send()
  })

  // ---- inline PR comment popover ----
  let pop: HTMLElement | null = null
  const closePop = (): void => {
    if (!pop) return
    pop.remove()
    pop = null
    document.removeEventListener('mousedown', onPopOutside, true)
  }
  function onPopOutside(e: MouseEvent): void {
    if (pop && !pop.contains(e.target as Node)) closePop()
  }
  const openCommentPop = (): void => {
    closePop()
    const range = currentRange()
    if (!range) return
    pop = document.createElement('div')
    pop.className = 'diff-comment-pop'
    const label = document.createElement('div')
    label.className = 'diff-comment-label'
    const loc = range.a === range.b ? `line ${range.a}` : `lines ${range.a}-${range.b}`
    label.textContent = `Comment on ${range.path} · ${loc}`
    const ta = document.createElement('textarea')
    ta.className = 'diff-comment-input'
    ta.placeholder = 'Write a review comment…  (⌘↵ to send, Esc to cancel)'
    ta.spellcheck = false
    const footer = document.createElement('div')
    footer.className = 'diff-comment-footer'
    const err = document.createElement('span')
    err.className = 'diff-comment-err'
    const sendBtn = document.createElement('button')
    sendBtn.className = 'diff-comment-send'
    sendBtn.textContent = 'Comment'
    footer.append(err, sendBtn)
    pop.append(label, ta, footer)

    const submit = async (): Promise<void> => {
      const text = ta.value.trim()
      if (!text) {
        ta.focus()
        return
      }
      sendBtn.disabled = true
      sendBtn.textContent = 'Sending…'
      err.textContent = ''
      const r = await window.crafterm.prComment(
        opts.cwd,
        opts.prNumber,
        range.path,
        range.a,
        range.b,
        text
      )
      if (r.ok) {
        closePop()
        clearSelection()
        pushNotification('', `Commented on ${range.path}:${range.a}`, 'pr', opts.title)
      } else {
        sendBtn.disabled = false
        sendBtn.textContent = 'Comment'
        err.textContent = r.error || 'Failed to post comment.'
      }
    }
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void submit()
    })
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closePop()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void submit()
      }
    })
    pop.addEventListener('mousedown', (e) => e.stopPropagation())

    document.body.appendChild(pop)
    const r = commentBtn.getBoundingClientRect()
    const top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8)
    const left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)
    pop.style.top = Math.max(8, top) + 'px'
    pop.style.left = Math.max(8, left) + 'px'
    ta.focus()
    document.addEventListener('mousedown', onPopOutside, true)
  }
  commentBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  commentBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    openCommentPop()
  })

  // Anchor the action cluster to the first selected row (rides scroll because
  // it's a child of that row).
  const positionPlus = (): void => {
    if (selStart < 0) {
      actions.style.display = 'none'
      if (actions.parentElement) actions.remove()
      closePop()
      return
    }
    rows[selStart].appendChild(actions)
    plus.classList.remove('warn')
    plus.title = 'Send this reference to the terminal'
    actions.style.display = ''
  }

  const refreshSelection = (): void => {
    rows.forEach((r, i) => r.classList.toggle('selected', i >= selStart && i <= selEnd))
    positionPlus()
  }

  const setSelection = (a: number, b: number): void => {
    selStart = Math.min(a, b)
    selEnd = Math.max(a, b)
    refreshSelection()
  }

  const clearSelection = (): void => {
    anchor = selStart = selEnd = -1
    refreshSelection()
  }

  // ---- render one file ----
  const renderFile = (): void => {
    body.replaceChildren()
    rows.length = 0
    clearSelection()
    if (!files.length) {
      body.textContent = 'Empty diff.'
      return
    }
    const fd = files[activeIdx]
    for (const r of fd.rows) {
      const row = document.createElement('div')
      row.className = 'diff-row ' + r.kind
      const gutter = document.createElement('span')
      gutter.className = 'diff-gutter'
      gutter.textContent = r.line != null ? String(r.line) : ''
      const text = document.createElement('span')
      text.className = 'diff-text'
      text.textContent = r.text
      row.append(gutter, text)
      if (r.line != null) {
        row.dataset.line = String(r.line)
        const idx = rows.length
        rows.push(row)
        row.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          paneActions.select(id)
          if (e.shiftKey && anchor >= 0) {
            setSelection(anchor, idx)
          } else {
            anchor = idx
            dragging = true
            setSelection(idx, idx)
          }
        })
        row.addEventListener('mouseenter', () => {
          if (dragging && anchor >= 0) setSelection(anchor, idx)
        })
      }
      body.appendChild(row)
    }
  }

  const showFile = (idx: number): void => {
    activeIdx = Math.max(0, Math.min(files.length - 1, idx))
    htitle.textContent = files.length ? files[activeIdx].path : ''
    htitle.title = htitle.textContent
    counter.textContent = files.length ? `${activeIdx + 1}/${files.length}` : ''
    prev.disabled = activeIdx <= 0
    next.disabled = activeIdx >= files.length - 1
    renderFile()
    body.scrollTop = 0
  }

  // drag ends anywhere
  const onUp = (): void => {
    dragging = false
  }
  document.addEventListener('mouseup', onUp)

  // Cmd+←/→ steps prev/next while this diff pane is the active one. Capture phase
  // so it wins before xterm or the global grid; the comment popover keeps its own
  // typing focus, so skip while it's open.
  const onKey = (e: KeyboardEvent): void => {
    if (!e.metaKey || e.altKey || e.shiftKey || pop) return
    if (state.activePaneId !== id) return
    if (e.key === 'ArrowLeft') showFile(activeIdx - 1)
    else if (e.key === 'ArrowRight') showFile(activeIdx + 1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', onKey, true)
  cleanups.set(id, () => {
    document.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onKey, true)
    closePop()
  })

  prev.addEventListener('click', (e) => {
    e.stopPropagation()
    showFile(activeIdx - 1)
  })
  next.addEventListener('click', (e) => {
    e.stopPropagation()
    showFile(activeIdx + 1)
  })

  // ---- search dropdown wiring ----
  const renderSearchList = (): void => {
    const q = searchInput.value.trim().toLowerCase()
    searchList.replaceChildren()
    const matches = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => !q || f.path.toLowerCase().includes(q))
    for (const { f, i } of matches.slice(0, 200)) {
      const item = document.createElement('div')
      item.className = 'diff-search-item' + (i === activeIdx ? ' active' : '')
      item.textContent = f.path
      item.title = f.path
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        closeSearch()
        showFile(i)
      })
      searchList.appendChild(item)
    }
    if (!matches.length) {
      const empty = document.createElement('div')
      empty.className = 'diff-search-empty'
      empty.textContent = 'No matching files'
      searchList.appendChild(empty)
    }
  }
  const openSearch = (): void => {
    search.style.display = ''
    searchInput.value = ''
    renderSearchList()
    searchInput.focus()
  }
  function closeSearch(): void {
    search.style.display = 'none'
  }
  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (search.style.display === 'none') openSearch()
    else closeSearch()
  })
  searchInput.addEventListener('input', renderSearchList)
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch()
      return
    }
    if (e.key === 'Enter') {
      const first = files.findIndex(
        (f) => !searchInput.value.trim() || f.path.toLowerCase().includes(searchInput.value.trim().toLowerCase())
      )
      if (first >= 0) {
        closeSearch()
        showFile(first)
      }
    }
  })

  // ---- load ----
  const load = async (): Promise<void> => {
    body.textContent = 'Loading diff…'
    const res = await window.crafterm.prDiff(opts.cwd, opts.prNumber)
    if (!res.ok) {
      body.textContent = res.error || 'Failed to load diff.'
      return
    }
    const patch = (res.patch ?? '').trim()
    files = patch ? parseDiff(patch) : []
    applyFont()
    showFile(0)
  }

  reload.addEventListener('click', (e) => {
    e.stopPropagation()
    void load()
  })

  diffPanes.set(id, {
    id,
    el,
    cwd: opts.cwd,
    prNumber: opts.prNumber,
    targetPaneId: opts.targetPaneId,
    setFont: (delta: number) => {
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, fontSize + delta))
      applyFont()
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      applyFont()
    }
  })

  void load()
  return id
}

export function destroyDiffPane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  diffPanes.delete(id)
}
