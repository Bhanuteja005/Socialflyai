# Security policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub:
[**Report a vulnerability**](https://github.com/Bhanuteja005/Socialflyai/security/advisories/new)
(Security tab → "Report a vulnerability").

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge
reports within 3 business days and to agree a disclosure timeline with you. Credit is given in the
advisory unless you prefer otherwise.

## Supported versions

SocialFly is pre-1.0. Security fixes land on `main` only.

## Scope

In scope: this repository's code: the API, auth service, worker, web app, packages and
infrastructure templates.

Out of scope: vulnerabilities in third-party platforms (report those to the platform), findings
that require a compromised machine or stolen credentials, and missing hardening headers without a
demonstrated impact.

## For self-hosters

- Never commit `.env`. Production refuses to boot on the development default secrets. Generate
  real ones with `bun run cli secrets`.
- Platform OAuth tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`. Keep that key in a secret
  store and back it up: losing it disconnects every channel.
