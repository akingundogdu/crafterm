import {
  ApplicationCheckboxRowController,
  type ApplicationCheckboxRowProps,
  type ApplicationCheckboxRow
} from './application-checkbox-row.controller'

// App row for the run / feature modals: a checkbox, the app name, and the
// resolved command for the selected environment (or a "no command" hint when the
// app has none, which disables the row).
export function applicationCheckboxRow(props: ApplicationCheckboxRowProps): ApplicationCheckboxRow {
  return new ApplicationCheckboxRowController(props).render()
}
