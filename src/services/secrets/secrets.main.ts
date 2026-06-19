import { ipcMain } from 'electron'
import { join } from 'path'
import { setSecret, getSecret, deleteSecret, isSecretsAvailable } from '@core/services/secrets.service'
import { stateDir } from '@core/services/paths'

// Secrets bridge (secrets:*): safeStorage-encrypted secrets live under
// <stateDir>/secrets; the crypto operations are in services/secrets.service.ts.
// These handlers resolve the base dir and delegate.
function secretsDir(): string {
  return join(stateDir(), 'secrets')
}

export function registerSecretsIpc(): void {
  ipcMain.handle(
    'secrets:set',
    (_e, { entryId, key, value }: { entryId: string; key: string; value: string }) =>
      setSecret(secretsDir(), entryId, key, value)
  )
  ipcMain.handle('secrets:get', (_e, { entryId, key }: { entryId: string; key: string }) =>
    getSecret(secretsDir(), entryId, key)
  )
  ipcMain.handle('secrets:delete', (_e, { entryId, key }: { entryId: string; key?: string }) =>
    deleteSecret(secretsDir(), entryId, key)
  )
  ipcMain.handle('secrets:available', () => isSecretsAvailable())
}
