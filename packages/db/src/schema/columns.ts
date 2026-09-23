import { newId } from "@socialfly/core/ids";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** UUIDv7 primary key generated in the app (time-ordered — see @socialfly/core/ids). */
export const id = () => uuid().primaryKey().$defaultFn(newId);

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });
