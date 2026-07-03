import { Component } from '@geajs/core'

export interface AppRunCommandRowProps {
  name: string
  command: string
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onDelete: () => void
}

// One optional named menu command tied to an application: a name input, a shell
// command input, and a remove button. Rendered as a keyed `.map()` item root (a
// child Component). Inputs are UNCONTROLLED — seeded in onAfterRender and read on
// change — and swallow keydown so the app's global keybindings don't fire while
// typing (mirrors the legacy onKeydown stopPropagation).
export default class AppRunCommandRow extends Component {
  declare props: AppRunCommandRowProps
  private nameEl: HTMLInputElement | null = null
  private cmdEl: HTMLInputElement | null = null

  onAfterRender(): void {
    if (this.nameEl) this.nameEl.value = this.props.name
    if (this.cmdEl) this.cmdEl.value = this.props.command
  }

  private stop = (e: KeyboardEvent): void => e.stopPropagation()

  template({ onNameChange, onCommandChange, onDelete }: this['props']) {
    return (
      <div class="settings-app-rc-row">
        <input
          type="text"
          placeholder="name"
          ref={this.nameEl}
          onKeyDown={this.stop}
          onChange={(e: Event) => onNameChange((e.target as HTMLInputElement).value)}
        />
        <input
          type="text"
          placeholder="shell command"
          ref={this.cmdEl}
          onKeyDown={this.stop}
          onChange={(e: Event) => onCommandChange((e.target as HTMLInputElement).value)}
        />
        <button class="settings-app-delete" title="Remove command" onClick={onDelete}>
          {'✕'}
        </button>
      </div>
    )
  }
}
