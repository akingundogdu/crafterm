import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import { UITexts } from '@texts'
import Input from '@views/components/input/input'
import Button from '@views/components/button/button'
import { createDateField, type DateField } from '@views/components/datepicker/datepicker'
import { flattenProjects } from '@views/catalog/catalog'
import shellStore from '@views/state/shell.store'
import store from './meeting-form.store'

// gea meeting-note add/edit form body, mounted into the @views overlay by
// openMeetingForm. The custom DateField is an imperative widget held as a plain
// instance prop (NOT in the store, to avoid gea proxying the DOM node) and embedded
// via a ref; its change event writes back to store.date. Project options read the
// shell-store tree mirror (the sanctioned spine bridge), so no @ui (§2.7).
export default class MeetingForm extends Component {
  private dateField: DateField | null = null
  private dateHost: HTMLDivElement | null = null

  created(): void {
    const field = createDateField({ mode: 'date', value: store.date })
    field.addEventListener('change', () => store.setDate(field.value))
    this.dateField = field
  }

  // gea callback refs (`ref={(el)=>…}`) don't fire in @geajs/core 1.3.0 — embed the
  // imperative DateField via a property ref + appendChild here (§5.11). Guarded so
  // re-renders re-attach (move) the same widget rather than duplicating it.
  onAfterRender(): void {
    if (this.dateHost && this.dateField && !this.dateHost.firstChild) this.dateHost.appendChild(this.dateField)
  }

  template() {
    const projects = flattenProjects(shellStore.tree)
    return (
      <div
        class="modal modal-prompt daily-plan-form"
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
        <div class="field">
          <label>{UITexts.MeetingNotes.form.fieldTitle}</label>
          <Input
            value={store.title}
            placeholder={UITexts.MeetingNotes.form.subjectPlaceholder}
            onInput={(e: Event) => (store.title = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>{UITexts.MeetingNotes.form.fieldDate}</label>
          <div ref={this.dateHost} />
        </div>
        <div class="field">
          <label>
            {UITexts.MeetingNotes.form.fieldAttendees}{' '}
            <span class="field-hint">{UITexts.MeetingNotes.form.attendeesHint}</span>
          </label>
          <Input
            value={store.attendees}
            placeholder={UITexts.MeetingNotes.form.attendeesPlaceholder}
            onInput={(e: Event) => (store.attendees = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>
            {UITexts.MeetingNotes.form.fieldProject}{' '}
            <span class="field-hint">{UITexts.MeetingNotes.form.projectHint}</span>
          </label>
          <select onChange={(e: Event) => (store.projectId = (e.target as HTMLSelectElement).value)}>
            <option value="" selected={store.projectId === ''}>
              {UITexts.MeetingNotes.form.noneOption}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} selected={p.id === store.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>{UITexts.MeetingNotes.form.fieldNotes}</label>
          <textarea
            class="daily-plan-desc-input meeting-notes-body"
            rows={8}
            placeholder={UITexts.MeetingNotes.form.notesPlaceholder}
            onInput={(e: Event) => (store.notes = (e.target as HTMLTextAreaElement).value)}
          >
            {store.notes}
          </textarea>
        </div>
        <div class="modal-actions">
          <Button text="Cancel" onClick={() => store.close()} />
          <Button text={UITexts.MeetingNotes.form.save} variant="primary" onClick={() => store.save()} />
        </div>
      </div>
    )
  }
}
