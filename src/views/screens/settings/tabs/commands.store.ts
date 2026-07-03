import { Store } from '@geajs/core'
import { paletteCommandRepo } from '@repositories'
import { settings } from '@views/state/spine'
import type { PaletteCommand } from '@views/types/types'

// Reactive lists for the two dynamic Commands sub-tabs (Cmd+Shift+P palette entries
// and the Cmd+O markdown folders). Both fields are read directly in the control
// views' JSX children, so gea re-renders them after an add / edit / delete — the
// ssh.store / daily-plan.store pattern. A bare rev counter (`void store.rev`) is NOT
// tracked by the gea compiler, so each mutated list must be a real reactive field the
// template actually reads. Raw repo/settings arrays are spread into fresh arrays so a
// reassignment (not an in-place mutation of a proxy) drives the re-render.
class CommandsStore extends Store {
  paletteCommands: PaletteCommand[] = []
  mdFolders: string[] = []

  reloadPalette(): void {
    this.paletteCommands = [...paletteCommandRepo.getAll()]
  }

  reloadFolders(): void {
    this.mdFolders = [...settings.commands.mdFolders]
  }
}

export default new CommandsStore()
