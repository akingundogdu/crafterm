// Legacy entry shim — the notebook has migrated to the self-contained gea tree.
// Re-export the gea implementation so every existing `@ui/notebook/notebook`
// consumer (main.state, legacy sidebar components) keeps resolving.
export * from '@views/notebook/notebook'
