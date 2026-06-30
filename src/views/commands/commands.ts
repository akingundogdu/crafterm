// Commands bridge (§6 sanctioned exception, like state/spine). The SINGLE file
// under src/views allowed to import the legacy command actions (openLink,
// selectPane, openNote, openMarkdownFile, …); every other @views module imports
// them from here, never from @ui. These actions touch the pane/browser subsystem
// which stays in @ui until Phase 8/9; at teardown this re-export flips to the
// migrated source and nothing else changes.
export * from '@ui/commands/commands'
