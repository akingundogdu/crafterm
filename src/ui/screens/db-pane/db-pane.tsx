// SQL results pane — migrated to the gea tree (src/views/screens/db-pane). This
// legacy entry point is a thin re-export so existing @ui consumers (commands +
// main.state) keep importing createSqlPane/destroySqlPane unchanged; the
// imperative widget + its CSS now live entirely under @views.
export { createSqlPane, destroySqlPane } from '@views/screens/db-pane/db-pane'
export type { DbPaneOptions, ParsedSelect } from '@views/screens/db-pane/db-pane'
