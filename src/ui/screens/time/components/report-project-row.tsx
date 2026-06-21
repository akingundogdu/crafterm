interface ReportProjectRowProps {
  name: string
  duration: string
}

// A project total row: project name on the left, formatted duration on the right.
export function reportProjectRow({ name, duration }: ReportProjectRowProps): HTMLDivElement {
  return (
    <div
      class="time-report-row time-report-proj"
      innerHTML={`<span class="time-report-name">${name}</span><span class="time-report-dur">${duration}</span>`}
    />
  ) as HTMLDivElement
}
