# Admin console

The admin console is SocialFly's internal, staff-only back office (`apps/admin`,
<http://localhost:4702> locally). It sees across every tenant: organizations, users,
publishing failures, AI spend and the job queues. Customers never see it, and nothing
in the product links to it.

Its backend is the `/admin/*` module of the API (`apps/api/src/modules/admin`), part
of the typed `AppType`, so the console uses the same `hc` client as the product app.

## Access

Access is a property of the user, not of an organization: `users.platform_role`
(`user` | `admin`, default `user`). An organization owner is **not** a platform admin.

- **Granting is CLI-only**, never through the API, so a stolen admin session cannot
  mint more admins:

  ```sh
  bun run cli admin grant alice@socialfly.ai    # user must have signed up first
  bun run cli admin revoke alice@socialfly.ai
  bun run cli admin list
  ```

  The CLI runs against `DATABASE_URL` (the root `.env` locally), and records each change
  in the audit trail with no actor (`actorUserId: null`, `data.via: "cli"`).
- **Locally**, `bun run cli db seed` makes `demo@socialfly.local` a platform admin.
- **Sign-in** goes through the auth service's `socialfly-admin` client (login only, no
  sign-up). Tokens stay identity-only.
- **Every request is authorized from the database.** `requirePlatformAdmin` runs after
  `requireUser` and reads the caller's `platform_role` and `status` on each request, so
  `admin revoke` takes effect on the next request, not when a token expires.
- **Non-admins get `404 not_found`** on every `/admin/*` route, the same as for a resource
  that does not exist, so the console's existence is not revealed. A disabled account gets
  `403`. In practice its token is already refused with `401` before that check runs.

## Endpoints

Every route sits under `/admin`, needs the normal session cookie (plus `X-CSRF-Token` for
writes), and needs no `X-Organization-Id`. Lists use keyset pagination on the time-ordered
id: pass the previous page's `nextCursor` as `before`. `nextCursor: null` means this is the
last page. `limit` is 1–100 (default 25). Timestamps are ISO strings; money is USD numbers.

| Method & path | What it shows |
|---|---|
| `GET /admin/me` | The signed-in admin. The console calls it first to gate its UI |
| `GET /admin/overview` | Platform-wide counts (below) |
| `GET /admin/organizations?q=&before=&limit=` | Organizations, newest first. `q` matches name or slug (case-insensitive substring). Includes soft-deleted orgs |
| `GET /admin/organizations/:id` | One org with its members, channels (never tokens), posts by status and AI budget |
| `PATCH /admin/organizations/:id` | `{ aiMonthlyBudgetUsd: number ≥ 0 \| null }`: set or clear the org's AI budget override (audited) |
| `GET /admin/users?q=&before=&limit=` | Users, newest first. `q` matches email or name |
| `PATCH /admin/users/:id` | `{ status: "active" \| "disabled" }` (audited). The platform role cannot be changed here |
| `GET /admin/publishing/targets?status=&before=&limit=` | `failed` and `unconfirmed` targets across all orgs (`status` narrows it to one) |
| `GET /admin/ai/generations?status=&kind=&before=&limit=` | AI generations across all orgs |
| `GET /admin/queues` | BullMQ job counts for every queue |
| `GET /admin/audit?before=&limit=` | The admin audit trail, newest first |

### Response shapes

```ts
// GET /admin/me
{ id: string; email: string; name: string | null; platformRole: "admin" }

// GET /admin/overview
{
  generatedAt: string;
  users:         { total: number; new7d: number; disabled: number };
  organizations: { total: number; new7d: number; deleted: number };   // total/new7d exclude deleted
  channels:      { total: number; active: number; needsReauth: number }; // total excludes disconnected
  posts:         { total: number; byStatus: Record<PostStatus, number> }; // excludes deleted posts
  publishing:    { failed24h: number; unconfirmed24h: number; published24h: number };
  ai: {
    periodStart: string;   // first day of the current UTC month
    spendUsd: number;      // sum of cost_micros this month, all orgs
    generations: { total: number; byStatus: Record<"pending" | "running" | "succeeded" | "failed", number> };
  };
}

// Organization summary: items of GET /admin/organizations, and the PATCH response
type OrgSummary = {
  id: string; name: string; slug: string; timezone: string;
  memberCount: number;
  channelCount: number;          // excludes disconnected
  postCount: number;             // excludes deleted
  aiSpendMonthUsd: number;
  aiMonthlyBudgetUsd: number | null;   // the override as stored: null = server default, 0 = unlimited
  aiEffectiveBudgetUsd: number | null; // what is enforced: null = unlimited
  createdAt: string; deletedAt: string | null;
};
// GET /admin/organizations → { items: OrgSummary[]; nextCursor: string | null }

// GET /admin/organizations/:id
OrgSummary & {
  members:  { userId: string; email: string; name: string | null; role: "owner" | "admin" | "editor" | "viewer"; joinedAt: string }[];
  channels: { id: string; provider: string; name: string; username: string | null;
              status: "active" | "needs_reauth" | "disconnected"; lastError: string | null;
              tokenExpiresAt: string | null; createdAt: string }[];
  postsByStatus: Record<PostStatus, number>;
  aiBudget: { periodStart: string; usedUsd: number; overrideUsd: number | null; limitUsd: number | null };
}

// Items of GET /admin/users, and the PATCH /admin/users/:id response
type AdminUser = {
  id: string; email: string; name: string | null;
  status: "active" | "disabled"; platformRole: "user" | "admin";
  emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string;
  orgCount: number;               // memberships in non-deleted orgs
};

// Items of GET /admin/publishing/targets
{ id: string; postId: string;
  organization: { id: string; name: string };
  channel: { id: string; provider: string; name: string };
  status: "failed" | "unconfirmed"; errorCode: string | null; errorMessage: string | null;
  attempts: number; scheduledAt: string | null; updatedAt: string }

// Items of GET /admin/ai/generations
{ id: string; organization: { id: string; name: string };
  userId: string | null; userEmail: string | null;
  kind: "post" | "rewrite" | "hashtags" | "carousel_outline" | "image" | "carousel";
  status: "pending" | "running" | "succeeded" | "failed";
  model: string | null; costUsd: number; errorCode: string | null; createdAt: string }

// GET /admin/queues
{ queues: { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }[] }

// Items of GET /admin/audit
{ id: string; actorUserId: string | null; actorEmail: string | null;
  action: string; targetType: string; targetId: string;
  data: Record<string, unknown>; createdAt: string }
```

All errors use the standard `{ error: { code, message, details } }` shape. Invalid
input is `422 validation_failed`, and an unknown id is `404 not_found`.

### The two writes

**AI budget override.** `organizations.ai_monthly_budget_usd` replaces the server-wide
`AI_ORG_MONTHLY_BUDGET_USD` for that organization: `null` means use the default, `0`
means unlimited, and any other value is the monthly limit in USD (stored to the cent).
The AI module (`GET /ai/capabilities` and the check before every paid call) and the
console share one function, `effectiveBudgetUsd`, so what the console shows is what gets
enforced.

**Disabling a user** cuts off access at once rather than when the 15-minute access token
expires. In one transaction it sets `status = 'disabled'`, bumps `users.token_version`
(every outstanding access token fails `isAccessRevoked`), and revokes every open session
(`revoked_reason = 'admin_disabled'`, so refresh tokens die too). Re-enabling only flips
the status: the user signs in again. An admin cannot disable their own account
(`409 cannot_disable_self`).

## Queues

`GET /admin/queues` covers `publish-<provider>` for every provider in the integrations
registry, whether configured or not, plus `publish-status`, `token-refresh`,
`maintenance` and `ai-media`. A newly registered platform appears without any change
here. The Queue handles share the API's single BullMQ Redis connection, are created once,
and are closed on shutdown.

## Audit trail

`admin_audit_events` is append-only: `id` (UUIDv7), `actor_user_id` (null for CLI changes
and kept if the staff account is later deleted), `action`, `target_type`, `target_id`,
`data` (before/after values, never secrets) and `created_at`. Each API write inserts its
row in the same transaction as the change, so a change can never exist without its record.

| Action | Target | `data` |
|---|---|---|
| `organization.ai_budget.update` | `organization` | `{ before, after }` |
| `user.disable` / `user.enable` | `user` | `{ before, after, revokedSessions }` |
| `platform_role.grant` / `platform_role.revoke` (CLI) | `user` | `{ before, after, via: "cli" }` |
