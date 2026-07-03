import { Component } from '@geajs/core'

export interface FeatureRowProps {
  name: string
  onNameChange: (v: string) => void
  onDelete: () => void
}

// One feature label under a project (a time-tracking label): an editable name plus
// a remove button. Rendered as a keyed `.map()` item root (a child Component). The
// name input is UNCONTROLLED — seeded in onAfterRender, read on change — and swallows
// keydown so global keybindings don't fire while typing.
export default class FeatureRow extends Component {
  declare props: FeatureRowProps
  private nameEl: HTMLInputElement | null = null

  onAfterRender(): void {
    if (this.nameEl) this.nameEl.value = this.props.name
  }

  private stop = (e: KeyboardEvent): void => e.stopPropagation()

  template({ onNameChange, onDelete }: this['props']) {
    return (
      <div class="feat-row">
        <input
          type="text"
          placeholder="feature name"
          ref={this.nameEl}
          onKeyDown={this.stop}
          onChange={(e: Event) => onNameChange((e.target as HTMLInputElement).value)}
        />
        <button class="feat-del" title="Remove feature" onClick={onDelete}>
          {'✕'}
        </button>
      </div>
    )
  }
}
