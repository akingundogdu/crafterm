import { describe, it, expect, beforeEach, vi } from 'vitest'

const newTabBesideActive = vi.fn()
const selectPane = vi.fn()
const addSideBySideTab = vi.fn()
const exitSideBySide = vi.fn()
const markMultiSelected = vi.fn()
const clearMultiSelect = vi.fn()
const renderContent = vi.fn()
const requestSidebar = vi.fn()

vi.mock('@views/commands/commands', () => ({
  newTabBesideActive: (claude: boolean) => newTabBesideActive(claude),
  selectPane: (id: string) => selectPane(id)
}))
vi.mock('@views/screens/content/content.store', () => ({
  addSideBySideTab: (id: string, beside?: string | null) => addSideBySideTab(id, beside),
  exitSideBySide: () => exitSideBySide()
}))
vi.mock('@views/screens/sidebar/sidebar.store', () => ({
  markMultiSelected: (id: string) => markMultiSelected(id),
  clearMultiSelect: () => clearMultiSelect()
}))
const state = { activePaneId: 'p1' as string | null }
vi.mock('@views/state/spine', () => ({
  state,
  renderContent: () => renderContent(),
  requestSidebar: () => requestSidebar()
}))

const { addToSideBySide, leaveSideBySide } = await import(
  '@views/screens/content/components/side-by-side-bar.store'
)

describe('side-by-side strip actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.activePaneId = 'p1'
  })

  it('adds a plain terminal beside the tile that was active, marks it and focuses it', async () => {
    // Creating the tab makes the new pane active; the tile it lands beside is the
    // one that was active before.
    newTabBesideActive.mockImplementation(async () => {
      state.activePaneId = 'p9'
      return { tab: { id: 't9' }, paneId: 'p9' }
    })

    await addToSideBySide(false)

    expect(newTabBesideActive).toHaveBeenCalledWith(false)
    expect(addSideBySideTab).toHaveBeenCalledWith('t9', 'p1')
    expect(markMultiSelected).toHaveBeenCalledWith('t9')
    expect(renderContent).toHaveBeenCalledTimes(1)
    expect(requestSidebar).toHaveBeenCalledTimes(1)
    expect(selectPane).toHaveBeenCalledWith('p9')
  })

  it('opens a Claude session when asked for one', async () => {
    newTabBesideActive.mockResolvedValue({ tab: { id: 't9' }, paneId: 'p9' })

    await addToSideBySide(true)

    expect(newTabBesideActive).toHaveBeenCalledWith(true)
    expect(addSideBySideTab).toHaveBeenCalledWith('t9', 'p1')
  })

  it('does nothing when there is no active terminal to open beside', async () => {
    newTabBesideActive.mockResolvedValue(null)

    await addToSideBySide(false)

    expect(addSideBySideTab).not.toHaveBeenCalled()
    expect(markMultiSelected).not.toHaveBeenCalled()
    expect(renderContent).not.toHaveBeenCalled()
    expect(selectPane).not.toHaveBeenCalled()
  })

  it('leaving drops the tiles and the sidebar marks', () => {
    leaveSideBySide()

    expect(exitSideBySide).toHaveBeenCalledTimes(1)
    expect(clearMultiSelect).toHaveBeenCalledTimes(1)
    expect(renderContent).toHaveBeenCalledTimes(1)
    expect(requestSidebar).toHaveBeenCalledTimes(1)
  })
})
