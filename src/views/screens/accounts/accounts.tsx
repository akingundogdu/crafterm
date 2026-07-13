import './accounts.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { accountRepo } from '@repositories'
import AccountCard from './components/account-card'
import store from './accounts.store'

type KindFilter = 'all' | 'account' | 'secret'

// gea Accounts sidebar mode: kind filter chips + a keyed card list, reactive off
// the store. Mounted into #tab-list by the legacy renderAccounts entry. The list
// is rendered unconditionally (empty hint as a sibling) per plan §5.2.
export default class Accounts extends Component {
  created(): void {
    store.reload()
  }

  template() {
    // Sort a plain copy outside the store getter (sorting inside a gea getter
    // breaks its reactivity — see accounts.store).
    const items = [...store.filtered].sort((a, b) => b.updatedAt - a.updatedAt)
    const kinds: { k: KindFilter; label: string }[] = [
      { k: 'all', label: UITexts.Accounts.filter.all },
      { k: 'account', label: UITexts.Accounts.filter.accounts },
      { k: 'secret', label: UITexts.Accounts.filter.secrets }
    ]
    return (
      <div class="accounts-root" style={{ display: 'contents' }}>
        <div class="accounts-filters">
          {kinds.map((kf) => (
            <button
              key={kf.k}
              class={'bookmarks-filter' + (kf.k === store.kindFilter ? ' active' : '')}
              onClick={() => store.setKind(kf.k)}
            >
              {kf.label}
            </button>
          ))}
        </div>
        <div class="accounts-list">
          {items.map((a) => (
            <AccountCard key={a.id} entry={a} />
          ))}
        </div>
        {items.length === 0 && (
          <div class="empty-hint">
            {accountRepo.getAll().length === 0 ? UITexts.Accounts.emptyNone : UITexts.Accounts.emptyNoMatches}
          </div>
        )}
      </div>
    )
  }
}

// Legacy sidebar entry wrappers (re-exported by the @ui shim so existing
// consumers keep their imports). The gea panel mounts into the #tab-list host;
// the shared sidebar search bridges into the reactive store filter.
export function renderAccounts(): void {
  const el = document.getElementById('tab-list')!
  el.replaceChildren()
  el.className = 'tab-list accounts-list-wrap'
  new Accounts().render(el)
}

export function accountsApplyQuery(q: string): void {
  store.setQuery(q)
  renderAccounts()
}
