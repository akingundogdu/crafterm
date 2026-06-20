import { settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'

// Input handler: persists the Crafterm source checkout path (trimmed).
export function makeSaveRepoPath(): (v: string) => void {
  return (v) => {
    settings.repoPath = v.trim()
    persistence.save()
  }
}

// Input handler: persists the update command, defaulting to `run-crafterm-deploy`.
export function makeSaveUpdateCommand(): (v: string) => void {
  return (v) => {
    settings.updateCommand = v.trim() || 'run-crafterm-deploy'
    persistence.save()
  }
}
