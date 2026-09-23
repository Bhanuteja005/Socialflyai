const wrap = (code: number) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;

export const color = {
	bold: wrap(1),
	dim: wrap(2),
	red: wrap(31),
	green: wrap(32),
	yellow: wrap(33),
	blue: wrap(34),
	magenta: wrap(35),
	cyan: wrap(36),
};

export const mark = { ok: color.green("✓"), fail: color.red("✗"), warn: color.yellow("!") };

export const section = (title: string) =>
	console.log(`\n${color.bold(color.cyan(`━━ ${title} ━━`))}\n`);

export function fail(message: string): never {
	console.error(`${mark.fail} ${color.red(message)}`);
	process.exit(1);
}
