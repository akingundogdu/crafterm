import { UITexts } from '@texts'

type AccountKindFilter = 'all' | 'account' | 'secret'

// Kind filter chip bar for the accounts list (all / accounts / secrets). Pure
// factory: the active filter and per-chip click handler are injected.
export function accountFilters(opts: {
  active: AccountKindFilter
  onSelect: (kind: AccountKindFilter) => () => void
}): HTMLElement {
  return (
    <div class="accounts-filters">
      {(['all', 'account', 'secret'] as const).map((k) => (
        <button
          class={'bookmarks-filter' + (k === opts.active ? ' active' : '')}
          onClick={opts.onSelect(k)}
        >
          {k === 'all'
            ? UITexts.Accounts.filter.all
            : k === 'account'
              ? UITexts.Accounts.filter.accounts
              : UITexts.Accounts.filter.secrets}
        </button>
      ))}
    </div>
  ) as HTMLDivElement
}
