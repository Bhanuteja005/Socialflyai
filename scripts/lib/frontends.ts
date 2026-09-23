import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths";

/**
 * The Next.js frontends, as data: `bun dev` runs each one and `cli status` probes it.
 * An entry whose directory does not exist yet (e.g. apps/admin before it is created)
 * is skipped, so adding a frontend means adding a line here, nothing else.
 */
export type Frontend = {
	name: string;
	port: number;
	/** Probed by `cli status`: a path that answers 200 without a session. */
	probe: string;
};

const ALL: Frontend[] = [
	{ name: "app", port: 4700, probe: "/login" },
	{ name: "site", port: 4701, probe: "/" },
	{ name: "admin", port: 4702, probe: "/" },
];

export const frontendDir = (f: Frontend) => `apps/${f.name}`;

/** Frontends present in this checkout. */
export function frontends(): Frontend[] {
	return ALL.filter((f) => existsSync(join(ROOT, frontendDir(f), "package.json")));
}
