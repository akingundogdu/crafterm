// Docker panel — migrated to gea (src/views/screens/docker). The sidebar entry
// wrappers now live in the gea entry; this legacy file is a thin re-export shim
// so existing @ui consumers keep importing renderDocker/dockerApplyQuery/
// dockerHandleKey unchanged until the orchestrator repoints them.
export { renderDocker, dockerApplyQuery, dockerHandleKey } from '@views/screens/docker/docker'
