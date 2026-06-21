import { toHex6 } from '../../shared'

interface ColorRowProps {
  key: string
  value: string
  onApply: (key: string, value: string) => void
}

// One labeled color picker + hex input row. The two inputs stay in sync: a
// change to either applies via onApply and reflects into the other.
export function buildColorRow(props: ColorRowProps): HTMLDivElement {
  const { key, value, onApply } = props
  const color = (
    <input
      type="color"
      ref={(el: HTMLInputElement) => {
        el.value = toHex6(value)
      }}
      onInput={() => apply(color.value)}
    />
  ) as HTMLInputElement
  const hex = (
    <input
      type="text"
      ref={(el: HTMLInputElement) => {
        el.value = value
      }}
      onChange={() => apply(hex.value)}
    />
  ) as HTMLInputElement
  const apply = (v: string): void => {
    color.value = toHex6(v)
    hex.value = v
    onApply(key, v)
  }
  return (
    <div class="color-row">
      <label>{key}</label>
      {color}
      {hex}
    </div>
  ) as HTMLDivElement
}
