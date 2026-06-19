import './update.css'
import { createButton, createOverlay } from '@ui/components'
import { settings, state } from '../../../state'
import { persistence } from '../../../services/storage/persistence.service'
import { promptConfirm } from '../../../dialog'
import { appService } from '../../../services/ipc'
import { pickFolderPath } from '../folder/folder'

// ---------------------------------------------------------------------------
// Update Crafterm (self-update): save state, rebuild from the source repo, and
// relaunch. The build runs in the main process (progress shown here); only the
// quit → swap → relaunch step is detached so it survives the app quitting.
// ---------------------------------------------------------------------------

type UpdateStep = { done: () => void; fail: (msg: string) => void }

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
    confirmText: 'Update & Restart'
  })
  if (!ok) return

  // 3. Progress modal (no backdrop dismiss — it tracks an in-flight update).
  const { overlay, mount, close } = createOverlay({ closeOnBackdrop: false })
  const modal = document.createElement('div')
  modal.className = 'modal update-modal'
  modal.insertAdjacentHTML('beforeend', '<h2>Updating Crafterm</h2>')
  const list = document.createElement('div')
  list.className = 'update-steps'
  modal.appendChild(list)
  overlay.appendChild(modal)
  mount()

  const step = (label: string): UpdateStep => {
    const row = document.createElement('div')
    row.className = 'update-step active'
    row.innerHTML = `<span class="update-dot"></span><span class="update-label"></span>`
    row.querySelector<HTMLElement>('.update-label')!.textContent = label
    list.appendChild(row)
    return {
      done: () => {
        row.classList.remove('active')
        row.classList.add('done')
      },
      fail: (msg) => {
        row.classList.remove('active')
        row.classList.add('failed')
        const e = document.createElement('div')
        e.className = 'update-error'
        e.textContent = msg
        modal.appendChild(e)
        const btn = createButton({ className: 'primary', text: 'Close', onClick: () => close() })
        btn.style.marginTop = '12px'
        modal.appendChild(btn)
      }
    }
  }

  // Save sessions (flush synchronously) so the relaunch restores them.
  const s1 = step('Saving sessions…')
  persistence.flush()
  s1.done()

  // Build the new bundle (runs in main; can take a while).
  const s2 = step('Building new bundle…')
  const cmd = settings.updateCommand.trim() || 'run-crafterm-deploy'
  const res = await appService.deployBuild(repo, cmd)
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
  await appService.deployKillAllPtys()
  s3.done()

  // Swap the installed app + relaunch (detached); the app quits right after.
  step('Restarting…')
  await appService.deploySwap(repo)
}

