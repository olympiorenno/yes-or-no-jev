import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

// One aggregate row. No questions, documents, keys, visitors or event history.
export const usageTotals = sqliteTable("usage_totals", {
  id: integer("id").primaryKey(),
  completedQueries: integer("completed_queries").notNull().default(0),
});
