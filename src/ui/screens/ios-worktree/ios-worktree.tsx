// iOS worktree sidebar add-on — migrated to the gea tree
// (src/views/screens/ios-worktree). This legacy entry point is a thin re-export
// so existing @ui consumers (sidebar slot/context-menu builders, main + commands
// state) keep importing the same names unchanged; the implementation + its CSS
// now live entirely under @views.
export type { RunTarget } from '@views/screens/ios-worktree/ios-worktree'
export {
  iosWorktreeDot,
  iosWorktreeTrailing,
  iosWorktreeEnvFor,
  startIosWorktreePoll,
  iosWorktreeMenuItems
} from '@views/screens/ios-worktree/ios-worktree'
