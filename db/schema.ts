import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
/** Each authenticated caller owns one private cloud monitoring ledger. */
export const dividendMonitors=sqliteTable("dividend_monitors",{
 ownerId:text("owner_id").primaryKey(),
 stateJson:text("state_json").notNull(),
 version:integer("version").notNull().default(0),
 updatedAt:integer("updated_at").notNull(),
});
