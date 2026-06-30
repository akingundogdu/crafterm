// Database tool — migrated to the gea tree (src/views/screens/database). This
// legacy entry point is a thin re-export so existing @ui consumers (sidebar +
// main.state) keep importing renderDatabase/dbApplyQuery/databaseHandleKey/
// databaseNewProject unchanged; the imperative widget + its CSS now live entirely
// under @views.
export { renderDatabase, dbApplyQuery, databaseHandleKey, databaseNewProject } from '@views/screens/database/database'
