import { UITexts } from '@texts'
import type { AccountEntry, AccountField } from '@ui/types/types'
import { accountRepo } from '@repositories'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { secretsService } from '@services'
import { showAccountForm } from './components/account-form'

// Account/secret ledger logic: filter state, clipboard, and every card/toolbar
// action handler. The view owns DOM construction and injects its `rerender`
// (renderAccounts) so handlers stay here without an import cycle.

let query = ''
let kindFilter: 'all' | 'account' | 'secret' = 'all'

export function currentKindFilter(): 'all' | 'account' | 'secret' {
  return kindFilter
}

export function setQuery(q: string): void {
  query = q
}

export function filterEntries(): AccountEntry[] {
  const q = query.trim().toLowerCase()
  return accountRepo
    .getAll()
    .filter((a) => kindFilter === 'all' || a.kind === kindFilter)
    .filter((a) => {
      if (!q) return true
      const hay = [a.label, a.service, a.login, a.url, a.notes, a.tags.join(' '), ...(a.fields ?? []).map((f) => f.key)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function copyToClipboard(text: string, btn: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text)
  const prev = btn.textContent
  btn.textContent = UITexts.Accounts.copied
  setTimeout(() => (btn.textContent = prev), 1100)
}

export function makeFilterClick(k: 'all' | 'account' | 'secret', rerender: () => void): () => void {
  return () => {
    kindFilter = k
    rerender()
  }
}

export function makeEditClick(a: AccountEntry): () => void {
  return () => showAccountForm(a)
}

export function makeDeleteClick(a: AccountEntry, rerender: () => void): () => Promise<void> {
  return async () => {
    const ok = await promptConfirm({
      title: UITexts.Accounts.deleteTitle,
      message: a.label,
      confirmText: UITexts.Accounts.deleteConfirm
    })
    if (!ok) return
    accountRepo.remove(a.id)
    await secretsService.delete(a.id)
    rerender()
  }
}

export function makeMetaCopyClick(value: string): (e: Event) => void {
  return (e) => void copyToClipboard(value, e.currentTarget as HTMLButtonElement)
}

export function makeFieldCopyClick(a: AccountEntry, f: AccountField): (e: Event) => Promise<void> {
  return async (e) => {
    const copy = e.currentTarget as HTMLButtonElement
    let v = f.value ?? ''
    if (f.secret) {
      const stored = await secretsService.get(a.id, f.key)
      if (stored == null) {
        copy.textContent = UITexts.Accounts.unavailable
        setTimeout(() => (copy.textContent = 'Copy'), 1100)
        return
      }
      v = stored
    }
    void copyToClipboard(v, copy)
  }
}

export function makeRevealClick(a: AccountEntry, f: AccountField, val: HTMLElement): (e: Event) => Promise<void> {
  return async (e) => {
    const reveal = e.currentTarget as HTMLButtonElement
    if (val.classList.contains('shown')) {
      val.textContent = '••••••••'
      val.classList.remove('shown')
      reveal.textContent = UITexts.Accounts.show
      return
    }
    const stored = await secretsService.get(a.id, f.key)
    val.textContent = stored ?? UITexts.Accounts.notStored
    val.classList.add('shown')
    reveal.textContent = UITexts.Accounts.hide
  }
}

export function makeNewEntryClick(kind: 'account' | 'secret'): () => void {
  return () => showAccountForm(undefined, kind)
}

export function makeSettingsClick(): () => void {
  // settings.openSettings is routed via the existing settings button to avoid an
  // import cycle with main.ts.
  return () => {
    document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
  }
}
