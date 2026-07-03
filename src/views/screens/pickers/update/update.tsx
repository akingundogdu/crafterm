import './update.css'
import { Component } from '@geajs/core'
import { createOverlay } from '@views/components/overlay/overlay'
import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { promptConfirm } from '@views/components/dialog/confirm'
import { deployService } from '@services'
import { pickFolderPath } from '../folder/folder'
import { UITexts } from '@texts'
import type { UpdateStep } from './update.types'
import { resolveUpdateCommand } from './update.state'
import store from './update.store'
import UpdateStepRow from './components/update-step-row'

export type { UpdateStep } from './update.types'

// ---------------------------------------------------------------------------
// Update Crafterm (self-update): save state, rebuild from the source repo, and
// relaunch. The build runs in the main process (progress shown here); only the
// quit → swap → relaunch step is detached so it survives the app quitting.
// ---------------------------------------------------------------------------

// Reactive body of the self-update modal: heading + the live progress step list,
// plus the error + Close button once a step fails. Rendered as a JSX child of
// UpdateShell so gea tracks its store reads and re-renders it as each async step
// advances (the board pattern). A top-level, imperatively mounted component
// (UpdateShell) does not re-subscribe on store writes, so all reactive markup
// lives here. Self-contained — no @ui.
class UpdateList extends Component {
  declare props: { close: () => void }

  template({ close }: this['props']) {
    // Subscribe to the reactive store fields so this child re-renders on every
    // step add / status change (store.steps + store.rev) and on failure (error).
    void store.rev
    const steps = store.steps
    const error = store.error

    return (
      <div class="modal update-modal">
        <h2>{UITexts.Pickers.update.heading}</h2>
        <div class="update-steps">
          {steps.map((s) => (
            <UpdateStepRow key={s.id} label={s.label} status={s.status} />
          ))}
        </div>
        {error !== null && <div class="update-error">{error}</div>}
        {error !== null && (
          <button class="primary" style="margin-top: 12px" onClick={close}>
            Close
          </button>
        )}
      </div>
    )
  }
}

// Thin shell for the self-update modal, mounted imperatively into the overlay.
// Data (the overlay's close fn) arrives via the constructor into a plain field — a
// gea Component only populates `this.props` when rendered from a parent template,
// not from a manual `new X()`. The reactive markup lives in the UpdateList child.
class UpdateShell extends Component {
  private readonly closeFn: () => void

  constructor(opts: { close: () => void }) {
    super()
    this.closeFn = opts.close
  }

  template() {
    return <UpdateList close={this.closeFn} />
  }
}

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
  store.reset()
  mount()
  new UpdateShell({ close }).render(overlay)

  // Each step pushes a reactive row into the store and returns handles that flip
  // its status (done / failed) — the list re-renders on every mutation.
  const step = (label: string): UpdateStep => {
    const id = store.addStep(label)
    return {
      done: () => store.markDone(id),
      fail: (msg) => store.markFailed(id, msg)
    }
  }

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
