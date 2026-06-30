import { PresetCardController, type PresetCardProps } from './preset-card.controller'

// One quick-time preset card: label + kind select + value input + a snap-to-hour
// checkbox (shown only for day-based presets) + delete.
export function buildPresetCard(props: PresetCardProps): HTMLDivElement {
  return new PresetCardController(props).render()
}
