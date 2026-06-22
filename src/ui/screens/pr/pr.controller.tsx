import { UITexts } from '@texts'
import type { PullRequest, WorkflowRun } from '@services/pr/pr.types'
import { state, panes, settings, pushNotification } from '@ui/state/state'
import { openLink, runInSplit, openPrDiff } from '@ui/commands/commands'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { prService } from '@services'
import { createButton } from '@ui/components'
import { buildPrCard, buildRunCard, buildDeployCard } from './components/cards'
import { showTextModal } from './components/text-modal'
import { showProjectPicker } from './components/project-picker'
import { createAlertTracker } from './alerts'
import {
  formatRunJobs,
  hasPendingChecks,
  hasActiveDeploy,
  hasActiveRun,
  POLL_BUSY_MS,
  POLL_IDLE_MS
} from './pr.state'

const viewEl = (): HTMLElement => document.getElementById('notif-pr-view')!

// Owns the right-panel "Pull Requests / Deployments" tab: sub-tab + scope state,
// the adaptive background poll, and rendering. Methods are arrow methods so
// `this` binds when passed as card/poll/event callbacks.
export class PrController {
  private readonly alerts = createAlertTracker((message, subtitle) =>
    pushNotification('', message, 'pr', subtitle)
  )

  private pollTimer: number | null = null
  private tabVisible = false
  private subTab: 'prs' | 'deploys' = 'prs'
  private prScope: 'current' | 'all' = 'current'
  private deployScope: 'current' | 'all' = 'current'
  private busy = false // something in-flight (pending checks / running deploys) → poll faster

  // Repo to query: the active terminal's cwd.
  private activeCwd = (): string => {
    const id = state.activePaneId
    return (id ? panes.get(id)?.cwd : null) ?? ''
  }

  private doMerge = async (pr: PullRequest, cwd: string): Promise<void> => {
    const ok = await promptConfirm({
      title: UITexts.Pr.merge.title(pr.number),
      message: UITexts.Pr.merge.message(pr.title, pr.baseRefName),
      confirmText: UITexts.Pr.merge.confirm
    })
    if (!ok) return
    const r = await prService.merge(cwd, pr.number, 'squash')
    if (!r.ok) showTextModal(UITexts.Pr.merge.failed, r.error || UITexts.Pr.unknownError)
    else pushNotification('', `PR #${pr.number} merged`, 'pr', pr.title)
    void this.renderPr()
  }

  // Build a PR card, wiring its actions back to the orchestrator.
  private card = (pr: PullRequest, cwd: string, isCurrent: boolean): HTMLElement => {
    return buildPrCard(pr, {
      isCurrent,
      onReview: () => void openLink(pr.url),
      onDiff: () => openPrDiff(cwd, pr.number, `PR #${pr.number}`),
      onMerge: () => void this.doMerge(pr, cwd)
    })
  }

  private runCard = (run: WorkflowRun, cwd: string): HTMLElement => {
    return buildRunCard(run, {
      onOpen: () => void openLink(run.url),
      onLogs: () => void this.showRunJobs(cwd, run)
    })
  }

  renderPr = async (): Promise<void> => {
    const el = viewEl()
    const cwd = this.activeCwd()
    this.busy = false

    // toolbar (always present so the user can refresh / create)
    el.replaceChildren()
    const bar = (<div class="pr-toolbar" />) as HTMLDivElement
    if (this.subTab === 'prs') {
      bar.appendChild(
        createButton({
          className: 'settings-inline-btn',
          text: UITexts.Pr.createPr,
          title: UITexts.Pr.createPrTitle,
          onClick: () => void runInSplit('gh pr create --web')
        })
      )
    }
    bar.appendChild(
      createButton({
        className: 'settings-inline-btn',
        text: '⟳',
        title: UITexts.Pr.refreshTitle,
        onClick: () => void this.renderPr()
      })
    )
    el.appendChild(bar)

    // sub-tabs: Pull Requests | Deployments
    const subbar = (<div class="pr-subtabs" />) as HTMLDivElement
    const mkSub = (key: 'prs' | 'deploys', label: string): HTMLElement =>
      createButton({
        className: 'pr-subtab' + (this.subTab === key ? ' active' : ''),
        text: label,
        onClick: () => {
          if (this.subTab === key) return
          this.subTab = key
          void this.renderPr()
        }
      })
    subbar.append(mkSub('prs', UITexts.Pr.subPrs), mkSub('deploys', UITexts.Pr.subDeploys))
    el.appendChild(subbar)

    // nested scope tabs (both sub-tabs): active terminal's repo vs. the projects
    // the user selected under the settings code root.
    const scope = this.subTab === 'prs' ? this.prScope : this.deployScope
    const scopebar = (<div class="pr-subtabs pr-scopetabs" />) as HTMLDivElement
    const mkScope = (key: 'current' | 'all', label: string): HTMLElement =>
      createButton({
        className: 'pr-subtab' + (scope === key ? ' active' : ''),
        text: label,
        onClick: () => {
          if (scope === key) return
          if (this.subTab === 'prs') this.prScope = key
          else this.deployScope = key
          void this.renderPr()
        }
      })
    scopebar.append(mkScope('current', UITexts.Pr.scopeCurrent), mkScope('all', UITexts.Pr.scopeAll))
    el.appendChild(scopebar)

    const listEl = (<div class="pr-list" />) as HTMLDivElement
    el.appendChild(listEl)
    listEl.textContent = UITexts.Pr.loading

    // "All projects" uses the selected repo set and is independent of the active repo.
    if (scope === 'all') {
      if (this.subTab === 'prs') await this.renderAllPrs(listEl)
      else await this.renderAllDeployments(listEl)
      return
    }

    if (!cwd) {
      listEl.innerHTML = '<div class="notif-empty">Open a terminal in a GitHub repo to see its PRs.</div>'
      return
    }
    const avail = await prService.available(cwd)
    if (!avail.ok) {
      listEl.replaceChildren()
      const e = (<div class="notif-empty" />) as HTMLDivElement
      e.textContent = avail.error || UITexts.Pr.cliUnavailable
      listEl.appendChild(e)
      return
    }
    if (this.subTab === 'prs') await this.renderPrList(listEl, cwd, avail.repo ?? '')
    else await this.renderDeployments(listEl, cwd, avail.repo ?? '')
  }

  private renderPrList = async (listEl: HTMLElement, cwd: string, repo: string): Promise<void> => {
    const res = await prService.list(cwd)
    listEl.replaceChildren()
    if (!res.ok) {
      listEl.innerHTML = `<div class="notif-empty">${res.error || 'Failed to load PRs.'}</div>`
      return
    }
    const repoEl = (<div class="pr-repo" />) as HTMLDivElement
    repoEl.textContent = repo
    listEl.appendChild(repoEl)
    if (!res.prs.length) {
      listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No open pull requests.</div>')
      return
    }
    const branch = (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
    for (const pr of res.prs) listEl.appendChild(this.card(pr, cwd, !!branch && pr.headRefName === branch))
    this.busy ||= hasPendingChecks(res.prs)
    this.alerts.noteChecks(
      res.prs.map((p) => ({ key: `${repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
    )
  }

  // "+ Add projects" toolbar shared by the All-projects PR and Deployment views.
  private appendAddProjectsBar = (listEl: HTMLElement): void => {
    const bar = (<div class="pr-allbar" />) as HTMLDivElement
    bar.appendChild(
      createButton({
        className: 'settings-inline-btn',
        text: UITexts.Pr.addProjects,
        title: UITexts.Pr.addProjectsTitle,
        onClick: () => void showProjectPicker(() => void this.renderPr())
      })
    )
    listEl.appendChild(bar)
  }

  // "All projects" PR scope: only the repos the user explicitly added, grouped
  // per-project. An "Add projects" button manages the selection.
  private renderAllPrs = async (listEl: HTMLElement): Promise<void> => {
    listEl.replaceChildren()
    this.appendAddProjectsBar(listEl)

    const paths = settings.prProjects
    if (!paths.length) {
      listEl.insertAdjacentHTML(
        'beforeend',
        '<div class="notif-empty">No projects added yet. Click “+ Add projects” to choose repositories.</div>'
      )
      return
    }

    const loading = (<div class="notif-empty" />) as HTMLDivElement
    loading.textContent = UITexts.Pr.loading
    listEl.appendChild(loading)

    const res = await prService.listAll(settings.codeRoot, paths)
    loading.remove()
    if (!res.ok) {
      listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${res.error || 'Failed to load PRs.'}</div>`)
      return
    }
    const branch = (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
    const activePath = this.activeCwd()
    for (const proj of res.projects) {
      const head = (<div class="pr-section-head" />) as HTMLDivElement
      head.textContent = proj.name
      head.title = proj.repo
      listEl.appendChild(head)
      if (!proj.prs.length) {
        listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty pr-group-empty">No open pull requests.</div>')
        continue
      }
      for (const pr of proj.prs) {
        const isCurrent = proj.path === activePath && !!branch && pr.headRefName === branch
        listEl.appendChild(this.card(pr, proj.path, isCurrent))
      }
    }
    const all = res.projects.flatMap((proj) =>
      proj.prs.map((p) => ({ key: `${proj.repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
    )
    this.busy ||= all.some((p) => p.state === 'pending')
    this.alerts.noteChecks(all)
  }

  // "All projects" Deployments scope: deployments + workflow runs for the selected
  // repos, grouped per-project. Mirrors renderAllPrs.
  private renderAllDeployments = async (listEl: HTMLElement): Promise<void> => {
    listEl.replaceChildren()
    this.appendAddProjectsBar(listEl)

    const paths = settings.prProjects
    if (!paths.length) {
      listEl.insertAdjacentHTML(
        'beforeend',
        '<div class="notif-empty">No projects added yet. Click “+ Add projects” to choose repositories.</div>'
      )
      return
    }

    const loading = (<div class="notif-empty" />) as HTMLDivElement
    loading.textContent = UITexts.Pr.loading
    listEl.appendChild(loading)

    const res = await prService.deploysAll(settings.codeRoot, paths)
    loading.remove()
    if (!res.ok) {
      listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${res.error || 'Failed to load deployments.'}</div>`)
      return
    }
    for (const proj of res.projects) {
      const head = (<div class="pr-section-head" />) as HTMLDivElement
      head.textContent = proj.name
      listEl.appendChild(head)
      if (!proj.deployments.length && !proj.runs.length) {
        listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty pr-group-empty">No deployments or runs.</div>')
        continue
      }
      for (const d of proj.deployments) listEl.appendChild(buildDeployCard(d, { onOpen: () => void openLink(d.url) }))
      for (const r of proj.runs.slice(0, 5)) listEl.appendChild(this.runCard(r, proj.path))
    }
    const allDeploys = res.projects.flatMap((proj) => proj.deployments)
    const allRuns = res.projects.flatMap((proj) => proj.runs)
    this.busy ||= hasActiveDeploy(allDeploys) || hasActiveRun(allRuns)
    this.alerts.noteDeploys(allDeploys)
    this.alerts.noteRuns(allRuns)
  }

  private showRunJobs = async (cwd: string, run: WorkflowRun): Promise<void> => {
    const raw = await prService.runJobs(cwd, run.id)
    showTextModal(`Run · ${run.name}`, formatRunJobs(raw) ?? raw)
  }

  private renderDeployments = async (listEl: HTMLElement, cwd: string, repo: string): Promise<void> => {
    const [dep, runs] = await Promise.all([prService.deployments(cwd), prService.runs(cwd)])
    listEl.replaceChildren()

    const repoEl = (<div class="pr-repo" />) as HTMLDivElement
    repoEl.textContent = repo
    listEl.appendChild(repoEl)

    // Deployments section
    const depHead = (<div class="pr-section-head" />) as HTMLDivElement
    depHead.textContent = UITexts.Pr.deployments
    listEl.appendChild(depHead)
    if (!dep.ok) {
      listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${dep.error || 'Failed to load deployments.'}</div>`)
    } else if (!dep.deployments.length) {
      listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No deployments.</div>')
    } else {
      for (const d of dep.deployments) listEl.appendChild(buildDeployCard(d, { onOpen: () => void openLink(d.url) }))
      this.alerts.noteDeploys(dep.deployments)
      this.busy ||= hasActiveDeploy(dep.deployments)
    }

    // Workflow runs section
    const runHead = (<div class="pr-section-head" />) as HTMLDivElement
    runHead.textContent = UITexts.Pr.workflowRuns
    listEl.appendChild(runHead)
    if (!runs.ok) {
      listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${runs.error || 'Failed to load runs.'}</div>`)
    } else if (!runs.runs.length) {
      listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No workflow runs.</div>')
    } else {
      for (const r of runs.runs) listEl.appendChild(this.runCard(r, cwd))
      this.alerts.noteRuns(runs.runs)
      this.busy ||= hasActiveRun(runs.runs)
    }
  }

  // Background poll: only while the PR tab is visible. Picks up CI/deploy completion
  // even when the user is focused elsewhere (the whole point of the notification).
  // Cadence adapts: ~20s while something is in-flight, 5min when settled.
  prTabVisible = (visible: boolean): void => {
    this.tabVisible = visible
    if (visible) {
      void this.poll()
    } else if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private scheduleNextPoll = (): void => {
    if (!this.tabVisible) return
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer)
    this.pollTimer = window.setTimeout(() => void this.poll(), this.busy ? POLL_BUSY_MS : POLL_IDLE_MS)
  }

  private poll = async (): Promise<void> => {
    if (!this.tabVisible) return
    await this.renderPr() // re-reads the active cwd, so a repo change is handled for free
    this.scheduleNextPoll()
  }
}

export const prController = new PrController()
