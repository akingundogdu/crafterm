import './update.css'
import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { promptConfirm } from '@views/components/dialog/confirm'
import { deployService } from '@services'
import { pickFolderPath } from '../folder/folder'
import { UITexts } from '@texts'
import type { UpdateStep } from './update.types'
import { resolveUpdateCommand } from './update.state'
import { updateStepRow } from './components/update-step-row'

export type { UpdateStep } from './update.types'

// ---------------------------------------------------------------------------
// Update Crafterm (self-update): save state, rebuild from the source repo, and
// relaunch. The build runs in the main process (progress shown here); only the
// quit → swap → relaunch step is detached so it survives the app quitting.
// ---------------------------------------------------------------------------
export async function runUpdate(): Promise<void> {
  // 1. Resolve the source repo (ask once on first use, then remember it).
  let repo = settings.repoPath.trim()
  if (!repo) {
    const picked = await pickFolderPath()
    if (!picked) return
    repo = picked
    settings.repoPath = repo
    persistence.save()
  }

  // 2. Confirm — this restarts the app.
  const ok = await promptConfirm({
    title: 'Update Crafterm',
    message:
      'Rebuild Crafterm from source and restart? Your layout, working directories, and Claude sessions are restored automatically; running processes restart.',
    confirmText: UITexts.Pickers.update.confirm
  })
  if (!ok) return

  // 3. Progress modal (no backdrop dismiss — it tracks an in-flight update).
  const { overlay, mount, close } = createOverlay({ closeOnBackdrop: false })
  const list = el('div', { class: 'update-steps' })
  const modal = el(
    'div',
    { class: 'modal update-modal' },
    el('h2', null, UITexts.Pickers.update.heading),
    list
  )
  overlay.appendChild(modal)
  mount()

  const step = (label: string): UpdateStep => updateStepRow({ label, list, modal, onClose: close })

  // Save sessions (flush synchronously) so the relaunch restores them.
  const s1 = step('Saving sessions…')
  persistence.flush()
  s1.done()

  // Build the new bundle (runs in main; can take a while).
  const s2 = step('Building new bundle…')
  const res = await deployService.build(repo, resolveUpdateCommand())
  if (!res.ok) {
    s2.fail(res.error || 'Build failed. See ~/.crafterm/deploy.log for details.')
    return
  }
  s2.done()

  // Close every session and wait for each PTY to actually exit BEFORE quitting.
  // Killing PTYs during the quit teardown races node-pty's exit callbacks and
  // crashes the process; draining here, while the app is still healthy, avoids
  // that. Children that ignore SIGHUP are force-killed after 5s in the main
  // process, so this resolves promptly.
  const s3 = step('Closing sessions…')
  await deployService.killAllPtys()
  s3.done()

  // Swap the installed app + relaunch (detached); the app quits right after.
  step('Restarting…')
  await deployService.swap(repo)
}
