import type { PullRequest, WorkflowRun, DeploymentStatus } from '../../preload/api'
import { state, panes, settings, pushNotification } from './state'
import { persistence } from './services/storage/persistence.service'
import { openLink, runInSplit, openPrDiff } from './commands'
import { makeCloseButton, promptConfirm } from './dialog'
import { prService } from './services/ipc'

const viewEl = (): HTMLElement => document.getElementById('notif-pr-view')!

const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 2.75A.75.75 0 0 1 2.25 2h11.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H7.06l-2.78 2.62A.5.5 0 0 1 3.5 14.2V12H2.25a.75.75 0 0 1-.75-.75v-8.5Z"/></svg>'

// Repo to query: the active terminal's cwd.
function activeCwd(): string {
  const id = state.activePaneId
  return (id ? panes.get(id)?.cwd : null) ?? ''
}

let lastCwd = ''
let lastChecks = new Map<string, string>() // "repo#number" -> checks.state, for change alerts
let lastRunStatus = new Map<number, string>() // run id -> status, for completion alerts
let lastDeployState = new Map<number, string>() // deployment id -> state, for completion alerts
let pollTimer: number | null = null
let tabVisible = false
let subTab: 'prs' | 'deploys' = 'prs'
let prScope: 'current' | 'all' = 'current'
let deployScope: 'current' | 'all' = 'current'
let busy = false // something in-flight (pending checks / running deploys) → poll faster

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

// A status pill carrying a leading colored dot, for a consistent badge language.
function statusTag(cls: string, text: string, opts?: { pulse?: boolean; title?: string }): HTMLElement {
  const b = document.createElement('span')
  b.className = 'pr-tag ' + cls + (opts?.pulse ? ' pulse' : '')
  const dot = document.createElement('span')
  dot.className = 'pr-dot'
  b.append(dot, document.createTextNode(text))
  if (opts?.title) b.title = opts.title
  return b
}

// Overall PR health → drives the left status rail color.
function overallState(pr: PullRequest): 'ready' | 'running' | 'blocked' | 'neutral' {
  if (pr.isDraft) return 'neutral'
  if (pr.mergeable === 'CONFLICTING' || pr.reviewDecision === 'CHANGES_REQUESTED' || pr.checks.state === 'failure')
    return 'blocked'
  if (pr.checks.state === 'pending') return 'running'
  if (pr.reviewDecision === 'APPROVED' && pr.mergeable === 'MERGEABLE') return 'ready'
  return 'neutral'
}

function checksBadge(pr: PullRequest): HTMLElement {
  const c = pr.checks
  const cls = c.state === 'success' ? 'ok' : c.state === 'failure' ? 'bad' : c.state === 'pending' ? 'wait' : 'none'
  let text = 'no checks'
  if (c.state === 'success') text = `${c.pass}/${c.total} checks`
  else if (c.state === 'failure') text = `${c.fail} failed`
  else if (c.state === 'pending') text = `${c.pending} running`
  return statusTag(cls, text, {
    pulse: c.state === 'pending',
    title: `${c.pass} passed · ${c.fail} failed · ${c.pending} pending`
  })
}

function reviewBadge(pr: PullRequest): HTMLElement | null {
  if (!pr.reviewDecision) return null
  const map: Record<string, { cls: string; text: string }> = {
    APPROVED: { cls: 'ok', text: 'approved' },
    CHANGES_REQUESTED: { cls: 'bad', text: 'changes' },
    REVIEW_REQUIRED: { cls: 'wait', text: 'review needed' }
  }
  const m = map[pr.reviewDecision] ?? { cls: 'none', text: pr.reviewDecision.toLowerCase() }
  return statusTag(m.cls, m.text)
}

function card(pr: PullRequest, cwd: string, isCurrent: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card state-' + overallState(pr) + (isCurrent ? ' current' : '')

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
  const head = document.createElement('span')
  head.className = 'pr-ref head'
  head.textContent = pr.headRefName
  const arrow = document.createElement('span')
  arrow.className = 'pr-arrow'
  arrow.textContent = '→'
  const base = document.createElement('span')
  base.className = 'pr-ref base'
  base.textContent = pr.baseRefName
  branch.append(head, arrow, base)
  branch.title = `${pr.headRefName} → ${pr.baseRefName}`
  el.appendChild(branch)

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(checksBadge(pr))
  if (pr.mergeable === 'CONFLICTING') tags.appendChild(statusTag('bad', 'conflicts'))
  else if (pr.mergeable === 'MERGEABLE') tags.appendChild(statusTag('ok', 'mergeable'))
  const rev = reviewBadge(pr)
  if (rev) tags.appendChild(rev)
  if (pr.comments > 0) {
    const cm = document.createElement('span')
    cm.className = 'pr-tag none comment'
    cm.innerHTML = COMMENT_SVG
    cm.appendChild(document.createTextNode(String(pr.comments)))
    cm.title = `${pr.comments} comment${pr.comments === 1 ? '' : 's'}`
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
  const merge = document.createElement('button')
  merge.className = 'pr-act merge'
  merge.textContent = 'Merge'
  merge.disabled = pr.mergeable === 'CONFLICTING' || pr.isDraft
  merge.addEventListener('click', () => void doMerge(pr, cwd))
  acts.append(open, diff, merge)
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
  const r = await prService.merge(cwd, pr.number, 'squash')
  if (!r.ok) showTextModal('Merge failed', r.error || 'unknown error')
  else pushNotification('', `PR #${pr.number} merged`, 'pr', pr.title)
  void renderPr()
}

export async function renderPr(): Promise<void> {
  const el = viewEl()
  const cwd = activeCwd()
  lastCwd = cwd
  busy = false

  // toolbar (always present so the user can refresh / create)
  el.replaceChildren()
  const bar = document.createElement('div')
  bar.className = 'pr-toolbar'
  if (subTab === 'prs') {
    const create = document.createElement('button')
    create.className = 'settings-inline-btn'
    create.textContent = '+ Create PR'
    create.title = 'Run `gh pr create --web` beside the active pane'
    create.addEventListener('click', () => void runInSplit('gh pr create --web'))
    bar.appendChild(create)
  }
  const refresh = document.createElement('button')
  refresh.className = 'settings-inline-btn'
  refresh.textContent = '⟳'
  refresh.title = 'Refresh'
  refresh.addEventListener('click', () => void renderPr())
  bar.appendChild(refresh)
  el.appendChild(bar)

  // sub-tabs: Pull Requests | Deployments
  const subbar = document.createElement('div')
  subbar.className = 'pr-subtabs'
  const mkSub = (key: 'prs' | 'deploys', label: string): HTMLElement => {
    const b = document.createElement('button')
    b.className = 'pr-subtab' + (subTab === key ? ' active' : '')
    b.textContent = label
    b.addEventListener('click', () => {
      if (subTab === key) return
      subTab = key
      void renderPr()
    })
    return b
  }
  subbar.append(mkSub('prs', 'Pull Requests'), mkSub('deploys', 'Deployments'))
  el.appendChild(subbar)

  // nested scope tabs (both sub-tabs): active terminal's repo vs. the projects
  // the user selected under the settings code root.
  const scope = subTab === 'prs' ? prScope : deployScope
  const scopebar = document.createElement('div')
  scopebar.className = 'pr-subtabs pr-scopetabs'
  const mkScope = (key: 'current' | 'all', label: string): HTMLElement => {
    const b = document.createElement('button')
    b.className = 'pr-subtab' + (scope === key ? ' active' : '')
    b.textContent = label
    b.addEventListener('click', () => {
      if (scope === key) return
      if (subTab === 'prs') prScope = key
      else deployScope = key
      void renderPr()
    })
    return b
  }
  scopebar.append(mkScope('current', 'Current'), mkScope('all', 'All projects'))
  el.appendChild(scopebar)

  const listEl = document.createElement('div')
  listEl.className = 'pr-list'
  el.appendChild(listEl)
  listEl.textContent = 'Loading…'

  // "All projects" uses the selected repo set and is independent of the active repo.
  if (scope === 'all') {
    if (subTab === 'prs') await renderAllPrs(listEl)
    else await renderAllDeployments(listEl)
    return
  }

  if (!cwd) {
    listEl.innerHTML = '<div class="notif-empty">Open a terminal in a GitHub repo to see its PRs.</div>'
    return
  }
  const avail = await prService.available(cwd)
  if (!avail.ok) {
    listEl.replaceChildren()
    const e = document.createElement('div')
    e.className = 'notif-empty'
    e.textContent = avail.error || 'GitHub CLI unavailable.'
    listEl.appendChild(e)
    return
  }
  if (subTab === 'prs') await renderPrList(listEl, cwd, avail.repo ?? '')
  else await renderDeployments(listEl, cwd, avail.repo ?? '')
}

async function renderPrList(listEl: HTMLElement, cwd: string, repo: string): Promise<void> {
  const res = await prService.list(cwd)
  listEl.replaceChildren()
  if (!res.ok) {
    listEl.innerHTML = `<div class="notif-empty">${res.error || 'Failed to load PRs.'}</div>`
    return
  }
  const repoEl = document.createElement('div')
  repoEl.className = 'pr-repo'
  repoEl.textContent = repo
  listEl.appendChild(repoEl)
  if (!res.prs.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No open pull requests.</div>')
    return
  }
  const branch = (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
  for (const pr of res.prs) listEl.appendChild(card(pr, cwd, !!branch && pr.headRefName === branch))
  busy ||= res.prs.some((p) => p.checks.state === 'pending')
  noteChecks(res.prs.map((p) => ({ key: `${repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state })))
}

// "+ Add projects" toolbar shared by the All-projects PR and Deployment views.
function appendAddProjectsBar(listEl: HTMLElement): void {
  const bar = document.createElement('div')
  bar.className = 'pr-allbar'
  const add = document.createElement('button')
  add.className = 'settings-inline-btn'
  add.textContent = '+ Add projects'
  add.title = 'Choose which repositories appear here'
  add.addEventListener('click', () => void showProjectPicker())
  bar.appendChild(add)
  listEl.appendChild(bar)
}

// "All projects" PR scope: only the repos the user explicitly added, grouped
// per-project. An "Add projects" button manages the selection.
async function renderAllPrs(listEl: HTMLElement): Promise<void> {
  listEl.replaceChildren()
  appendAddProjectsBar(listEl)

  const paths = settings.prProjects
  if (!paths.length) {
    listEl.insertAdjacentHTML(
      'beforeend',
      '<div class="notif-empty">No projects added yet. Click “+ Add projects” to choose repositories.</div>'
    )
    return
  }

  const loading = document.createElement('div')
  loading.className = 'notif-empty'
  loading.textContent = 'Loading…'
  listEl.appendChild(loading)

  const res = await prService.listAll(settings.codeRoot, paths)
  loading.remove()
  if (!res.ok) {
    listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${res.error || 'Failed to load PRs.'}</div>`)
    return
  }
  const branch = (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
  const activePath = activeCwd()
  for (const proj of res.projects) {
    const head = document.createElement('div')
    head.className = 'pr-section-head'
    head.textContent = proj.name
    head.title = proj.repo
    listEl.appendChild(head)
    if (!proj.prs.length) {
      listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty pr-group-empty">No open pull requests.</div>')
      continue
    }
    for (const pr of proj.prs) {
      const isCurrent = proj.path === activePath && !!branch && pr.headRefName === branch
      listEl.appendChild(card(pr, proj.path, isCurrent))
    }
  }
  const all = res.projects.flatMap((proj) =>
    proj.prs.map((p) => ({ key: `${proj.repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
  )
  busy ||= all.some((p) => p.state === 'pending')
  noteChecks(all)
}

// "All projects" Deployments scope: deployments + workflow runs for the selected
// repos, grouped per-project. Mirrors renderAllPrs.
async function renderAllDeployments(listEl: HTMLElement): Promise<void> {
  listEl.replaceChildren()
  appendAddProjectsBar(listEl)

  const paths = settings.prProjects
  if (!paths.length) {
    listEl.insertAdjacentHTML(
      'beforeend',
      '<div class="notif-empty">No projects added yet. Click “+ Add projects” to choose repositories.</div>'
    )
    return
  }

  const loading = document.createElement('div')
  loading.className = 'notif-empty'
  loading.textContent = 'Loading…'
  listEl.appendChild(loading)

  const res = await prService.deploysAll(settings.codeRoot, paths)
  loading.remove()
  if (!res.ok) {
    listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${res.error || 'Failed to load deployments.'}</div>`)
    return
  }
  for (const proj of res.projects) {
    const head = document.createElement('div')
    head.className = 'pr-section-head'
    head.textContent = proj.name
    listEl.appendChild(head)
    if (!proj.deployments.length && !proj.runs.length) {
      listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty pr-group-empty">No deployments or runs.</div>')
      continue
    }
    for (const d of proj.deployments) listEl.appendChild(deployCard(d))
    for (const r of proj.runs.slice(0, 5)) listEl.appendChild(runCard(r, proj.path))
  }
  const allDeploys = res.projects.flatMap((proj) => proj.deployments)
  const allRuns = res.projects.flatMap((proj) => proj.runs)
  busy ||=
    allDeploys.some((d) => ['pending', 'in_progress', 'queued'].includes(d.state)) ||
    allRuns.some((r) => r.status !== 'completed')
  noteDeploys(allDeploys)
  noteRuns(allRuns)
}

// Searchable, multi-select repo picker for the "All projects" view. Pre-checks
// the current selection; on save, persists settings.prProjects and re-renders.
async function showProjectPicker(): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal picker-modal'
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
  document.body.appendChild(overlay)

  const h = document.createElement('h2')
  h.textContent = 'Add projects'
  modal.appendChild(h)

  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search repositories by name'
  input.spellcheck = false
  modal.appendChild(input)

  const countEl = document.createElement('div')
  countEl.className = 'md-count'
  modal.appendChild(countEl)

  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.appendChild(list)
  list.textContent = 'Loading…'

  const selected = new Set(settings.prProjects)

  const res = await prService.repos(settings.codeRoot)
  if (!res.ok) {
    list.replaceChildren()
    const e = document.createElement('div')
    e.className = 'empty-hint'
    e.textContent = res.error || 'Could not list repositories.'
    list.appendChild(e)
    return
  }
  const repos = res.repos

  const render = (): void => {
    const q = input.value.trim().toLowerCase()
    const items = q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos
    countEl.textContent = `${selected.size} selected · ${items.length} repo${items.length === 1 ? '' : 's'}`
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    for (const r of items) {
      const row = document.createElement('label')
      row.className = 'pick-row pr-pick-row'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selected.has(r.path)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(r.path)
        else selected.delete(r.path)
        countEl.textContent = `${selected.size} selected · ${items.length} repo${items.length === 1 ? '' : 's'}`
      })
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = r.name
      row.append(cb, name)
      list.appendChild(row)
    }
  }
  input.addEventListener('input', render)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  render()

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = 'Save'
  save.addEventListener('click', () => {
    settings.prProjects = repos.filter((r) => selected.has(r.path)).map((r) => r.path)
    persistence.save()
    close()
    void renderPr()
  })
  actions.append(cancel, save)
  modal.appendChild(actions)

  input.focus()
}

// ---- deployments sub-tab -------------------------------------------------
function ago(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function runBadge(run: WorkflowRun): HTMLElement {
  if (run.status !== 'completed') {
    const text = run.status === 'queued' ? 'queued' : 'running'
    return statusTag('wait', text, { pulse: true })
  }
  const c = run.conclusion
  if (c === 'success') return statusTag('ok', 'success')
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c))
    return statusTag('bad', c.replace(/_/g, ' '))
  return statusTag('none', c || 'done')
}

function runState(run: WorkflowRun): 'ready' | 'running' | 'blocked' | 'neutral' {
  if (run.status !== 'completed') return 'running'
  if (run.conclusion === 'success') return 'ready'
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion))
    return 'blocked'
  return 'neutral'
}

function deployBadge(d: DeploymentStatus): HTMLElement {
  const s = d.state
  if (s === 'success') return statusTag('ok', 'success')
  if (s === 'failure' || s === 'error') return statusTag('bad', s)
  if (s === 'inactive') return statusTag('none', 'inactive')
  return statusTag('wait', s.replace(/_/g, ' ') || 'pending', { pulse: true })
}

function deployState(d: DeploymentStatus): 'ready' | 'running' | 'blocked' | 'neutral' {
  if (d.state === 'success') return 'ready'
  if (d.state === 'failure' || d.state === 'error') return 'blocked'
  if (d.state === 'inactive') return 'neutral'
  return 'running'
}

function stepMark(status: string, conclusion: string): string {
  if (status !== 'completed') return '●'
  return conclusion === 'success' || conclusion === 'skipped' || conclusion === 'neutral' ? '✓' : '✕'
}

interface RunJob {
  name?: string
  status?: string
  conclusion?: string
  steps?: { name?: string; status?: string; conclusion?: string }[]
}

async function showRunJobs(cwd: string, run: WorkflowRun): Promise<void> {
  const raw = await prService.runJobs(cwd, run.id)
  let text = raw
  try {
    const data = JSON.parse(raw) as { jobs?: RunJob[] }
    const lines: string[] = []
    for (const j of data.jobs ?? []) {
      const jc = `${j.status ?? ''}${j.conclusion ? '/' + j.conclusion : ''}`
      lines.push(`${stepMark(j.status ?? '', j.conclusion ?? '')} ${j.name ?? ''}  [${jc}]`)
      for (const s of j.steps ?? [])
        lines.push(`    ${stepMark(s.status ?? '', s.conclusion ?? '')} ${s.name ?? ''}`)
    }
    if (lines.length) text = lines.join('\n')
  } catch {
    /* fall back to raw */
  }
  showTextModal(`Run · ${run.name}`, text)
}

function runCard(run: WorkflowRun, cwd: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card state-' + runState(run)

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const name = document.createElement('span')
  name.className = 'pr-title'
  name.textContent = run.name
  name.title = run.name
  top.appendChild(name)
  el.appendChild(top)

  if (run.title) {
    const sub = document.createElement('div')
    sub.className = 'pr-branch'
    sub.textContent = run.title
    sub.title = run.title
    el.appendChild(sub)
  }

  const meta = document.createElement('div')
  meta.className = 'pr-branch'
  const parts = [run.headBranch, run.headSha ? run.headSha.slice(0, 7) : '', run.event, ago(run.createdAt)]
  meta.textContent = parts.filter(Boolean).join(' · ')
  el.appendChild(meta)

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(runBadge(run))
  el.appendChild(tags)

  const acts = document.createElement('div')
  acts.className = 'pr-actions'
  const open = document.createElement('button')
  open.className = 'pr-act primary'
  open.textContent = 'Open'
  open.title = 'Open this run on GitHub'
  open.disabled = !run.url
  open.addEventListener('click', () => void openLink(run.url))
  const logs = document.createElement('button')
  logs.className = 'pr-act'
  logs.textContent = 'Logs'
  logs.title = 'Show job/step breakdown'
  logs.addEventListener('click', () => void showRunJobs(cwd, run))
  acts.append(open, logs)
  el.appendChild(acts)
  return el
}

function deployCard(d: DeploymentStatus): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card state-' + deployState(d)

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const env = document.createElement('span')
  env.className = 'pr-title'
  env.textContent = d.environment || 'deployment'
  env.title = d.environment
  top.appendChild(env)
  el.appendChild(top)

  const meta = document.createElement('div')
  meta.className = 'pr-branch'
  meta.textContent = [d.ref, ago(d.createdAt)].filter(Boolean).join(' · ')
  el.appendChild(meta)

  if (d.description) {
    const desc = document.createElement('div')
    desc.className = 'pr-branch'
    desc.textContent = d.description
    desc.title = d.description
    el.appendChild(desc)
  }

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(deployBadge(d))
  el.appendChild(tags)

  if (d.url) {
    const acts = document.createElement('div')
    acts.className = 'pr-actions'
    const open = document.createElement('button')
    open.className = 'pr-act primary'
    open.textContent = 'Open'
    open.title = 'Open the deployment / environment URL'
    open.addEventListener('click', () => void openLink(d.url))
    acts.appendChild(open)
    el.appendChild(acts)
  }
  return el
}

async function renderDeployments(listEl: HTMLElement, cwd: string, repo: string): Promise<void> {
  const [dep, runs] = await Promise.all([
    prService.deployments(cwd),
    prService.runs(cwd)
  ])
  listEl.replaceChildren()

  const repoEl = document.createElement('div')
  repoEl.className = 'pr-repo'
  repoEl.textContent = repo
  listEl.appendChild(repoEl)

  // Deployments section
  const depHead = document.createElement('div')
  depHead.className = 'pr-section-head'
  depHead.textContent = 'Deployments'
  listEl.appendChild(depHead)
  if (!dep.ok) {
    listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${dep.error || 'Failed to load deployments.'}</div>`)
  } else if (!dep.deployments.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No deployments.</div>')
  } else {
    for (const d of dep.deployments) listEl.appendChild(deployCard(d))
    noteDeploys(dep.deployments)
    busy ||= dep.deployments.some((d) =>
      ['pending', 'in_progress', 'queued'].includes(d.state)
    )
  }

  // Workflow runs section
  const runHead = document.createElement('div')
  runHead.className = 'pr-section-head'
  runHead.textContent = 'Workflow runs'
  listEl.appendChild(runHead)
  if (!runs.ok) {
    listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${runs.error || 'Failed to load runs.'}</div>`)
  } else if (!runs.runs.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No workflow runs.</div>')
  } else {
    for (const r of runs.runs) listEl.appendChild(runCard(r, cwd))
    noteRuns(runs.runs)
    busy ||= runs.runs.some((r) => r.status !== 'completed')
  }
}

// Alert when a PR's CI transitions out of "pending" (so async work surfaces).
// Keyed by "repo#number" so PR numbers don't collide across projects.
function noteChecks(items: { key: string; number: number; title: string; state: string }[]): void {
  const next = new Map<string, string>()
  for (const it of items) {
    next.set(it.key, it.state)
    const prev = lastChecks.get(it.key)
    if (prev === 'pending' && (it.state === 'success' || it.state === 'failure')) {
      pushNotification('', `PR #${it.number} checks ${it.state === 'success' ? 'passed' : 'failed'}`, 'pr', it.title)
    }
  }
  lastChecks = next
}

// Alert when a workflow run finishes (in_progress/queued → completed).
function noteRuns(runs: WorkflowRun[]): void {
  const next = new Map<number, string>()
  for (const r of runs) {
    next.set(r.id, r.status)
    const prev = lastRunStatus.get(r.id)
    if (prev && prev !== 'completed' && r.status === 'completed') {
      const ok = r.conclusion === 'success'
      pushNotification('', `Run ${r.name} ${ok ? 'succeeded' : r.conclusion || 'finished'}`, 'pr', r.title)
    }
  }
  lastRunStatus = next
}

// Alert when a deployment reaches a terminal state.
const TERMINAL_DEPLOY = new Set(['success', 'failure', 'error', 'inactive'])
function noteDeploys(deployments: DeploymentStatus[]): void {
  const next = new Map<number, string>()
  for (const d of deployments) {
    next.set(d.id, d.state)
    const prev = lastDeployState.get(d.id)
    if (prev && !TERMINAL_DEPLOY.has(prev) && TERMINAL_DEPLOY.has(d.state) && d.state !== 'inactive') {
      pushNotification('', `Deploy ${d.environment} ${d.state}`, 'pr', d.description || d.ref)
    }
  }
  lastDeployState = next
}

// Background poll: only while the PR tab is visible. Picks up CI/deploy completion
// even when the user is focused elsewhere (the whole point of the notification).
// Cadence adapts: ~20s while something is in-flight, 5min when settled.
export function prTabVisible(visible: boolean): void {
  tabVisible = visible
  if (visible) {
    void poll()
  } else if (pollTimer !== null) {
    window.clearTimeout(pollTimer)
    pollTimer = null
  }
}

function scheduleNextPoll(): void {
  if (!tabVisible) return
  if (pollTimer !== null) window.clearTimeout(pollTimer)
  pollTimer = window.setTimeout(() => void poll(), busy ? 20_000 : 300_000)
}

async function poll(): Promise<void> {
  if (!tabVisible) return
  await renderPr() // re-reads the active cwd, so a repo change is handled for free
  scheduleNextPoll()
}
