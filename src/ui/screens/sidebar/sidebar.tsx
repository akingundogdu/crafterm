// Legacy entry shim — the sidebar has migrated to the self-contained gea tree.
// Re-export the gea implementation so every existing `@ui/screens/sidebar/sidebar`
// consumer (main.state, settings tabs, pickers' global-search) keeps resolving.
// Importing this module mounts the gea sidebar (plain-DOM wiring runs on import).
export * from '@views/screens/sidebar/sidebar'
