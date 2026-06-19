import { handle } from '@services/channels.main'
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
  handle('secrets:set', ({ entryId, key, value }) => setSecret(secretsDir(), entryId, key, value))
  handle('secrets:get', ({ entryId, key }) => getSecret(secretsDir(), entryId, key))
  handle('secrets:delete', ({ entryId, key }) => deleteSecret(secretsDir(), entryId, key))
  handle('secrets:available', () => isSecretsAvailable())
}
