import { settings, uid } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptForm } from '@ui/dialog/dialog'
import { BUILTIN_ACTIONS } from '@ui/types/types'
import type { ActionMenuItem } from '@ui/types/types'
import { actionMenuRepo } from '@repositories'

export function builtinLabel(id?: string): string {
  return BUILTIN_ACTIONS.find((a) => a.id === id)?.label ?? '(unknown builtin)'
}

// Positional swap — ordering isn't expressible through the CRUD repo, so the
// physical array is reordered in place and persisted directly. Returns false
// when the move is out of bounds.
export function moveActionItem(i: number, delta: number): boolean {
  const arr = actionMenuRepo.getAll()
  const j = i + delta
  if (j < 0 || j >= arr.length) return false
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  persistence.save()
  return true
}

export function toggleActionHidden(item: ActionMenuItem): void {
  item.hidden = !item.hidden
  actionMenuRepo.upsert(item)
}

export function removeActionItem(id: string): void {
  actionMenuRepo.remove(id)
}

export function addActionItem(item: ActionMenuItem): void {
  actionMenuRepo.upsert(item)
}

export function resetActionMenu(): void {
  settings.actionMenu = BUILTIN_ACTIONS.map((a) => ({
    id: uid('am'),
    title: a.label,
    kind: 'builtin' as const,
    builtinId: a.id
  }))
  persistence.save()
}

// Edit an existing action item in place (returns null), or create a new command
// item (returns it). Builtin items only allow renaming; command items get a
// command + placement.
export async function editActionItem(existing?: ActionMenuItem): Promise<ActionMenuItem | null> {
  const isBuiltin = existing?.kind === 'builtin'
  const values = await promptForm({
    title: existing ? UITexts.Settings.actionMenu.editAction : UITexts.Settings.actionMenu.newAction,
    fields: isBuiltin
      ? [{ key: 'title', label: UITexts.Settings.actionMenu.title, value: existing?.title, placeholder: 'menu label' }]
      : [
          { key: 'title', label: UITexts.Settings.actionMenu.title, value: existing?.title, placeholder: UITexts.Settings.actionMenu.titlePlaceholder },
          { key: 'command', label: UITexts.Settings.actionMenu.command, value: existing?.command, placeholder: 'npm run deploy' },
          { key: 'opensAs', label: UITexts.Settings.actionMenu.opensAs, value: existing?.opensAs ?? 'tab', placeholder: 'tab' }
        ],
    confirmText: existing ? UITexts.Settings.actionMenu.save : UITexts.Settings.actionMenu.add
  })
  if (!values) return null
  const title = (values.title || '').trim()
  if (!title) return null
  if (existing) {
    existing.title = title
    if (!isBuiltin) {
      existing.command = (values.command || '').trim()
      existing.opensAs = (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
    }
    persistence.save()
    return null
  }
  const command = (values.command || '').trim()
  if (!command) return null
  return {
    id: uid('am'),
    title,
    kind: 'command',
    command,
    opensAs: (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
  }
}
