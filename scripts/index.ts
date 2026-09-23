import { admin } from "./commands/admin";
import { db } from "./commands/db";
import { dev } from "./commands/dev";
import { createEnvFile, printSecrets, serviceClient } from "./commands/secrets";
import { stack } from "./commands/stack";
import { status } from "./commands/status";
import { color, fail } from "./lib/ui";

const [cmd, sub, ...rest] = process.argv.slice(2);

function help() {
	console.log(`
${color.bold("SocialFly CLI")} ${color.dim("— local development and operations")}

${color.bold("Getting started")}
  ${color.cyan("env")}                          Create .env from .env.example with fresh local secrets
  ${color.cyan("dev")} [apps...] [--no-infra]    Infra up + migrate + run auth, api, worker, app, site, admin with hot reload
  ${color.cyan("status")}                       Readiness of every local service

${color.bold("Infrastructure")} ${color.dim("(infra/compose/compose.yaml)")}
  ${color.cyan("stack up")} [observability|apps|full]
  ${color.cyan("stack down")} | ${color.cyan("stack ps")} | ${color.cyan("stack logs")} [service] | ${color.cyan("stack nuke --yes")}

${color.bold("Database")}
  ${color.cyan("db migrate")}                   Apply pending migrations
  ${color.cyan("db generate")} <name>           New migration from schema changes (review the SQL!)
  ${color.cyan("db seed")}                      Demo user + organization
  ${color.cyan("db studio")}                    Drizzle Studio
  ${color.cyan("db reset --yes")}               Wipe and re-migrate the LOCAL database

${color.bold("Admin console")} ${color.dim("(staff access — CLI only, never via the API)")}
  ${color.cyan("admin grant")} <email>          Make a user a platform admin
  ${color.cyan("admin revoke")} <email>         Remove platform admin access
  ${color.cyan("admin list")}                   List platform admins

${color.bold("Security")}
  ${color.cyan("secrets")}                      Print fresh AUTH_JWT_SECRET / TOKEN_ENCRYPTION_KEY
  ${color.cyan("service-client")} <id> <scopes> Create credentials for a machine client

${color.dim("Examples:  bun dev    bun dev api worker    bun run cli stack up observability")}
`);
}

switch (cmd) {
	case "dev":
		await dev([sub, ...rest].filter((a): a is string => Boolean(a)));
		break;
	case "status":
		await status();
		break;
	case "stack":
		await stack(sub, rest);
		break;
	case "db":
		await db(sub, rest);
		break;
	case "admin":
		await admin(sub, rest);
		break;
	case "env":
		await createEnvFile([sub, ...rest].filter((a): a is string => Boolean(a)));
		break;
	case "secrets":
		printSecrets();
		break;
	case "service-client":
		serviceClient([sub, ...rest].filter((a): a is string => Boolean(a)));
		break;
	case undefined:
	case "help":
	case "--help":
	case "-h":
		help();
		break;
	default:
		help();
		fail(`Unknown command "${cmd}"`);
}
