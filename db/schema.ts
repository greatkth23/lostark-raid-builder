import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
