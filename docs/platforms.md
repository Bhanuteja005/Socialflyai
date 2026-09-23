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

## Analytics

Adapters expose read-only analytics through `SocialProvider.analytics`
(`packages/integrations/src/types.ts`): `getPostMetrics(channel, externalIds)`
for published posts and, where the platform has it, `getAccountMetrics(channel,
{ since, until })` for daily account numbers. The rules every adapter follows:

- **Unknown stays unknown.** A metric the platform does not report is left
  `undefined`, never `0`. The only zeros we fill in are ones the platform itself
  defines (Facebook omits `shares` on an unshared post; LinkedIn says posts
  missing from share statistics "can be assumed to have counts of 0").
- **Deleted posts are omitted** from the result.
- **Read-only calls are never `mutating`**, so a 5xx is `transient` (safe to
  retry), 401/403 or a revoked permission is `auth`, and throttling is
  `rate_limited` with `retryAfterMs` (HTTP `Retry-After`; Meta throttle codes
  4/17/32/613/80001+ wait 15 min; YouTube quota waits until Pacific midnight).
- **`maxPostsPerCall`** is the platform's batch size; the collector passes at
  most that many ids per call.
- **Current-value metrics are dated today.** Where a platform only exposes the
  current follower count, `getAccountMetrics` returns it as today's row, and
  only if today is inside the requested range. History builds up as the
  collector runs daily.
- Meta's daily insights are Pacific-time days; we map `end_time` to a UTC date,
  so a day can be off by up to 8 hours at its edges.

**No scope changes were needed**: every read below uses a scope the adapters
already request, so existing connections keep working.

| Provider | Post metrics (ours ← platform) | Account days | Endpoints | Scopes | Batch / limits |
|---|---|---|---|---|---|
| `x` | impressions ← `impression_count`, likes ← `like_count`, comments ← `reply_count`, shares ← `retweet_count` (or `repost_count`) + `quote_count`, saves ← `bookmark_count` | followers (today only) | `GET /2/tweets?ids=…&tweet.fields=public_metrics`, `GET /2/users/me?user.fields=public_metrics` | tweet.read users.read | 100 ids. Reads count against the paid tier's monthly post-read cap — poll sparingly |
| `facebook` | impressions ← `post_media_view`, reach ← `post_total_media_view_unique`, clicks ← `post_clicks`, likes ← reactions total, comments ← comments total, shares ← `shares.count`. **Video posts** (publish returns a video id): likes + comments only | followers ← `page_follows`, impressions ← `page_media_view`, reach ← `page_total_media_view_unique`, profileViews ← `page_views_total` | `GET /?ids=…&fields=insights.metric(…),reactions…,comments…,shares`; `GET /{page}/insights?period=day` | read_insights pages_read_engagement | 50 ids per `?ids=` read; page insights ≤ 90 days per request (split automatically) |
| `instagram` | likes ← `like_count`, comments ← `comments_count`, reach ← `reach`, impressions ← `views`, videoViews ← `views` (reels only), saves ← `saved`, shares ← `shares`. Stories: reach/views/shares | reach (daily series), followers (today, `followers_count`) | `GET /?ids=…&fields=media_product_type,like_count,comments_count`, then `insights.metric(…)` grouped by media type; `GET /{ig-user}/insights?metric=reach&period=day&metric_type=time_series` | instagram_basic instagram_manage_insights pages_read_engagement | 50 ids; account insights ≤ 30 days per request (split automatically) |
| `threads` | impressions ← `views`, likes ← `likes`, comments ← `replies`, shares ← `reposts` + `quotes` + `shares` | impressions ← `views` (daily series), followers (today, `followers_count`) | `GET /{media}/insights?metric=views,likes,replies,reposts,quotes,shares`; `GET /{user}/threads_insights` | threads_basic threads_manage_insights | No batch read: one request per post, 25 posts per call, 4 in flight. User insights start 2024-04-13 (clamped) |
| `youtube` | videoViews ← `viewCount`, likes ← `likeCount`, comments ← `commentCount` | followers ← `subscriberCount` (today; omitted if hidden) | `GET /youtube/v3/videos?part=statistics&id=…`, `GET /youtube/v3/channels?part=statistics&id=…` | youtube.readonly | 50 ids, 1 quota unit per call |
| `reddit` | likes ← `score` (net votes), comments ← `num_comments` | — | `GET /api/info?id=t3_…` | read | 100 fullnames |
| `linkedin_page` | impressions ← `impressionCount`, reach ← `uniqueImpressionsCount`, clicks ← `clickCount`, likes ← `likeCount`, comments ← `commentCount`, shares ← `shareCount` (lifetime, organic only) | impressions/reach (daily, organic), followers (today, `networkSizes`) | `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&shares=List(…)&ugcPosts=List(…)`; same with `timeIntervals=(…DAY)`; `GET /rest/networkSizes/{org}?edgeType=COMPANY_FOLLOWED_BY_MEMBER` | rw_organization_admin | 50 posts per call (no documented cap); statistics only cover a rolling 12 months (range clamped) |
| `linkedin` | **not supported** | — | — | — | see below |

### Gaps and why

- **LinkedIn personal profiles** have no analytics. Member post analytics need
  `r_member_postAnalytics`, which LinkedIn grants only to approved partners of
  the Community Management API for members. We do not request it, so
  `linkedin.analytics` is undefined and the collector skips those channels.
  Adding it later means app approval, adding the scope, and every personal
  LinkedIn connection reconnecting.
- **YouTube has no impressions or reach** in the Data API. They live in the
  YouTube Analytics API, which needs `yt-analytics.readonly` (a new scope → every
  YouTube channel would have to reconnect). Subscriber counts are rounded by
  YouTube to three significant figures.
- **Instagram**: the `follower_count` insight is *new* followers per day, not
  a total, so we use the account's current `followers_count` instead (today
  only). `profile_views` is no longer listed in the user-insights reference and
  is not read. `impressions`, `plays` and `video_views` were deprecated in
  Graph v22 (April 2025) in favour of `views`. Media with too few viewers
  ("Not enough viewers", code 10) keep their like/comment counts without
  insights — this is not treated as an auth error. Accounts under 100
  followers get no follower insights from Meta.
- **Facebook**: Meta deprecated `page_impressions*`, `post_impressions*` and
  `page_fans` on 2025-11-15 (replaced by the `*_media_view` "views" metrics and
  `page_follows`); `*_impressions_unique` is deprecated above v25. Video posts
  get likes/comments only: video insights need `pages_manage_engagement`, which
  we do not request.
- **LinkedIn pages**: a deleted post, or one older than 12 months, reads as all
  zeros (LinkedIn does not distinguish it from a post nobody engaged with), so
  the collector should stop polling posts after a year.
- **Reddit** exposes only the fuzzed net `score` and comment count: no views,
  impressions or shares, and no account-level analytics.
- **X** has no follower history (current count only) and no saves/clicks
  beyond `bookmark_count` in public metrics.

Docs used (September 2026): X
[posts lookup](https://docs.x.com/x-api/posts/get-posts-by-ids),
[data dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary),
[users/me](https://docs.x.com/x-api/users/get-my-user); Meta
[Page insights](https://developers.facebook.com/docs/graph-api/reference/insights),
[2025 Page Insights changes](https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/),
[IG media insights](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights),
[IG user insights](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights),
[Threads insights](https://developers.facebook.com/docs/threads/insights); YouTube
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list),
[channels.list](https://developers.google.com/youtube/v3/docs/channels/list); Reddit
[/api/info](https://www.reddit.com/dev/api#GET_api_info); LinkedIn
[share statistics](https://learn.microsoft.com/linkedin/marketing/community-management/organizations/share-statistics),
[organization lookup / networkSizes](https://learn.microsoft.com/linkedin/marketing/community-management/organizations/organization-lookup-api).

To verify against live accounts before relying on the numbers: the Graph
`?ids=` 50-id cap and the Instagram 30-day window (long-standing behaviour, not
stated on today's reference pages); X's `retweet_count` vs `repost_count`
naming (both are read); YouTube's 50-id cap on `videos.list`; LinkedIn's
practical cap on ids per share-statistics call.

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
