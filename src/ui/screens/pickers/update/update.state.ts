import { settings } from '@ui/state/state'

// The deploy command to rebuild from source, falling back to the default script.
export function resolveUpdateCommand(): string {
  return settings.updateCommand.trim() || 'run-crafterm-deploy'
}
