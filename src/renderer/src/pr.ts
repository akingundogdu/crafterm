import type { PullRequest } from '../../preload/api'
import { state, panes, pushNotification } from './state'
import { openLink, runInSplit, openPrDiff } from './commands'
import { makeCloseButton, promptConfirm } from './dialog'

const viewEl = (): HTMLElement => document.getElementById('notif-pr-view')!

// Repo to query: the active terminal's cwd.
function activeCwd(): string {
  const id = state.activePaneId
  return (id ? panes.get(id)?.cwd : null) ?? ''
}

let lastCwd = ''
let lastChecks = new Map<number, string>() // pr number -> checks.state, for change alerts
let pollTimer: number | null = null
let tabVisible = false

// ---- detail modal --------------------------------------------------------
function showTextModal(title: string, text: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal docker-text-modal'
  overlay.appendChild(modal)
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = title
  modal.appendChild(h)
  const pre = document.createElement('pre')
  pre.className = 'docker-pre'
  pre.textContent = text || '(empty)'
  modal.appendChild(pre)
  document.body.appendChild(overlay)
}

function checksBadge(pr: PullRequest): HTMLElement {
  const c = pr.checks
  const b = document.createElement('span')
  const cls = c.state === 'success' ? 'ok' : c.state === 'failure' ? 'bad' : c.state === 'pending' ? 'wait' : 'none'
  b.className = 'pr-checks ' + cls
  if (c.state === 'none') b.textContent = 'no checks'
  else if (c.state === 'success') b.textContent = `✓ ${c.pass}/${c.total}`
  else if (c.state === 'failure') b.textContent = `✕ ${c.fail} failed`
  else b.textContent = `● ${c.pending} running`
  b.title = `${c.pass} passed · ${c.fail} failed · ${c.pending} pending`
  return b
}

function reviewBadge(pr: PullRequest): HTMLElement | null {
  if (!pr.reviewDecision) return null
  const b = document.createElement('span')
  const map: Record<string, { cls: string; text: string }> = {
    APPROVED: { cls: 'ok', text: 'approved' },
    CHANGES_REQUESTED: { cls: 'bad', text: 'changes' },
    REVIEW_REQUIRED: { cls: 'wait', text: 'review needed' }
  }
  const m = map[pr.reviewDecision] ?? { cls: 'none', text: pr.reviewDecision.toLowerCase() }
  b.className = 'pr-tag ' + m.cls
  b.textContent = m.text
  return b
}

function card(pr: PullRequest, cwd: string, isCurrent: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card' + (isCurrent ? ' current' : '')

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const num = document.createElement('span')
  num.className = 'pr-num'
  num.textContent = '#' + pr.number
  const title = document.createElement('span')
  title.className = 'pr-title'
  title.textContent = pr.title
  title.title = pr.title
  top.append(num, title)
  if (pr.isDraft) {
    const d = document.createElement('span')
    d.className = 'pr-tag none'
    d.textContent = 'draft'
    top.appendChild(d)
  }
  el.appendChild(top)

  const branch = document.createElement('div')
  branch.className = 'pr-branch'
  branch.textContent = `${pr.headRefName} → ${pr.baseRefName}`
  el.appendChild(branch)

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(checksBadge(pr))
  if (pr.mergeable === 'CONFLICTING') {
    const conflict = document.createElement('span')
    conflict.className = 'pr-tag bad'
    conflict.textContent = 'conflicts'
    tags.appendChild(conflict)
  } else if (pr.mergeable === 'MERGEABLE') {
    const ok = document.createElement('span')
    ok.className = 'pr-tag ok'
    ok.textContent = 'mergeable'
    tags.appendChild(ok)
  }
  const rev = reviewBadge(pr)
  if (rev) tags.appendChild(rev)
  if (pr.comments > 0) {
    const cm = document.createElement('span')
    cm.className = 'pr-tag none'
    cm.textContent = `${pr.comments} 💬`
    tags.appendChild(cm)
  }
  el.appendChild(tags)

  const acts = document.createElement('div')
  acts.className = 'pr-actions'
  const open = document.createElement('button')
  open.className = 'pr-act primary'
  open.textContent = 'Review'
  open.title = 'Open the PR in an in-app browser pane'
  open.addEventListener('click', () => void openLink(pr.url))
  const diff = document.createElement('button')
  diff.className = 'pr-act'
  diff.textContent = 'Diff'
  diff.title = 'Open the diff in an in-app pane; select lines to send to a terminal'
  diff.addEventListener('click', () => openPrDiff(cwd, pr.number, `PR #${pr.number}`))
  const detail = document.createElement('button')
  detail.className = 'pr-act'
  detail.textContent = 'Details'
  detail.addEventListener('click', async () => showTextModal(`PR #${pr.number}`, await window.crafterm.prView(cwd, pr.number)))
  const merge = document.createElement('button')
  merge.className = 'pr-act merge'
  merge.textContent = 'Merge'
  merge.disabled = pr.mergeable === 'CONFLICTING' || pr.isDraft
  merge.addEventListener('click', () => void doMerge(pr, cwd))
  acts.append(open, diff, detail, merge)
  el.appendChild(acts)
  return el
}

async function doMerge(pr: PullRequest, cwd: string): Promise<void> {
  const ok = await promptConfirm({
    title: `Merge PR #${pr.number}`,
    message: `Squash-merge "${pr.title}" into ${pr.baseRefName} and delete the branch?`,
    confirmText: 'Squash & merge'
  })
  if (!ok) return
  const r = await window.crafterm.prMerge(cwd, pr.number, 'squash')
  if (!r.ok) showTextModal('Merge failed', r.error || 'unknown error')
  else pushNotification('', `PR #${pr.number} merged`, 'pr', pr.title)
  void renderPr()
}

export async function renderPr(): Promise<void> {
  const el = viewEl()
  const cwd = activeCwd()
  lastCwd = cwd

  // toolbar (always present so the user can refresh / create)
  el.replaceChildren()
  const bar = document.createElement('div')
  bar.className = 'pr-toolbar'
  const create = document.createElement('button')
  create.className = 'settings-inline-btn'
  create.textContent = '+ Create PR'
  create.title = 'Run `gh pr create --web` beside the active pane'
  create.addEventListener('click', () => void runInSplit('gh pr create --web'))
  const refresh = document.createElement('button')
  refresh.className = 'settings-inline-btn'
  refresh.textContent = '⟳'
  refresh.title = 'Refresh'
  refresh.addEventListener('click', () => void renderPr())
  bar.append(create, refresh)
  el.appendChild(bar)

  const listEl = document.createElement('div')
  listEl.className = 'pr-list'
  el.appendChild(listEl)
  listEl.textContent = 'Loading…'

  if (!cwd) {
    listEl.innerHTML = '<div class="notif-empty">Open a terminal in a GitHub repo to see its PRs.</div>'
    return
  }
  const avail = await window.crafterm.prAvailable(cwd)
  if (!avail.ok) {
    listEl.replaceChildren()
    const e = document.createElement('div')
    e.className = 'notif-empty'
    e.textContent = avail.error || 'GitHub CLI unavailable.'
    listEl.appendChild(e)
    return
  }

  const res = await window.crafterm.prList(cwd)
  listEl.replaceChildren()
  if (!res.ok) {
    listEl.innerHTML = `<div class="notif-empty">${res.error || 'Failed to load PRs.'}</div>`
    return
  }
  const repo = document.createElement('div')
  repo.className = 'pr-repo'
  repo.textContent = avail.repo ?? ''
  listEl.appendChild(repo)
  if (!res.prs.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No open pull requests.</div>')
    return
  }
  const branch = (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
  for (const pr of res.prs) listEl.appendChild(card(pr, cwd, !!branch && pr.headRefName === branch))
  noteChecks(res.prs)
}

// Alert when a PR's CI transitions out of "pending" (so async work surfaces).
function noteChecks(prs: PullRequest[]): void {
  const next = new Map<number, string>()
  for (const pr of prs) {
    next.set(pr.number, pr.checks.state)
    const prev = lastChecks.get(pr.number)
    if (prev === 'pending' && (pr.checks.state === 'success' || pr.checks.state === 'failure')) {
      pushNotification(
        '',
        `PR #${pr.number} checks ${pr.checks.state === 'success' ? 'passed' : 'failed'}`,
        'pr',
        pr.title
      )
    }
  }
  lastChecks = next
}

// Background poll: only while the PR tab is visible. Picks up CI completion even
// when the user is focused elsewhere (the whole point of the notification).
export function prTabVisible(visible: boolean): void {
  tabVisible = visible
  if (visible) {
    void renderPr()
    if (pollTimer === null) pollTimer = window.setInterval(() => void poll(), 300_000)
  } else if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

async function poll(): Promise<void> {
  if (!tabVisible) return
  const cwd = activeCwd()
  if (cwd !== lastCwd) {
    void renderPr() // repo changed under us — full re-render
    return
  }
  if (!cwd) return
  const avail = await window.crafterm.prAvailable(cwd)
  if (!avail.ok) return
  const res = await window.crafterm.prList(cwd)
  if (res.ok) {
    noteChecks(res.prs)
    if (tabVisible) void renderPr()
  }
}
