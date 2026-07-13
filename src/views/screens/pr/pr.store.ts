import { Store } from '@geajs/core'
import { UITexts } from '@texts'
import type { PullRequest, WorkflowRun } from '@services/pr/pr.types'
import { prService } from '@services'
import { state, panes, settings, pushNotification } from '@views/state/spine'
import { openPrDiff } from '@views/commands/commands'
import { promptConfirm } from '@views/components/dialog/confirm'
import { showTextModal } from './components/text-modal'
import { createAlertTracker } from './alerts'
import type { AlertTracker } from './alerts'
import { stepMark } from './pr-status'
import type { PrSection, RunJob } from './pr.types'

// Pure poll-cadence + status-detection helpers for the PR tab. No DOM/IPC.
// Copied into @views (§2.7, no @ui import).

// Adaptive poll cadence: faster while something is in-flight, slow when settled.
export const POLL_BUSY_MS = 20_000
export const POLL_IDLE_MS = 300_000

const ACTIVE_DEPLOY_STATES = ['pending', 'in_progress', 'queued']

// Formats `gh run view` job JSON into a step-marked text block, or null to fall
// back to the raw output (unparseable / empty).
export function formatRunJobs(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as { jobs?: RunJob[] }
    const lines: string[] = []
    for (const j of data.jobs ?? []) {
      const jc = `${j.status ?? ''}${j.conclusion ? '/' + j.conclusion : ''}`
      lines.push(`${stepMark(j.status ?? '', j.conclusion ?? '')} ${j.name ?? ''}  [${jc}]`)
      for (const s of j.steps ?? [])
        lines.push(`    ${stepMark(s.status ?? '', s.conclusion ?? '')} ${s.name ?? ''}`)
    }
    return lines.length ? lines.join('\n') : null
  } catch {
    return null
  }
}

export function hasPendingChecks(prs: { checks: { state: string } }[]): boolean {
  return prs.some((p) => p.checks.state === 'pending')
}

export function hasActiveDeploy(deploys: { state: string }[]): boolean {
  return deploys.some((d) => ACTIVE_DEPLOY_STATES.includes(d.state))
}

export function hasActiveRun(runs: { status: string }[]): boolean {
  return runs.some((r) => r.status !== 'completed')
}

// Reactive state + orchestration for the gea PR / Deployments panel (merge of the
// legacy pr.state pure logic and the imperative PrController). The pr service stays
// the source of truth; the store mirrors each fetch into a flat reactive `sections`
// array so gea patches the list, replacing the legacy renderPr()/replaceChildren
// cycle. The adaptive background poll + change-alert tracker live here too.
class PrStore extends Store {
  subTab: 'prs' | 'deploys' = 'prs'
  prScope: 'current' | 'all' = 'current'
  deployScope: 'current' | 'all' = 'current'
  loading = false
  showAddProjects = false
  sections: PrSection[] = []

  // Non-rendered orchestration state (reactivity is harmless; nothing reads it).
  private tabVisible = false
  private pollTimer: number | null = null
  private busy = false // something in-flight → poll faster
  private reqId = 0 // guards against a stale async reload overwriting a newer one
  private readonly alerts: AlertTracker = createAlertTracker((message, subtitle) =>
    pushNotification('', message, 'pr', subtitle)
  )

  // Repo to query: the active terminal's cwd.
  private activeCwd(): string {
    const id = state.activePaneId
    return (id ? panes.get(id)?.cwd : null) ?? ''
  }

  private activeBranch(): string {
    return (state.activePaneId ? panes.get(state.activePaneId)?.branch : null) ?? ''
  }

  get scope(): 'current' | 'all' {
    return this.subTab === 'prs' ? this.prScope : this.deployScope
  }

  setSubTab(key: 'prs' | 'deploys'): void {
    if (this.subTab === key) return
    this.subTab = key
    void this.reload()
  }

  setScope(key: 'current' | 'all'): void {
    if (this.scope === key) return
    if (this.subTab === 'prs') this.prScope = key
    else this.deployScope = key
    void this.reload()
  }

  async reload(): Promise<void> {
    const token = ++this.reqId
    this.busy = false
    this.loading = true
    this.sections = []
    const subTab = this.subTab
    const scope = this.scope
    this.showAddProjects = scope === 'all'

    let sections: PrSection[]
    if (scope === 'all') {
      sections = subTab === 'prs' ? await this.loadAllPrs() : await this.loadAllDeploys()
    } else {
      const cwd = this.activeCwd()
      if (!cwd) {
        sections = [{ kind: 'empty', key: 'no-cwd', text: 'Open a terminal in a GitHub repo to see its PRs.' }]
      } else {
        const avail = await prService.available(cwd)
        if (!avail.ok) {
          sections = [{ kind: 'empty', key: 'unavailable', text: avail.error || UITexts.Pr.cliUnavailable }]
        } else if (subTab === 'prs') {
          sections = await this.loadPrList(cwd, avail.repo ?? '')
        } else {
          sections = await this.loadDeployments(cwd, avail.repo ?? '')
        }
      }
    }

    if (token !== this.reqId) return // a newer reload superseded this one
    this.loading = false
    this.sections = sections
  }

  private async loadPrList(cwd: string, repo: string): Promise<PrSection[]> {
    const res = await prService.list(cwd)
    if (!res.ok) return [{ kind: 'empty', key: 'pr-err', text: res.error || 'Failed to load PRs.' }]
    const out: PrSection[] = [{ kind: 'repo-label', key: 'repo', repo }]
    if (!res.prs.length) {
      out.push({ kind: 'empty', key: 'pr-empty', text: 'No open pull requests.' })
      return out
    }
    const branch = this.activeBranch()
    for (const pr of res.prs) {
      out.push({ kind: 'pr', key: `pr:${cwd}#${pr.number}`, pr, cwd, isCurrent: !!branch && pr.headRefName === branch })
    }
    this.busy ||= hasPendingChecks(res.prs)
    this.alerts.noteChecks(
      res.prs.map((p) => ({ key: `${repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
    )
    return out
  }

  private async loadDeployments(cwd: string, repo: string): Promise<PrSection[]> {
    const [dep, runs] = await Promise.all([prService.deployments(cwd), prService.runs(cwd)])
    const out: PrSection[] = [{ kind: 'repo-label', key: 'repo', repo }]

    out.push({ kind: 'section-head', key: 'dep-head', label: UITexts.Pr.deployments })
    if (!dep.ok) {
      out.push({ kind: 'empty', key: 'dep-err', text: dep.error || 'Failed to load deployments.' })
    } else if (!dep.deployments.length) {
      out.push({ kind: 'empty', key: 'dep-empty', text: 'No deployments.' })
    } else {
      for (const d of dep.deployments) out.push({ kind: 'deploy', key: `deploy:${d.id}`, d })
      this.alerts.noteDeploys(dep.deployments)
      this.busy ||= hasActiveDeploy(dep.deployments)
    }

    out.push({ kind: 'section-head', key: 'run-head', label: UITexts.Pr.workflowRuns })
    if (!runs.ok) {
      out.push({ kind: 'empty', key: 'run-err', text: runs.error || 'Failed to load runs.' })
    } else if (!runs.runs.length) {
      out.push({ kind: 'empty', key: 'run-empty', text: 'No workflow runs.' })
    } else {
      for (const r of runs.runs) out.push({ kind: 'run', key: `run:${cwd}:${r.id}`, run: r, cwd })
      this.alerts.noteRuns(runs.runs)
      this.busy ||= hasActiveRun(runs.runs)
    }
    return out
  }

  private async loadAllPrs(): Promise<PrSection[]> {
    const paths = settings.prProjects
    if (!paths.length) {
      return [
        {
          kind: 'empty',
          key: 'no-projects',
          text: 'No projects added yet. Click “+ Add projects” to choose repositories.'
        }
      ]
    }
    const res = await prService.listAll(settings.codeRoot, paths)
    if (!res.ok) return [{ kind: 'empty', key: 'all-pr-err', text: res.error || 'Failed to load PRs.' }]
    const branch = this.activeBranch()
    const activePath = this.activeCwd()
    const out: PrSection[] = []
    for (const proj of res.projects) {
      out.push({ kind: 'section-head', key: `head:${proj.path}`, label: proj.name, title: proj.repo })
      if (!proj.prs.length) {
        out.push({ kind: 'empty', key: `empty:${proj.path}`, text: 'No open pull requests.', group: true })
        continue
      }
      for (const pr of proj.prs) {
        const isCurrent = proj.path === activePath && !!branch && pr.headRefName === branch
        out.push({ kind: 'pr', key: `pr:${proj.path}#${pr.number}`, pr, cwd: proj.path, isCurrent })
      }
    }
    const all = res.projects.flatMap((proj) =>
      proj.prs.map((p) => ({ key: `${proj.repo}#${p.number}`, number: p.number, title: p.title, state: p.checks.state }))
    )
    this.busy ||= all.some((p) => p.state === 'pending')
    this.alerts.noteChecks(all)
    return out
  }

  private async loadAllDeploys(): Promise<PrSection[]> {
    const paths = settings.prProjects
    if (!paths.length) {
      return [
        {
          kind: 'empty',
          key: 'no-projects',
          text: 'No projects added yet. Click “+ Add projects” to choose repositories.'
        }
      ]
    }
    const res = await prService.deploysAll(settings.codeRoot, paths)
    if (!res.ok) return [{ kind: 'empty', key: 'all-dep-err', text: res.error || 'Failed to load deployments.' }]
    const out: PrSection[] = []
    for (const proj of res.projects) {
      out.push({ kind: 'section-head', key: `head:${proj.path}`, label: proj.name })
      if (!proj.deployments.length && !proj.runs.length) {
        out.push({ kind: 'empty', key: `empty:${proj.path}`, text: 'No deployments or runs.', group: true })
        continue
      }
      for (const d of proj.deployments) out.push({ kind: 'deploy', key: `deploy:${d.id}`, d })
      for (const r of proj.runs.slice(0, 5)) out.push({ kind: 'run', key: `run:${proj.path}:${r.id}`, run: r, cwd: proj.path })
    }
    const allDeploys = res.projects.flatMap((proj) => proj.deployments)
    const allRuns = res.projects.flatMap((proj) => proj.runs)
    this.busy ||= hasActiveDeploy(allDeploys) || hasActiveRun(allRuns)
    this.alerts.noteDeploys(allDeploys)
    this.alerts.noteRuns(allRuns)
    return out
  }

  // --- card actions ---

  openDiff(cwd: string, prNumber: number): void {
    openPrDiff(cwd, prNumber, `PR #${prNumber}`)
  }

  async merge(pr: PullRequest, cwd: string): Promise<void> {
    const ok = await promptConfirm({
      title: UITexts.Pr.merge.title(pr.number),
      message: UITexts.Pr.merge.message(pr.title, pr.baseRefName),
      confirmText: UITexts.Pr.merge.confirm
    })
    if (!ok) return
    const r = await prService.merge(cwd, pr.number, 'squash')
    if (!r.ok) showTextModal(UITexts.Pr.merge.failed, r.error || UITexts.Pr.unknownError)
    else pushNotification('', `PR #${pr.number} merged`, 'pr', pr.title)
    void this.reload()
  }

  async showRunJobs(cwd: string, run: WorkflowRun): Promise<void> {
    const raw = await prService.runJobs(cwd, run.id)
    showTextModal(`Run · ${run.name}`, formatRunJobs(raw) ?? raw)
  }

  // --- background poll (only while the PR tab is visible) ---

  setTabVisible(visible: boolean): void {
    this.tabVisible = visible
    if (visible) {
      void this.poll()
    } else if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private scheduleNextPoll(): void {
    if (!this.tabVisible) return
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer)
    this.pollTimer = window.setTimeout(() => void this.poll(), this.busy ? POLL_BUSY_MS : POLL_IDLE_MS)
  }

  private poll = async (): Promise<void> => {
    if (!this.tabVisible) return
    await this.reload() // re-reads the active cwd, so a repo change is handled for free
    this.scheduleNextPoll()
  }
}

export default new PrStore()
