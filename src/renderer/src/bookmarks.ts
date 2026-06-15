import type { Bookmark } from './types'
import { uid } from './state'
import { bookmarkRepo, reminderRepo } from './services/storage/repositories'
import { openLink } from './commands'
import { makeCloseButton, promptConfirm } from './dialog'
import { snoozeReminder, snoozeOptions } from './reminders'

const viewEl = (): HTMLElement => document.getElementById('notif-bm-view')!

// The soonest still-armed reminder linked to a bookmark, or null. Used to show a
// "reminded" chip on the card.
function bookmarkReminder(bookmarkId: string): { time: number } | null {
  const matches = reminderRepo.query(
    (r) => r.enabled && r.payload?.kind === 'bookmark' && r.payload.bookmarkId === bookmarkId
  )
  if (!matches.length) return null
  return matches.reduce((a, b) => (b.time < a.time ? b : a))
}

function formatReminderTime(t: number): string {
  const d = new Date(t)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`
}

type TypeFilter = 'all' | Bookmark['type']
let typeFilter: TypeFilter = 'all'
let tagFilter = ''
let query = ''

const TYPE_LABEL: Record<Bookmark['type'], string> = {
  link: 'Link',
  text: 'Text',
  code: 'Code',
  snippet: 'Snippet'
}

// ---- add / edit modal ----------------------------------------------------
function showForm(existing?: Bookmark): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal bm-form'
  overlay.appendChild(modal)
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = existing ? 'Edit bookmark' : 'New bookmark'
  modal.appendChild(h)

  const typeField = document.createElement('div')
  typeField.className = 'field'
  typeField.innerHTML = '<label>Type</label>'
  const typeSel = document.createElement('select')
  ;(['link', 'text', 'code', 'snippet'] as Bookmark['type'][]).forEach((t) => {
    const o = document.createElement('option')
    o.value = t
    o.textContent = TYPE_LABEL[t]
    typeSel.appendChild(o)
  })
  typeSel.value = existing?.type ?? 'link'
  typeField.appendChild(typeSel)
  modal.appendChild(typeField)

  const titleField = document.createElement('div')
  titleField.className = 'field'
  titleField.innerHTML = '<label>Title</label>'
  const titleInput = document.createElement('input')
  titleInput.type = 'text'
  titleInput.value = existing?.title ?? ''
  titleInput.placeholder = 'A short name'
  titleField.appendChild(titleInput)
  modal.appendChild(titleField)

  const contentField = document.createElement('div')
  contentField.className = 'field'
  const contentLabel = document.createElement('label')
  contentField.appendChild(contentLabel)
  const contentInput = document.createElement('textarea')
  contentInput.rows = 4
  contentInput.value = existing?.content ?? ''
  contentField.appendChild(contentInput)
  modal.appendChild(contentField)
  const syncContentLabel = (): void => {
    const isLink = typeSel.value === 'link'
    contentLabel.textContent = isLink ? 'URL' : 'Content'
    contentInput.placeholder = isLink ? 'https://…' : 'Paste your text, code, or snippet'
  }
  syncContentLabel()
  typeSel.addEventListener('change', syncContentLabel)

  const tagsField = document.createElement('div')
  tagsField.className = 'field'
  tagsField.innerHTML = '<label>Tags (comma separated)</label>'
  const tagsInput = document.createElement('input')
  tagsInput.type = 'text'
  tagsInput.value = (existing?.tags ?? []).join(', ')
  tagsInput.placeholder = 'reading, infra'
  tagsField.appendChild(tagsInput)
  modal.appendChild(tagsField)

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const ok = document.createElement('button')
  ok.className = 'primary'
  ok.textContent = 'Save'
  ok.addEventListener('click', () => {
    const title = titleInput.value.trim()
    const content = contentInput.value.trim()
    if (!title && !content) return
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (existing) {
      existing.type = typeSel.value as Bookmark['type']
      existing.title = title || content.slice(0, 40)
      existing.content = content
      existing.tags = tags
      bookmarkRepo.upsert(existing)
    } else {
      bookmarkRepo.upsert({
        id: uid('bm'),
        type: typeSel.value as Bookmark['type'],
        title: title || content.slice(0, 40),
        content,
        tags,
        createdAt: Date.now()
      })
    }
    close()
    renderBookmarks()
  })
  actions.append(cancel, ok)
  modal.appendChild(actions)
  document.body.appendChild(overlay)
  titleInput.focus()
}

// ---- remind picker -------------------------------------------------------
function showRemindPicker(bm: Bookmark): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = 'Remind me about this'
  modal.appendChild(h)
  const sub = document.createElement('div')
  sub.className = 'field-hint'
  sub.textContent = bm.title
  modal.appendChild(sub)
  const chips = document.createElement('div')
  chips.className = 'bm-remind-chips'
  for (const opt of snoozeOptions()) {
    const b = document.createElement('button')
    b.className = 'bm-remind-chip'
    b.textContent = opt.label
    b.addEventListener('click', () => {
      snoozeReminder(`Bookmark: ${bm.title}`, opt.at, { kind: 'bookmark', bookmarkId: bm.id })
      close()
    })
    chips.appendChild(b)
  }
  modal.appendChild(chips)
  document.body.appendChild(overlay)
}

// ---- card ----------------------------------------------------------------
function copyContent(bm: Bookmark, btn: HTMLButtonElement): void {
  void navigator.clipboard.writeText(bm.content)
  const prev = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => (btn.textContent = prev), 1100)
}

function card(bm: Bookmark): HTMLElement {
  const el = document.createElement('div')
  el.className = 'bm-card'

  const top = document.createElement('div')
  top.className = 'bm-card-top'
  const badge = document.createElement('span')
  badge.className = 'bm-type ' + bm.type
  badge.textContent = TYPE_LABEL[bm.type]
  const title = document.createElement('span')
  title.className = 'bm-title'
  title.textContent = bm.title
  title.title = bm.title
  top.append(badge, title)
  const rem = bookmarkReminder(bm.id)
  if (rem) {
    const chip = document.createElement('span')
    chip.className = 'bm-remind-badge'
    chip.textContent = `⏰ ${formatReminderTime(rem.time)}`
    chip.title = 'A reminder is set for this bookmark'
    top.appendChild(chip)
  }
  el.appendChild(top)

  const body = document.createElement('div')
  body.className = bm.type === 'code' || bm.type === 'snippet' ? 'bm-body mono' : 'bm-body'
  body.textContent = bm.content
  el.appendChild(body)

  if (bm.tags.length) {
    const tags = document.createElement('div')
    tags.className = 'bm-tags'
    bm.tags.forEach((t) => {
      const tg = document.createElement('button')
      tg.className = 'bm-tag'
      tg.textContent = t
      tg.title = 'Filter by tag'
      tg.addEventListener('click', () => {
        tagFilter = tagFilter === t ? '' : t
        renderBookmarks()
      })
      tags.appendChild(tg)
    })
    el.appendChild(tags)
  }

  const acts = document.createElement('div')
  acts.className = 'bm-actions'
  if (bm.type === 'link') {
    const open = document.createElement('button')
    open.className = 'bm-act primary'
    open.textContent = 'Open'
    open.addEventListener('click', () => void openLink(bm.content))
    acts.appendChild(open)
  } else {
    const copy = document.createElement('button')
    copy.className = 'bm-act primary'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => copyContent(bm, copy))
    acts.appendChild(copy)
  }
  const remind = document.createElement('button')
  remind.className = 'bm-act'
  remind.textContent = 'Remind'
  remind.addEventListener('click', () => showRemindPicker(bm))
  const edit = document.createElement('button')
  edit.className = 'bm-act'
  edit.textContent = 'Edit'
  edit.addEventListener('click', () => showForm(bm))
  const del = document.createElement('button')
  del.className = 'bm-act danger'
  del.textContent = 'Delete'
  del.addEventListener('click', async () => {
    const ok = await promptConfirm({ title: 'Delete bookmark', message: bm.title, confirmText: 'Delete' })
    if (!ok) return
    bookmarkRepo.remove(bm.id)
    renderBookmarks()
  })
  acts.append(remind, edit, del)
  el.appendChild(acts)
  return el
}

export function renderBookmarks(): void {
  const el = viewEl()
  el.replaceChildren()

  const bar = document.createElement('div')
  bar.className = 'bm-toolbar'
  const add = document.createElement('button')
  add.className = 'settings-inline-btn'
  add.textContent = '+ Bookmark'
  add.addEventListener('click', () => showForm())
  const search = document.createElement('input')
  search.className = 'bm-search'
  search.type = 'text'
  search.placeholder = 'Search…'
  search.value = query
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    renderList()
  })
  bar.append(add, search)
  el.appendChild(bar)

  // type filter chips
  const typeBar = document.createElement('div')
  typeBar.className = 'bm-filters'
  ;(['all', 'link', 'text', 'code', 'snippet'] as TypeFilter[]).forEach((t) => {
    const b = document.createElement('button')
    b.className = 'bm-filter' + (t === typeFilter ? ' active' : '')
    b.textContent = t === 'all' ? 'All' : TYPE_LABEL[t]
    b.addEventListener('click', () => {
      typeFilter = t
      renderBookmarks()
    })
    typeBar.appendChild(b)
  })
  el.appendChild(typeBar)

  // active tag filter indicator
  if (tagFilter) {
    const clear = document.createElement('button')
    clear.className = 'bm-tagfilter'
    clear.textContent = `tag: ${tagFilter} ✕`
    clear.title = 'Clear tag filter'
    clear.addEventListener('click', () => {
      tagFilter = ''
      renderBookmarks()
    })
    el.appendChild(clear)
  }

  const list = document.createElement('div')
  list.className = 'bm-list'
  el.appendChild(list)

  const renderList = (): void => {
    list.replaceChildren()
    const items = bookmarkRepo.getAll().filter((b) => {
      if (typeFilter !== 'all' && b.type !== typeFilter) return false
      if (tagFilter && !b.tags.includes(tagFilter)) return false
      if (query) {
        const hay = `${b.title} ${b.content} ${b.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">${
        bookmarkRepo.getAll().length ? 'No matching bookmarks' : 'No bookmarks yet. Add a link, text, code, or snippet.'
      }</div>`
      return
    }
    for (const bm of items) list.appendChild(card(bm))
  }
  renderList()
}
