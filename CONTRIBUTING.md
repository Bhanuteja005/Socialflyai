# Working on SocialFly

How to get from clone to merged pull request.

## Before you start

- **Bugs**: search existing issues first, then open one with the bug template. A minimal reproduction makes a fix much faster.
- **Features and larger changes**: open a feature request or discussion *before* writing code,
  so we can agree on the approach. This saves you from reworking a PR.
- **Security issues**: never in public issues. See [SECURITY.md](SECURITY.md).

## Set up

Prerequisites: [Bun 1.3.13](https://bun.sh) and Docker.

```bash
git clone <repository-url> socialflyai && cd socialflyai
bun install          # installs git hooks too
bun run cli env      # writes .env with generated local secrets
bun dev              # starts Postgres/Redis/S3/Mailpit in Docker, migrates, runs every app
```

Read [docs/architecture.md](docs/architecture.md) before your first change. It explains how the
services fit together and why.

## Making a change

1. Branch from `main`: `git checkout -b feat/short-description`.
2. Follow the conventions below. The pre-commit hook formats with Biome and scans for secrets.
3. Add or update tests. Integration tests run against the real local stack (`bun run cli stack up`),
   not mocks.
4. Run the same checks CI runs:
   ```bash
   bun run lint && bun run typecheck && bun run test
   ```
   CI is Jenkins ([docs/ci-jenkins.md](docs/ci-jenkins.md)). Its results show up as a status check on
   your PR. It also checks that migrations are committed, scans for secrets, audits dependencies and
   builds every Docker image.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org):
   `feat(api): add cursor pagination to GET /posts`, `fix(worker): ...`, `docs: ...`.
6. Open a PR against `main` and fill in the template. Keep PRs focused, one concern each.

## Conventions

- **Imports** inside an app use `#src/<path>.ts` with the explicit extension. No `@/` aliases.
- **Errors**: services throw `AppError` from `@socialfly/core/errors`. Never choose an HTTP status
  by matching error text.
- **Validation**: `validate(target, schema)` on the route, then read `ctx.req.valid(...)`. Never parse twice.
- **Config**: each service imports only its own env from `@socialfly/config`. New secrets use
  `devDefault(...)` so production refuses to boot without them.
- **Database**: edit `packages/db/src/schema`, run `bun run cli db generate <name>`, review and commit
  the SQL. Migrations must be backward compatible, because a rollback runs old code on the new schema.
- **Platform adapters** (`packages/integrations`) are stateless, throw `ProviderError` with the right
  `kind`, and mark the call that creates the visible post `mutating: true`.
- **Comments** explain *why*, not *what*. Biome formats: tabs, double quotes, width 100.

## Adding a platform

Adapters live in `packages/integrations/src/providers`. Copy the structure of an existing one,
implement the provider contract, add fixtures-based tests, and document app setup, scopes and review
requirements in [docs/platforms.md](docs/platforms.md).

## License

Proprietary — see [LICENSE](LICENSE). Do not share this code outside the team.
