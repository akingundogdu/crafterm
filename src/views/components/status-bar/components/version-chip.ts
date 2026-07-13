import { settings } from '@views/state/spine'
import { appService } from '@services'
import { runUpdate } from '@views/screens/pickers/update/update'
import { UITexts } from '@texts'
import { VERSION_POLL_MS } from '../status-bar.store'

// Status bar version chip: shows the installed app version (base + git commit
// count it was built from) and flags "redeploy needed" when the source repo has
// moved ahead of the running build — either new commits or uncommitted edits.
// Clicking runs the self-update (deploy) flow, or briefly confirms it's current.
export function initStatusbarVersion(): void {
  const chip = document.getElementById('statusbar-version')
  if (!chip) return
  const textEl = chip.querySelector('.version-text') as HTMLElement | null
  let base = '' // base semver from package.json (e.g. "0.1.0")
  let built: { commit: string | null; commitCount: number | null } | null = null
  let counter: number | null = null // monotonic save count for the source repo
  let needsRedeploy = false

  // The running build is stale when the repo's HEAD differs from what this build
  // was packaged from, or the repo has uncommitted changes (code changed but not
  // yet deployed). Skipped when there's no build info (dev) or no source repo.
  const evaluate = async (): Promise<void> => {
    const repo = settings.repoPath.trim()
    if (!repo || !built || !built.commit) {
      needsRedeploy = false
      chip.classList.remove('has-update')
      chip.title = base ? UITexts.Notifications.deployHint(base) : UITexts.Notifications.appName
      return
    }
    const repoGit = await appService.repoGit(repo)
    needsRedeploy = !!repoGit && (repoGit.commit !== built.commit || repoGit.dirty)
    chip.classList.toggle('has-update', needsRedeploy)
    if (needsRedeploy && repoGit) {
      const reason = repoGit.dirty ? 'uncommitted changes' : 'new commits'
      chip.title =
        `Redeploy needed — repo is ahead (${reason}).\n` +
        `Running build +${built.commitCount ?? '?'} → repo +${repoGit.commitCount}.\n` +
        `Click to rebuild & restart.`
    } else {
      chip.title = `Crafterm v${base}+${counter ?? built.commitCount ?? '?'} (up to date) · click to check`
    }
  }

  const refresh = async (): Promise<void> => {
    try {
      base = (await appService.version()) || ''
      built = await appService.buildInfo()
      const repo = settings.repoPath.trim()
      // The displayed "+N" is the live save counter (ticks up as code changes);
      // fall back to the built-from commit count when no source repo is set.
      counter = repo ? await appService.buildCounter(repo) : null
      if (textEl) {
        const n = counter ?? built?.commitCount ?? null
        const suffix = n != null ? `+${n}` : ''
        textEl.textContent = base ? `v${base}${suffix}` : 'v—'
      }
      await evaluate()
    } catch {
      // ignore — chip keeps its last value
    }
  }

  chip.addEventListener('click', async () => {
    await evaluate()
    // Source repo behind the running build (or none set yet): run the deploy flow.
    if (needsRedeploy || !settings.repoPath.trim()) {
      void runUpdate()
      return
    }
    // Up to date: flash a brief confirmation, then restore the version label.
    if (textEl) {
      const prev = textEl.textContent
      textEl.textContent = UITexts.Notifications.upToDate
      window.setTimeout(() => {
        if (textEl.textContent === UITexts.Notifications.upToDate) textEl.textContent = prev
      }, 1600)
    }
  })

  void refresh()
  // Re-read the counter and redeploy state periodically and on focus so saves
  // surface in the label without a manual click.
  window.setInterval(() => void refresh(), VERSION_POLL_MS)
  window.addEventListener('focus', () => void refresh())
}
