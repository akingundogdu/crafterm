import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { fillTabButton } from './components/tab-button-content'

// Settings-local copy of the shell's live-apply leaves used by the Sidebar + Tabs
// panels (§2.7 self-contained; vanishes at teardown when the sidebar shell
// migrates). These manipulate the existing shell DOM (#app / #sidebar / the tab
// strips) and read settings via the spine bridge, so they stay in lock-step with
// the live shell. Drag-reorder wiring is intentionally NOT duplicated here: the
// shell wires it once at boot (before settings can open), and — exactly like the
// legacy settings-driven re-apply — these calls only refresh the idempotent
// icon/hide/order state, never re-bind the drag handlers.

export const TAB_ICON: Record<string, string> = {
  'tab-terminal':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4l3 3-3 3M8.5 11H13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'tab-notebook':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.5H12v11H4.5zM4.5 2.5a1.5 1.5 0 0 0 0 11M7 5.5h3M7 8h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'tab-database':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  'tab-docker':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 9h12v1.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 10.5z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6h1.6v2H3.5zM6.2 6h1.6v2H6.2zM8.9 6h1.6v2H8.9zM6.2 3.4h1.6v2H6.2z" fill="currentColor"/></svg>',
  'tab-accounts':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.4 13c0-2.5 2-4.2 4.6-4.2s4.6 1.7 4.6 4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-notifs':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5a3.4 3.4 0 0 0-3.4 3.4V8L3.2 10h9.6L11.4 8V5.9A3.4 3.4 0 0 0 8 2.5zM6.6 12a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  'notif-tab-reminders':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8.5" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.8V8.5l2 1.4M5.5 2.5L3 4.3M10.5 2.5L13 4.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-files':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 4.2c0-.6.4-1 1-1h3.1l1.2 1.4H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  'notif-tab-time':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.5h7M4.5 13.5h7M5.3 2.5c0 2.8 5.4 3.2 5.4 5.5s-5.4 2.7-5.4 5.5M10.7 2.5c0 2.8-5.4 3.2-5.4 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-pr':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="4.5" cy="4" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.7v4.6M11.5 10.3V7.5a2 2 0 0 0-2-2H7.5l1.4-1.4M8.9 5.5L7.5 4.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'notif-tab-bm':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 2.7h6v10.6l-3-2.3-3 2.3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
}

// Every tab in the two strips, with the shortcut shown in its hover tooltip.
export const TAB_META: { id: string; strip: 'left' | 'right'; label: string; shortcut?: string }[] = [
  { id: 'tab-terminal', strip: 'left', label: UITexts.Sidebar.tabs.terminal, shortcut: '⌘1' },
  { id: 'tab-notebook', strip: 'left', label: UITexts.Sidebar.tabs.notebook, shortcut: '⌘2' },
  { id: 'tab-database', strip: 'left', label: UITexts.Sidebar.tabs.database, shortcut: '⌘3' },
  { id: 'tab-docker', strip: 'left', label: UITexts.Sidebar.tabs.docker },
  { id: 'tab-accounts', strip: 'left', label: UITexts.Sidebar.tabs.accounts },
  { id: 'notif-tab-notifs', strip: 'right', label: UITexts.Sidebar.tabs.alerts },
  { id: 'notif-tab-reminders', strip: 'right', label: UITexts.Sidebar.tabs.reminders },
  { id: 'notif-tab-files', strip: 'right', label: UITexts.Sidebar.tabs.files },
  { id: 'notif-tab-time', strip: 'right', label: UITexts.Sidebar.tabs.time },
  { id: 'notif-tab-pr', strip: 'right', label: UITexts.Sidebar.tabs.pr },
  { id: 'notif-tab-bm', strip: 'right', label: UITexts.Sidebar.tabs.bookmarks }
]

export function tabMeta(): typeof TAB_META {
  return TAB_META
}

// Effective tab id order for a strip: saved order (filtered to ids that still
// exist) followed by any TAB_META ids missing from it, so new tabs always show.
export function tabOrder(strip: 'left' | 'right'): string[] {
  const ids = TAB_META.filter((m) => m.strip === strip).map((m) => m.id)
  const saved = settings.tabDisplay.order[strip].filter((id) => ids.includes(id))
  return [...saved, ...ids.filter((id) => !saved.includes(id))]
}

// Apply the icon/text/both mode + per-tab hide + per-strip order to both strips.
// Idempotent: the first call wraps each button's text in an icon + label span.
// (Drag wiring is owned by the shell boot — see file header.)
export function applyTabDisplay(): void {
  const { mode, hidden } = settings.tabDisplay
  const strips: Record<'left' | 'right', HTMLElement | null> = {
    left: document.getElementById('sidebar-tabs'),
    right: document.querySelector('.notif-tabs')
  }
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    strip.classList.remove('tabs-mode-icon', 'tabs-mode-text', 'tabs-mode-both')
    strip.classList.add('tabs-mode-' + mode)
  }
  for (const t of TAB_META) {
    const btn = document.getElementById(t.id)
    if (!btn) continue
    if (!btn.querySelector('.tab-label')) {
      const label = (btn.textContent || t.label).trim()
      fillTabButton(btn, TAB_ICON[t.id] ?? '', label)
    }
    btn.title = t.shortcut ? `${t.label} · ${t.shortcut}` : t.label
    btn.style.display = hidden[t.strip].includes(t.id) ? 'none' : ''
  }
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    for (const id of tabOrder(key)) {
      const btn = document.getElementById(id)
      if (btn) strip.appendChild(btn)
    }
  }
}

function applySidebarSize(): void {
  const sidebarEl = document.getElementById('sidebar')
  if (!sidebarEl) return
  if (settings.sidebar.orientation === 'left') {
    sidebarEl.style.width = settings.sidebar.size + 'px'
    sidebarEl.style.height = ''
  } else {
    sidebarEl.style.height = settings.sidebar.size + 'px'
    sidebarEl.style.width = ''
  }
}

export function applyOrientation(): void {
  const appEl = document.getElementById('app')
  if (!appEl) return
  appEl.classList.toggle('orient-top', settings.sidebar.orientation === 'top')
  appEl.classList.toggle('orient-left', settings.sidebar.orientation === 'left')
  applySidebarSize()
}

export function applySidebarFont(): void {
  const sidebarEl = document.getElementById('sidebar')
  if (!sidebarEl) return
  sidebarEl.style.fontSize = (settings.sidebar.fontSize ?? 13) + 'px'
}
