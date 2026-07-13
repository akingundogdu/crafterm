import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { TAB_ICON, TAB_META, tabOrder } from '../sidebar.store'
import { fillTabButton } from './tab-button-content'

export function tabMeta(): typeof TAB_META {
  return TAB_META
}

// Apply the icon/text/both mode + per-tab hide + per-strip order to both strips.
// Idempotent: the first call also wraps each button's text in an icon + label
// span and wires drag-drop reordering.
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
  // Reorder buttons in the DOM to match the saved order. appendChild on an
  // existing child moves it, so the strip ends up in the desired sequence.
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    for (const id of tabOrder(key)) {
      const btn = document.getElementById(id)
      if (btn) strip.appendChild(btn)
    }
  }
  wireTabReorder(strips)
}

// One-time drag-drop wiring so tabs can be reordered within their own strip.
let tabReorderWired = false
let dragTabId: string | null = null
function wireTabReorder(strips: Record<'left' | 'right', HTMLElement | null>): void {
  if (tabReorderWired) return
  tabReorderWired = true
  const stripOf = (id: string): 'left' | 'right' | null => TAB_META.find((m) => m.id === id)?.strip ?? null
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    for (const t of TAB_META.filter((m) => m.strip === key)) {
      const btn = document.getElementById(t.id)
      if (!btn) continue
      btn.draggable = true
      btn.addEventListener('dragstart', (e) => {
        dragTabId = t.id
        btn.classList.add('dragging')
        e.dataTransfer?.setData('text/plain', t.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      btn.addEventListener('dragend', () => {
        dragTabId = null
        strip.querySelectorAll('.dragging, .drop-target').forEach((el) => {
          el.classList.remove('dragging', 'drop-target', 'drop-after')
        })
      })
      btn.addEventListener('dragover', (e) => {
        if (!dragTabId || dragTabId === t.id || stripOf(dragTabId) !== key) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        const r = btn.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        strip.querySelectorAll('.drop-target').forEach((el) => {
          el.classList.remove('drop-target', 'drop-after')
        })
        btn.classList.add('drop-target')
        btn.classList.toggle('drop-after', after)
      })
      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drop-target', 'drop-after')
      })
      btn.addEventListener('drop', (e) => {
        if (!dragTabId || dragTabId === t.id || stripOf(dragTabId) !== key) return
        e.preventDefault()
        const r = btn.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        const order = tabOrder(key).filter((id) => id !== dragTabId)
        const idx = order.indexOf(t.id)
        order.splice(after ? idx + 1 : idx, 0, dragTabId)
        settings.tabDisplay.order[key] = order
        applyTabDisplay()
        persistence.save()
      })
    }
  }
}
