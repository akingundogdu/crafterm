// Thin shim: the content screen now lives in the self-contained gea tree.
// The legacy entry re-exports the @views implementation so existing importers
// (main.state.ts) keep their import path and names.
export { renderContent, updatePaneHighlight } from '@views/screens/content/content'
