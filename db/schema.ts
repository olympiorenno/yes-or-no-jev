import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One aggregate row. No questions, documents, keys, visitors or event history.
export const usageTotals = sqliteTable("usage_totals", {
  id: integer("id").primaryKey(),
  completedQueries: integer("completed_queries").notNull().default(0),
});

// One pseudonymous counter per account; no name, email or query data.
export const demoClaims = sqliteTable("demo_claims", {
  userHash: text("user_hash").primaryKey(),
  // Existing rows already consumed one attempt before this column was added.
  attempts: integer("attempts").notNull().default(1),
});
