import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    snapshot: text("snapshot").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    status: text("status").notNull().default("CREATING"),
    paypalId: text("paypal_id"),
    authorizationId: text("authorization_id"),
    captureId: text("capture_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    error: text("error"),
  },
  (t) => [uniqueIndex("paypal_order_unique").on(t.paypalId)],
);
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: integer("received_at").notNull(),
});
export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  count: integer("count").notNull().default(0),
});
