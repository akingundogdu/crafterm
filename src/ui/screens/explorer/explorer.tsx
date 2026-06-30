// File explorer — migrated to gea tree (src/views/screens/explorer). This legacy
// entry point is a thin re-export so existing @ui consumers (notifications panel)
// keep importing renderExplorer/initExplorer unchanged; the imperative widget +
// its CSS now live entirely under @views.
export { renderExplorer, initExplorer } from '@views/screens/explorer/explorer'
