@AGENTS.md

# apps/admin — staff-only admin console

- Backend: the API's `/admin/*` module (`apps/api/src/modules/admin`), typed through
  `AppType`; see `docs/admin-console.md` for every endpoint and response shape.
- Sign-in uses the auth service's `socialfly-admin` client (login only, no sign-up).
  The UI is gated by `GET /admin/me`: a 404 means "not a platform admin" and must never
  render admin data (`components/admin-guard.tsx`).
- Response types are inferred from the API routes (`lib/api-types.ts`); never hand-write them.
- Every write is audited server-side; confirm destructive actions in the UI first.
