import { settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { soundService } from '@services'
import { accountRepo } from '@repositories'

// macOS system sounds offered for the notification chime ('' = off).
export const SOUNDS = ['', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink']

export function saveCodeRoot(v: string): void {
  settings.codeRoot = v.trim()
  persistence.save()
}

export function saveDefaultShell(v: string): void {
  settings.defaultShell = v.trim()
  persistence.save()
}

export function saveCodeExtensions(v: string): void {
  settings.codeExtensions = v
    .split(/[\s,]+/)
    .map((e) => e.replace(/^\./, '').trim().toLowerCase())
    .filter((e) => /^[a-z0-9]+$/.test(e))
  persistence.save()
}

export function saveTodoFile(v: string): void {
  settings.todoFile = v.trim()
  persistence.save()
}

export function saveExplorerRoot(v: string): void {
  settings.explorerRoot = v.trim()
  persistence.save()
}

export function saveExplorerExclude(v: string): void {
  settings.explorerExclude = v
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  persistence.save()
}

export function saveKeychainService(v: string): void {
  settings.claudeUsageAuth.keychainService = v.trim() || 'Claude Code-credentials'
  persistence.save()
}

// Fallback secret options: every secret-typed Accounts field, value is the
// `entryId::fieldKey` pair the renderer decrypts at fetch time.
export function buildSecretOptions(): [string, string][] {
  const opts: [string, string][] = [['', 'None']]
  for (const a of accountRepo.getAll()) {
    for (const f of a.fields ?? []) {
      if (f.secret) opts.push([`${a.id}::${f.key}`, `${a.label} / ${f.key}`])
    }
  }
  return opts
}

export function currentFallbackSecret(): string {
  return settings.claudeUsageAuth.fallbackSecretId && settings.claudeUsageAuth.fallbackSecretKey
    ? `${settings.claudeUsageAuth.fallbackSecretId}::${settings.claudeUsageAuth.fallbackSecretKey}`
    : ''
}

export function saveFallbackSecret(v: string): void {
  if (!v) {
    settings.claudeUsageAuth.fallbackSecretId = ''
    settings.claudeUsageAuth.fallbackSecretKey = ''
  } else {
    const [id, key] = v.split('::')
    settings.claudeUsageAuth.fallbackSecretId = id
    settings.claudeUsageAuth.fallbackSecretKey = key
  }
  persistence.save()
}

// `change` handler for the notification sound select: persists + previews.
export function makeNotifSoundChange(sel: HTMLSelectElement): () => void {
  return () => {
    settings.notifSound = sel.value
    persistence.save()
    if (sel.value) soundService.play(sel.value) // preview
  }
}
