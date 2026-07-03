import { Component } from '@geajs/core'

export interface EnvironmentChipsProps {
  environments: string[]
  selected: string
  onSelect: (name: string) => void
}

// Environment button bar: one chip per environment, the selected one marked
// `active`. Clicking a chip reports the new selection via `onSelect`; the owning
// reactive section re-renders with the updated `selected`, so the active class is
// derived from props rather than toggled imperatively. Rendered as a JSX child, so
// gea populates `this.props`.
export default class EnvironmentChips extends Component {
  declare props: EnvironmentChipsProps

  template({ environments, selected, onSelect }: this['props']) {
    return (
      <div class="run-env-bar">
        {environments.map((name) => (
          <button
            key={name}
            class={'run-env-chip' + (name === selected ? ' active' : '')}
            onClick={() => onSelect(name)}
          >
            {name}
          </button>
        ))}
      </div>
    )
  }
}
