# Platform app setup

Each platform needs a developer app. Put its credentials in `.env` (locally) or the
secret store (production). A platform without credentials is simply not offered.

**Redirect URI** to register everywhere: `{API_URL}/channels/callback/{provider}`
— e.g. `http://localhost:4400/channels/callback/linkedin`, and in production
`https://api.<your-domain>/channels/callback/linkedin`.

**Public media.** Instagram, Threads and Facebook fetch media from our storage
URL themselves, so `S3_PUBLIC_URL` must be reachable from the internet. Locally,
expose it with a tunnel (e.g. `cloudflared tunnel --url http://localhost:9000`) and
set `S3_PUBLIC_URL` to the tunnel URL + `/socialfly-media`.

| Provider id | Where | Env vars | Scopes requested | Review needed |
|---|---|---|---|---|
| `linkedin` | linkedin.com/developers → products "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" | `LINKEDIN_CLIENT_ID/SECRET` | openid profile email w_member_social | No |
| `linkedin_page` | same app + "Community Management API" | same | w_organization_social r_organization_social rw_organization_admin | **Yes** (Community Management) |
| `facebook` | developers.facebook.com → Business app, Facebook Login for Business | `META_APP_ID/SECRET` | pages_show_list pages_read_engagement pages_manage_posts pages_manage_metadata read_insights business_management | **Yes** (App Review for advanced access) |
| `instagram` | same Meta app + Instagram Graph API | same | instagram_basic instagram_content_publish instagram_manage_insights instagram_manage_comments + page scopes | **Yes**; IG account must be Business/Creator linked to a Page |
| `threads` | same Meta developer account → Threads use case | `THREADS_APP_ID/SECRET` | threads_basic threads_content_publish threads_manage_insights threads_manage_replies | **Yes** |
| `x` | developer.x.com → project app, OAuth 2.0, type "Web App" (confidential) | `X_CLIENT_ID/SECRET` | tweet.read tweet.write users.read media.write offline.access | Paid API tier for meaningful volume |
| `reddit` | reddit.com/prefs/apps → "web app" | `REDDIT_CLIENT_ID/SECRET`, `REDDIT_USER_AGENT` | identity submit read flair | Commercial use needs Reddit approval |
| `youtube` | console.cloud.google.com → YouTube Data API v3, OAuth consent screen | `YOUTUBE_CLIENT_ID/SECRET` | youtube.upload youtube.readonly userinfo.profile | **Yes** (Google verification + quota increase; default quota ≈ 6 uploads/day) |

Until an app passes review, only accounts that are admins/testers of the app can
connect — enough for development.

## Verified vs. to-verify

Adapters are unit-tested for their pure logic (error classification, settings,
limits) and the engine is integration-tested with a scripted fake platform. **The
real platform calls have not yet been exercised against live accounts.** Before
enabling a platform in production, connect a test account and publish each post
type once. Points flagged during implementation to confirm against current docs:

- X: v2 `media/upload` endpoints and the `STATUS` response shape.
- Instagram: `media_type=REELS` with `share_to_feed` for single feed videos.
- Facebook: `alt_text_custom` on photos.
- Meta Graph / Threads: JSON bodies with a Bearer token on every endpoint used.
