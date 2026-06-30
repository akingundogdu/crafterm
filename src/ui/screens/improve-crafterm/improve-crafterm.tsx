// Improve Crafterm panel — migrated to gea (src/views/screens/improve-crafterm).
// The modal chrome + showImproveModal entry now live in the gea state module;
// this legacy file is a thin re-export shim so un-migrated @ui consumers keep
// their imports unchanged until the orchestrator repoints them.
export { showImproveModal } from '@views/screens/improve-crafterm/improve-crafterm.state'
