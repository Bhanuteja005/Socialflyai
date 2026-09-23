# Security

## Reporting a problem

Report security issues privately to the maintainers — never in an issue, pull request or chat
channel others can read. Include what you found, how to reproduce it and the impact you expect.

## Operating notes

- Never commit `.env`. Production refuses to boot on the development default secrets. Generate
  real ones with `bun run cli secrets`.
- Platform OAuth tokens (channels and ad accounts) are encrypted at rest with
  `TOKEN_ENCRYPTION_KEY`. Keep that key in a secret store and back it up: losing it disconnects
  every channel and ad account.
- Secrets are scanned by gitleaks in the pre-commit hook and in CI over the full git history.
- The website crawler is SSRF-guarded (`packages/research/src/net-guard.ts`); in production, also
  deny the worker network access to cloud metadata endpoints.
