# Test: Sidebar Plan Node Visibility

This file exists to verify that the sidebar shows plan files as sub-nodes
beneath the terminal pane that owns the matching git branch.

- Branch: `improve-crafterm`
- Filename prefix: `improve-crafterm-`
- Expected slug: `test-sidebar-plan-node`

If you can see this row in the left sidebar under the terminal pane
(within ~4 seconds of saving the file), the feature works.

## Verification checklist

- [ ] Row appears beneath the active terminal in the sidebar
- [ ] Title shown is `test-sidebar-plan-node` (filename without extension)
- [ ] Hover tooltip shows the absolute path
- [ ] Clicking the row opens this markdown file in a read-only doc pane
- [ ] Removing or renaming the file makes the row disappear within ~4s
