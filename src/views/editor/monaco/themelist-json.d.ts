// Ambient type for the monaco-themes theme catalog imported as JSON. The project
// does not enable resolveJsonModule, so this declares the shape the editor reads
// (a map of theme key -> display name). Scoped to the editor subsystem.
declare module '*/themelist.json' {
  const value: Record<string, string>
  export default value
}
