# SocialFly — notes for AI assistants

Read `docs/architecture.md` first. Conventions that are easy to get wrong:

- Bun 1.3.13 workspaces + Turborepo. Run `bun run typecheck`, `bun run test`, `bun run lint` from the root. Tests need the local stack (`bun run cli stack up`) — they use real Postgres/Redis/S3.
- Inside an app, import with `#src/<path>.ts` (explicit extension). Never `@/` aliases in apps other code imports (api, auth, worker) or in packages: the Next apps type-import `@socialfly/api`, and aliases don't resolve across packages. (`@/` is fine inside apps/app, apps/site and apps/admin, which nothing imports.)
- Frontends: `apps/app` (product, :4700), `apps/site` (marketing, :4701), `apps/admin` (staff console, :4702) share `packages/ui`. CI/CD is Jenkins (`Jenkinsfile`, `docs/ci-jenkins.md`) — there are no GitHub Actions workflows.
- Services throw `AppError` from `@socialfly/core/errors`; never pick an HTTP status by matching error text. Validate with `validate(target, schema)`; read `ctx.req.valid(...)`; never parse twice.
- Each service imports only its own env from `@socialfly/config`. New secrets use `devDefault(...)` so production refuses to boot without them.
- Schema change → `bun run cli db generate <name>` → review and commit the SQL. Migrations must be backward compatible (rollback runs old code on the new schema).
- Publishing state (`post_targets.status`) is written only by `apps/worker/src/publishing/target-state.ts` and the API's posts service. Never auto-retry a mutating platform call whose outcome is unknown — that is `unconfirmed`.
- Platform adapters (`packages/integrations`) are stateless and throw `ProviderError` with the right `kind`; set `mutating: true` on the call that creates the visible post.
- Postiz (AGPL-3.0) may be studied for ideas; never copy its code.
- Comments explain why. Biome formats (tabs, double quotes, width 100).
