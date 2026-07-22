import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const raidGroups = sqliteTable("raid_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  dataJson: text("data_json").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const raidGroupSessions = sqliteTable(
  "raid_group_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    raidGroupId: text("raid_group_id")
      .notNull()
      .references(() => raidGroups.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("raid_group_sessions_group_idx").on(table.raidGroupId),
    index("raid_group_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const lostarkRosterCache = sqliteTable(
  "lostark_roster_cache",
  {
    characterKey: text("character_key").primaryKey(),
    dataJson: text("data_json").notNull(),
    expiresAt: integer("expires_at").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("lostark_roster_cache_expiry_idx").on(table.expiresAt)],
);

export const lostarkApiUsage = sqliteTable(
  "lostark_api_usage",
  {
    scope: text("scope").notNull(),
    windowStart: integer("window_start").notNull(),
    requestCount: integer("request_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.windowStart] }),
    index("lostark_api_usage_window_idx").on(table.windowStart),
  ],
);
