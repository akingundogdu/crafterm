// Spotlight migrated to the self-contained gea tree. This legacy entry is a thin
// re-export so existing consumers (main.state.ts keybindings) keep importing
// `showSpotlight` from here unchanged. See src/views/screens/spotlight/.
export { showSpotlight } from '@views/screens/spotlight/spotlight'
