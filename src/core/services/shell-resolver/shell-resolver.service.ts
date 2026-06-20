import { env } from '@configs/environment-variables'
import { readDefaultShell } from './shell-resolver.utils'

// Main-side resolver for the shell used to spawn terminals / run command scripts.
// Precedence: explicit (renderer-supplied, already folds in a per-project override)
// → global `defaultShell` setting → $SHELL → /bin/zsh.
export function resolveShell(explicit?: string): string {
  return explicit?.trim() || readDefaultShell() || env.shell() || '/bin/zsh'
}
