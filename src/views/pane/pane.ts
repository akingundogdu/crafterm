// Pane bridge (§6 sanctioned exception, like state/spine). The SINGLE file under
// src/views allowed to import the legacy pane subsystem; other @views modules
// import pane actions from here, never from @ui. The pane subsystem migrates in
// Phase 8; at teardown this re-export flips to the migrated source.
export * from '@ui/pane/pane'
