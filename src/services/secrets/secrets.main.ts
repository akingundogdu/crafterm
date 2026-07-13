import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { join } from 'path'
import { setSecret, getSecret, deleteSecret, isSecretsAvailable } from '@core/services/secrets/secrets.service'
import { stateDir } from '@core/services/paths/paths.service'

// Secrets IPC adapter (secrets:*): safeStorage-encrypted secrets live under
// <stateDir>/secrets; the crypto operations are in @core/services/secrets. These
// handlers resolve the base dir and delegate.
export class SecretsController extends BaseService {
  readonly name = 'secrets'

  private secretsDir(): string {
    return join(stateDir(), 'secrets')
  }

  register(): void {
    this.handle(Channel.Secrets.Set, ({ entryId, key, value }) =>
      setSecret(this.secretsDir(), entryId, key, value)
    )
    this.handle(Channel.Secrets.Get, ({ entryId, key }) => getSecret(this.secretsDir(), entryId, key))
    this.handle(Channel.Secrets.Delete, ({ entryId, key }) =>
      deleteSecret(this.secretsDir(), entryId, key)
    )
    this.handle(Channel.Secrets.Available, () => isSecretsAvailable())
  }
}

