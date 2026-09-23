/**
 * UUIDv7: time-ordered, so primary-key inserts stay append-only in the B-tree and
 * ids sort by creation time without an extra index. Postgres stores them as `uuid`.
 */
export const newId = (): string => Bun.randomUUIDv7();
