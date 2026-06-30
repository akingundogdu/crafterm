import { Component } from '@geajs/core'
import '@views/screens/reminders/reminders.css'
import { UITexts } from '@texts'
import { createDateField, type DateField } from '@views/components/datepicker/datepicker'
import store, { quickPresets, toLocalInput } from './reminder-form.store'

// gea reminder add/edit form body, mounted into the @views overlay by
// openReminderForm. The datetime is an imperative DateField widget held as a plain
// instance prop (NOT in the store, to avoid gea proxying the DOM node) and embedded
// via a ref; the quick presets write into it and the save handler reads its value.
// The repeat <select> + type <select> are inlined (no reusable wrapper, §5.9).
// Self-contained — no @ui (§2.7).
export default class ReminderForm extends Component {
  private whenField: DateField | null = null

  created(): void {
    this.whenField = createDateField({
      mode: 'datetime',
      value: store.initialWhen,
      className: 'reminder-input'
    })
  }

  private save = (): void => {
    const ts = this.whenField ? new Date(this.whenField.value).getTime() : NaN
    store.save(ts)
  }

  private applyPreset(ts: number): void {
    if (this.whenField) this.whenField.value = toLocalInput(ts)
  }

  template() {
    const t = UITexts.Reminders.form
    return (
      <div
        class="modal reminder-modal"
        tabIndex={-1}
        onKeyDown={(e: KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Escape') store.close()
        }}
      >
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{store.titleText}</h2>

        <div class="reminder-label">{t.labelWhen}</div>
        <div ref={(host: HTMLElement) => this.whenField && host.appendChild(this.whenField)} />
        <div class="reminder-quick">
          {quickPresets().map((p) => (
            <button key={p.label} class="reminder-preset" onClick={() => this.applyPreset(p.at())}>
              {p.label}
            </button>
          ))}
        </div>

        <div class="reminder-label">{t.labelReminder}</div>
        <textarea
          class="reminder-input reminder-textarea"
          rows={4}
          placeholder={t.textPlaceholder}
          onInput={(e: Event) => (store.text = (e.target as HTMLTextAreaElement).value)}
        >
          {store.text}
        </textarea>

        <div class="reminder-label">{t.labelType}</div>
        <select
          class="settings-select"
          disabled={!!store.existing}
          onChange={(e: Event) =>
            (store.category = (e.target as HTMLSelectElement).value as typeof store.category)
          }
        >
          <option value="normal" selected={store.category === 'normal'}>
            {t.type.normal}
          </option>
          <option value="bookmark" selected={store.category === 'bookmark'}>
            {t.type.bookmark}
          </option>
          <option value="link" selected={store.category === 'link'}>
            {t.type.link}
          </option>
          <option value="dailyTask" selected={store.category === 'dailyTask'}>
            {t.type.dailyTask}
          </option>
        </select>

        <div class="reminder-label">{t.labelRepeat}</div>
        <div class="reminder-quick">
          <select
            class="settings-select"
            onChange={(e: Event) =>
              (store.repeat = (e.target as HTMLSelectElement).value as typeof store.repeat)
            }
          >
            <option value="none" selected={store.repeat === 'none'}>
              {t.repeat.none}
            </option>
            <option value="daily" selected={store.repeat === 'daily'}>
              {t.repeat.daily}
            </option>
            <option value="weekly" selected={store.repeat === 'weekly'}>
              {t.repeat.weekly}
            </option>
            <option value="biweekly" selected={store.repeat === 'biweekly'}>
              {t.repeat.biweekly}
            </option>
            <option value="monthly" selected={store.repeat === 'monthly'}>
              {t.repeat.monthly}
            </option>
            <option value="interval" selected={store.repeat === 'interval'}>
              {t.repeat.interval}
            </option>
          </select>
          {store.repeat === 'interval' && (
            <input
              type="number"
              class="reminder-input reminder-interval"
              min="1"
              value={String(store.intervalMin)}
              onInput={(e: Event) =>
                (store.intervalMin = parseInt((e.target as HTMLInputElement).value, 10) || 30)
              }
            />
          )}
        </div>

        <div class="modal-actions">
          <button type="button" onClick={() => store.close()}>
            {t.cancel}
          </button>
          <button type="button" class="button-primary" onClick={this.save}>
            {store.saveLabel}
          </button>
        </div>
      </div>
    )
  }
}
