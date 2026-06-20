import { settings, uid } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptForm } from '@ui/dialog/dialog'
import { paletteCommandRepo } from '@repositories'
import type { PaletteCommand } from '@ui/types/types'

export function saveIdeCommand(v: string): void {
  settings.commands.ide = v.trim() || 'ide'
  persistence.save()
}

export function saveOpenMyZsh(v: string): void {
  settings.commands.openMyZsh = v.trim() || 'openmyzsh'
  persistence.save()
}

// Distinct command categories, alphabetically sorted (in first-seen order before sort).
export function paletteCategories(cmds: PaletteCommand[]): string[] {
  const cats: string[] = []
  for (const c of cmds) if (!cats.includes(c.category)) cats.push(c.category)
  cats.sort((a, b) => a.localeCompare(b))
  return cats
}

export function allPaletteCommands(): PaletteCommand[] {
  return paletteCommandRepo.getAll()
}

export function removePaletteCommand(id: string): void {
  paletteCommandRepo.remove(id)
}

// Add or edit one palette command via the shared form modal.
export async function editPaletteCommand(existing?: PaletteCommand): Promise<void> {
  const values = await promptForm({
    title: existing ? UITexts.Settings.commands.editCommand : UITexts.Settings.commands.newCommand,
    fields: [
      { key: 'category', label: UITexts.Settings.commands.category, value: existing?.category, placeholder: 'predefined, git, linux…' },
      { key: 'name', label: UITexts.Settings.commands.name, value: existing?.name, placeholder: 'short label' },
      { key: 'command', label: UITexts.Settings.commands.command, value: existing?.command, placeholder: 'git status' }
    ],
    confirmText: existing ? UITexts.Settings.commands.save : UITexts.Settings.commands.add
  })
  if (!values) return // cancelled, or category (required first field) left empty
  const command = (values.command || '').trim()
  if (!command) return
  const cmd: PaletteCommand = {
    id: existing?.id ?? uid('pc'),
    category: (values.category || '').trim().toLowerCase() || 'predefined',
    name: (values.name || '').trim() || command,
    command
  }
  paletteCommandRepo.upsert(cmd)
}

export function prettyMdPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

export function removeMdFolder(idx: number): void {
  settings.commands.mdFolders.splice(idx, 1)
  persistence.save()
}

// Adds a markdown folder (deduped). Returns false when already present.
export function addMdFolder(picked: string): boolean {
  if (settings.commands.mdFolders.includes(picked)) return false
  settings.commands.mdFolders.push(picked)
  persistence.save()
  return true
}
