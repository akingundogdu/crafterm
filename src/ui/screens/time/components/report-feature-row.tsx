interface ReportFeatureRowProps {
  name: string
  duration: string
}

// An indented feature row nested under a project: feature name + formatted duration.
export function reportFeatureRow({ name, duration }: ReportFeatureRowProps): HTMLDivElement {
  return (
    <div
      class="time-report-row time-report-feat"
      innerHTML={`<span class="time-report-name">${name}</span><span class="time-report-dur">${duration}</span>`}
    />
  ) as HTMLDivElement
}
