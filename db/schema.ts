import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ideas = sqliteTable("ideas", {
  ownerId: text("owner_id").notNull(),
  id: text("id").notNull(),
  slot: integer("slot").notNull(),
  title: text("title").notNull(),
  seed: text("seed").notNull(),
  tone: text("tone").notNull(),
  quip: text("quip").notNull(),
  status: text("status", { enum: ["active", "pruned"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  prunedAt: text("pruned_at"),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.id] }),
  index("ideas_owner_status_idx").on(table.ownerId, table.status),
  uniqueIndex("ideas_owner_active_slot_idx")
    .on(table.ownerId, table.slot)
    .where(sql`${table.status} = 'active'`),
]);

export const dojoSessions = sqliteTable("dojo_sessions", {
  ownerId: text("owner_id").notNull(),
  id: text("id").notNull(),
  ideaJson: text("idea_json").notNull(),
  turn: integer("turn").notNull().default(0),
  movesJson: text("moves_json").notNull().default("[]"),
  stateJson: text("state_json").notNull(),
  progressJson: text("progress_json").notNull(),
  historyJson: text("history_json").notNull().default("[]"),
  messagePending: integer("message_pending", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.id] }),
  index("dojo_sessions_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);

export const dojoMessages = sqliteTable("dojo_messages", {
  ownerId: text("owner_id").notNull(),
  sessionId: text("session_id").notNull(),
  sequence: integer("sequence").notNull(),
  encounter: integer("encounter").notNull(),
  exchange: integer("exchange").notNull(),
  role: text("role", { enum: ["user", "idea"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.sessionId, table.sequence] }),
  index("dojo_messages_session_idx").on(table.ownerId, table.sessionId),
]);
