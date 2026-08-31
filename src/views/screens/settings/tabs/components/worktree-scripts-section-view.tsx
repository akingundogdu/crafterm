import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import WorktreeScriptList from './worktree-script-list'
import store from './worktree-scripts-section.store'

// Reactive body of the Worktree-scripts section: the scope hint, then a pre and a
// post list, each with its cards and an "+ Add" button. Rendered as a JSX child of
// WorktreeScriptsSection so gea tracks the `store.pre` / `store.post` reads and
// re-renders on add / remove / rename. All mutations live in the store.
class WorktreeScriptsBody extends Component {
  declare props: { isProject: boolean }

  template({ isProject }: this['props']) {
    const texts = UITexts.Settings.worktreeScripts
    const pre = store.pre
    const post = store.post
    return (
      <div style={{ display: 'contents' }}>
        <div class="settings-subhead">{texts.heading}</div>
        <div class="field-hint">{isProject ? texts.projectHint : texts.globalHint}</div>
        <div class="settings-subhead">{texts.pre}</div>
        <WorktreeScriptList phase="pre" scripts={pre} empty={texts.noPre} />
        <button class="settings-inline-btn" onClick={() => store.add('pre')}>
          {texts.addPre}
        </button>
        <div class="settings-subhead">{texts.post}</div>
        <WorktreeScriptList phase="post" scripts={post} empty={texts.noPost} />
        <button class="settings-inline-btn" onClick={() => store.add('post')}>
          {texts.addPost}
        </button>
      </div>
    )
  }
}

// Thin shell, mounted imperatively into a settings panel / sub-tab host; the scope
// arrives via the constructor. The reactive markup lives in the WorktreeScriptsBody
// JSX child (display:contents root → §gea 5.8).
export default class WorktreeScriptsSection extends Component {
  private readonly isProject: boolean

  constructor(opts: { isProject: boolean }) {
    super()
    this.isProject = opts.isProject
  }

  template() {
    return <WorktreeScriptsBody isProject={this.isProject} />
  }
}
