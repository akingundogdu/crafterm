import '@ui/screens/reminders/reminders.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import ReminderCard from './components/reminder-card'
import store from './reminders.store'

// gea Reminders panel: upcoming reminders then a past (fired) section, reactive
// off the store. Mounted by legacy renderReminders into #reminder-list. Both card
// lists are rendered unconditionally (empty hint as a sibling); sorting happens
// on plain copies in the view, not in a store getter.
export default class Reminders extends Component {
  created(): void {
    store.reload()
  }

  template() {
    const upcoming = [...store.items].filter((r) => r.enabled).sort((a, b) => a.time - b.time)
    const past = [...store.items]
      .filter((r) => !r.enabled && r.firedAt)
      .sort((a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0))
    const empty = upcoming.length === 0 && past.length === 0
    return (
      <div class="reminders-root" style={{ display: 'contents' }}>
        {upcoming.map((r) => (
          <ReminderCard key={r.id} reminder={r} past={false} />
        ))}
        {past.length > 0 && <div class="notif-section">{UITexts.Reminders.pastSection}</div>}
        {past.map((r) => (
          <ReminderCard key={r.id} reminder={r} past={true} />
        ))}
        {empty && <div class="notif-empty">{UITexts.Reminders.empty}</div>}
      </div>
    )
  }
}
