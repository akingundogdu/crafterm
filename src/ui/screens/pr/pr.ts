import './pr.css'
import type { PullRequest, WorkflowRun } from '@services/pr/pr.types'
import { state, panes, settings, pushNotification } from '../../state'
import { openLink, runInSplit, openPrDiff } from '../../commands'
import { promptConfirm } from '../../dialog'
import { prService } from '@services'
import { createButton } from '@ui/components'
import { buildPrCard, buildRunCard, buildDeployCard } from './components/cards'
import { showTextModal } from './components/text-modal'
import { showProjectPicker } from './components/project-picker'
import { createAlertTracker } from './alerts'
import { stepMark } from './pr-status'

// The right-panel "Pull Requests / Deployments" tab. Polls GitHub (via gh) while
// visible and surfaces CI/deploy completion as notifications. Cards, badges, the
// repo picker, the text modal, and change-alert tracking live in sibling modules;
// this file orchestrates rendering, scoping, merging, and the adaptive poll.

const viewEl = (): HTMLElement => document.getElementById('notif-pr-view')!

const alerts = createAlertTracker((message, subtitle) =>
  pushNotification('', message, 'pr', subtitle)
)

// Repo to query: the active terminal's cwd.
function activeCwd(): string {
  const id = state.activePaneId
  return (id ? panes.get(id)?.cwd : null) ?? ''
}

let pollTimer: number | null = null
let tabVisible = false
let subTab: 'prs' | 'deploys' = 'prs'
let prScope: 'current' | 'all' = 'current'
let deployScope: 'current' | 'all' = 'current'
let busy = false // something in-flight (pending checks / running deploys) → poll faster

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

// Build a PR card, wiring its actions back to the orchestrator.
function card(pr: PullRequest, cwd: string, isCurrent: boolean): HTMLElement {
  return buildPrCard(pr, {
    isCurrent,
    onReview: () => void openLink(pr.url),
    onDiff: () => openPrDiff(cwd, pr.number, `PR #${pr.number}`),
    onMerge: () => void doMerge(pr, cwd)
  })
}

function runCard(run: WorkflowRun, cwd: string): HTMLElement {
  return buildRunCard(run, {
    onOpen: () => void openLink(run.url),
    onLogs: () => void showRunJobs(cwd, run)
  })
}

export async function renderPr(): Promise<void> {
  const el = viewEl()
  const cwd = activeCwd()
  busy = false

  // toolbar (always present so the user can refresh / create)
  el.replaceChildren()
  const bar = document.createElement('div')
  bar.className = 'pr-toolbar'
  if (subTab === 'prs') {
    bar.appendChild(
      createButton({
        className: 'settings-inline-btn',
        text: '+ Create PR',
        title: 'Run `gh pr create --web` beside the active pane',
        onClick: () => void runInSplit('gh pr create --web')
      })
    )
  }
  bar.appendChild(
    createButton({
      className: 'settings-inline-btn',
      text: '⟳',
      title: 'Refresh',
      onClick: () => void renderPr()
    })
  )
  el.appendChild(bar)

  // sub-tabs: Pull Requests | Deployments
  const subbar = document.createElement('div')
  subbar.className = 'pr-subtabs'
  const mkSub = (key: 'prs' | 'deploys', label: string): HTMLElement =>
    createButton({
      className: 'pr-subtab' + (subTab === key ? ' active' : ''),
      text: label,
      onClick: () => {
        if (subTab === key) return
        subTab = key
        void renderPr()
      }
    })
  subbar.append(mkSub('prs', 'Pull Requests'), mkSub('deploys', 'Deployments'))
  el.appendChild(subbar)

  // nested scope tabs (both sub-tabs): active terminal's repo vs. the projects
  // the user selected under the settings code root.
  const scope = subTab === 'prs' ? prScope : deployScope
  const scopebar = document.createElement('div')
  scopebar.className = 'pr-subtabs pr-scopetabs'
  const mkScope = (key: 'current' | 'all', label: string): HTMLElement =>
    createButton({
      className: 'pr-subtab' + (scope === key ? ' active' : ''),
      text: label,
      onClick: () => {
        if (scope === key) return
        if (subTab === 'prs') prScope = key
        else deployScope = key
        void renderPr()
      }
    })
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
  alerts.noteChecks(
    res.prs.map((p) => ({ key: `${repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
  )
}

// "+ Add projects" toolbar shared by the All-projects PR and Deployment views.
function appendAddProjectsBar(listEl: HTMLElement): void {
  const bar = document.createElement('div')
  bar.className = 'pr-allbar'
  bar.appendChild(
    createButton({
      className: 'settings-inline-btn',
      text: '+ Add projects',
      title: 'Choose which repositories appear here',
      onClick: () => void showProjectPicker(() => void renderPr())
    })
  )
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
  alerts.noteChecks(all)
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
    for (const d of proj.deployments) listEl.appendChild(buildDeployCard(d, { onOpen: () => void openLink(d.url) }))
    for (const r of proj.runs.slice(0, 5)) listEl.appendChild(runCard(r, proj.path))
  }
  const allDeploys = res.projects.flatMap((proj) => proj.deployments)
  const allRuns = res.projects.flatMap((proj) => proj.runs)
  busy ||=
    allDeploys.some((d) => ['pending', 'in_progress', 'queued'].includes(d.state)) ||
    allRuns.some((r) => r.status !== 'completed')
  alerts.noteDeploys(allDeploys)
  alerts.noteRuns(allRuns)
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

async function renderDeployments(listEl: HTMLElement, cwd: string, repo: string): Promise<void> {
  const [dep, runs] = await Promise.all([prService.deployments(cwd), prService.runs(cwd)])
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
    for (const d of dep.deployments) listEl.appendChild(buildDeployCard(d, { onOpen: () => void openLink(d.url) }))
    alerts.noteDeploys(dep.deployments)
    busy ||= dep.deployments.some((d) => ['pending', 'in_progress', 'queued'].includes(d.state))
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
    alerts.noteRuns(runs.runs)
    busy ||= runs.runs.some((r) => r.status !== 'completed')
  }
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
