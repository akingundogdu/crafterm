import { el } from '@views/lib/dom'
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
  const color = el('input', { type: 'color', onInput: () => apply(color.value) })
  color.value = toHex6(value)
  const hex = el('input', { type: 'text', onChange: () => apply(hex.value) })
  hex.value = value
  const apply = (v: string): void => {
    color.value = toHex6(v)
    hex.value = v
    onApply(key, v)
  }
  return el('div', { class: 'color-row' }, el('label', null, key), color, hex)
}
