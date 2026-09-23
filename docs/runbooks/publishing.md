# Runbook: publishing

## Where to look

1. **The post in the app** → each target shows its status, error and timeline (`post_target_events`).
2. **Bull Board** (`/queues` on the worker; local http://localhost:4500/queues) — waiting, delayed, failed jobs per queue.
3. **Traces/logs** — search by `targetId`, or by the `X-Trace-Id` a user reports.
4. **Metric** `socialfly.publish.outcomes` by `provider` and `outcome` — a spike in `failed`/`unconfirmed` for one provider usually means that platform changed something.

## Target states

| Status | Meaning | Action |
|---|---|---|
| `scheduled` past its time | job missing or queue backed up | The minute sweep re-enqueues it. If it persists: is the worker running for that provider's queue (`WORKER_QUEUES`)? Is the provider still configured? |
| `failed` / `channel_needs_reauth` | token revoked or expired | User reconnects the channel, then retries. |
| `failed` / `rate_limited` | gave up after 5 attempts | Check the platform's limits for the app; lower `publishRateLimit` for that provider if it recurs. |
| `failed` / `invalid_content`, platform codes | platform rejected the content | User edits and retries; if many users hit it, the adapter's `capabilities`/`validate` should catch it earlier. |
| `unconfirmed` | the request may have succeeded | **Check the platform first.** Retry only with "confirm not published". Never bulk-retry these. |
| `processing` for long | platform still encoding media | Polls stop after ~30 min → `processing_timeout`. Stuck > 2 h without polls → marked unconfirmed by maintenance. |

## Common operations

- **Redis was flushed / restored**: nothing to do — the sweep re-enqueues every due target within a minute. Future-dated targets are re-enqueued as they come due.
- **Worker crashed mid-deploy**: targets it was publishing become `unconfirmed` after 15 minutes. Tell affected users to check the platform.
- **A platform is down**: transient errors retry with backoff for ~30 min before failing. To pause a provider, run the worker without its queue (`WORKER_QUEUES`) — jobs wait; the sweep keeps them queued.
- **Rotate the token encryption key**: set the new key as `TOKEN_ENCRYPTION_KEY`, the old one as `TOKEN_ENCRYPTION_KEY_PREVIOUS`, deploy. Values re-encrypt as tokens refresh; remove the previous key once no row uses its key id.
