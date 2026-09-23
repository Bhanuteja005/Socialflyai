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
| `linkedin_page` | same app + "Community Management API" | same | w_organization_social r_organization_social rw_organization_admin r_organization_social_feed¹ w_organization_social_feed¹ | **Yes** (Community Management) |
| `facebook` | developers.facebook.com → Business app, Facebook Login for Business | `META_APP_ID/SECRET` | pages_show_list pages_read_engagement pages_manage_posts pages_manage_metadata read_insights business_management pages_read_user_content¹ pages_manage_engagement¹ | **Yes** (App Review for advanced access) |
| `instagram` | same Meta app + Instagram Graph API | same | instagram_basic instagram_content_publish instagram_manage_insights instagram_manage_comments + page scopes | **Yes**; IG account must be Business/Creator linked to a Page |
| `threads` | same Meta developer account → Threads use case | `THREADS_APP_ID/SECRET` | threads_basic threads_content_publish threads_manage_insights threads_manage_replies threads_read_replies¹ | **Yes** |
| `x` | developer.x.com → project app, OAuth 2.0, type "Web App" (confidential) | `X_CLIENT_ID/SECRET` | tweet.read tweet.write users.read media.write offline.access | Paid API tier for meaningful volume |
| `reddit` | reddit.com/prefs/apps → "web app" | `REDDIT_CLIENT_ID/SECRET`, `REDDIT_USER_AGENT` | identity submit read flair | Commercial use needs Reddit approval |
| `youtube` | console.cloud.google.com → YouTube Data API v3, OAuth consent screen | `YOUTUBE_CLIENT_ID/SECRET` | youtube.upload youtube.readonly userinfo.profile youtube.force-ssl¹ | **Yes** (Google verification + quota increase; default quota ≈ 6 uploads/day) |

¹ Added for the engagement inbox (phase 6). Channels connected before it hold
tokens without these scopes and must **reconnect** to use the inbox — see
[Engagement inbox](#engagement-inbox). Each new Meta permission also needs App
Review before non-tester accounts can grant it.

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
  only channels reconnected since the engagement inbox hold (not read yet).
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

## Engagement inbox

Adapters expose comments, replies, mentions and keyword listening through
`SocialProvider.engagement` (`packages/integrations/src/types.ts`):
`listComments(channel, { postExternalIds, since })` for comments/replies under
our published posts, optional `listMentions`, `reply`, and optional
`searchDiscussions` for listening. Shared helpers live in
`packages/integrations/src/engagement.ts`. The rules every adapter follows:

- **`reply` is mutating**, exactly like `publish()`: it creates a visible public
  post, so it passes `mutating: true` and a timeout, connection reset or 5xx
  (and a 2xx without an id) becomes `unknown_outcome` — mark it unconfirmed,
  never retry it. Only the final create call is mutating; look-ups before it
  (Facebook/LinkedIn parent comment) and Threads' reply container are not.
  Empty or too-long text is refused as `invalid_request` before anything is sent.
- **Reads are never mutating**: 5xx is `transient`, 401/403/revoked permission
  `auth`, throttling `rate_limited`. Per-post problems that say nothing about the
  token (deleted post, comments disabled, private subreddit) skip that post
  instead of failing the call — otherwise a healthy channel would be sent to
  `needs_reauth`.
- **`postExternalId` is exactly what `publish()` returned** (Facebook `{page}_{post}`
  or a video id, IG/Threads media id, X post id, Reddit `t3_…`, YouTube video id,
  LinkedIn `urn:li:share:`/`urn:li:ugcPost:`), so items join to `post_targets`.
- **`since` is "strictly newer than"**, applied to `createdAt`. Results are
  deduplicated by `externalId` and sorted oldest first, whatever order the
  platform used.
- **Bounded reads**: at most 5 pages per post (or per listening query) per call.
  Only where the platform documents newest-first order (Facebook with
  `order=reverse_chronological`, Threads `/conversation`) do we stop at the first
  page that reaches back past `since`; elsewhere `since` is a filter and a very
  busy post may need several polls.
- **`kind`**: a reply directly on our post is a `comment`; a reply to someone's
  comment is a `reply` with `parentExternalId` = its direct parent (for platforms
  that nest one level — Facebook, Instagram, YouTube, LinkedIn — that is the
  top-level comment). `fromSelf` marks items written by the channel itself.
- Text is plain: X's `&amp;`-style entities are decoded, YouTube is read with
  `textFormat=plainText`, Reddit with `raw_json=1`.

| Provider | Reads | Reply | Mentions | Listening | Endpoints | Scopes (read / reply) | Limits |
|---|---|---|---|---|---|---|---|
| `facebook` | All-level comments on Page posts and videos, author identity | As the Page, on the comment (a reply to a reply goes to its top-level comment) | — | — | `GET /{post}/comments?filter=stream&order=reverse_chronological`; `POST /{comment}/comments?fields=id,permalink_url` | pages_read_engagement + **pages_read_user_content** (NEW) / **pages_manage_engagement** (NEW) | 25 posts/call, 4 in flight, 100/page; reply ≤ 8,000 chars |
| `instagram` | Top-level comments + replies (inline `replies.limit(50)`) | `POST /{comment}/replies` (IG nests one level itself) | — | — | `GET /{media}/comments`; `POST /{comment}/replies` | instagram_basic instagram_manage_comments pages_read_engagement / instagram_manage_comments — all already held | 25 posts/call, 50/page; reply ≤ 2,200 chars |
| `threads` | Every reply at any depth under our posts | Reply container with `reply_to_id` → `threads_publish` | — | — | `GET /{media}/conversation?reverse=true`; `POST /{user}/threads`, `POST /{user}/threads_publish` | threads_basic + **threads_read_replies** (NEW) / threads_manage_replies | 25 posts/call; reply ≤ 500 chars; 1,000 API replies per profile per 24 h |
| `x` | Replies to our posts from the last 7 days | `POST /2/tweets` with `reply.in_reply_to_tweet_id` | ✓ `GET /2/users/:id/mentions` | ✓ recent search | `GET /2/tweets/search/recent` (`conversation_id:a OR conversation_id:b …`) | tweet.read users.read / tweet.write — already held | 10 posts per query, 100/page; reply ≤ 280 weighted chars (URL = 23, CJK/emoji = 2). **Paid tier required** |
| `youtube` | Comment threads + replies (threads with more replies than inline are expanded, ≤ 20 per video per call) | `comments.insert` with `snippet.parentId` = top-level comment | — | — | `commentThreads.list?part=snippet,replies&videoId=…&order=time`; `comments.list?parentId=…`; `comments.insert` | youtube.readonly (held) / **youtube.force-ssl** (NEW) | 25 videos/call; 1 quota unit per read page, **50 units per reply**; reply ≤ 10,000 chars |
| `reddit` | Whole comment tree of our submissions (`sort=new`, depth 10, up to 500) | `POST /api/comment` on `t1_`/`t3_` | — | ✓ site-wide `/search` | `GET /comments/{id}`; `POST /api/comment`; `GET /search?sort=new&type=link&restrict_sr=false&t=…` | read / submit — already held | 10 posts/call (one request each); reply ≤ 10,000 chars; search `t` = smallest window covering `since` (week without one) |
| `linkedin_page` | First-level comments + nested comments (≤ 20 threads per post per call) | As the organization (`actor` = org URN, `parentComment`), a reply to a reply goes to its top-level comment | — | — | `GET /rest/socialActions/{postUrn}/comments?start&count`; `GET /rest/socialActions/{commentUrn}/comments`; `POST /rest/socialActions/{commentUrn}/comments` | **r_organization_social_feed** (NEW) / **w_organization_social_feed** (NEW) | 20 posts/call, 100/page; reply ≤ 1,250 chars; LinkedIn throttles comment creation per member per minute |
| `linkedin` | **not supported** | — | — | — | — | — | see below |

### New scopes: affected channels must reconnect

Tokens only carry the scopes granted when the channel was connected. The
scopes marked NEW above were added to the OAuth request in this phase, so:

- **Facebook** Pages, **Threads** profiles, **YouTube** channels and **LinkedIn
  Pages** connected before phase 6 must reconnect before the inbox can read
  (Facebook, Threads, LinkedIn) or reply (Facebook, YouTube, LinkedIn). YouTube
  can still *read* comments on old connections.
- `engagement.requiredScopes` is meant to be compared with `channels.scopes` to show
  "reconnect to enable the inbox" instead of failing. Caveat: Meta and Threads
  record the *requested* scope list at connect time (Facebook Login does not
  echo what was granted), so a user who unticks a permission in the dialog will
  surface as an `auth` error on first use rather than up front.
- Meta: `pages_read_user_content`, `pages_manage_engagement` and
  `threads_read_replies` need **App Review** (advanced access) before accounts
  that are not app testers can grant them. The LinkedIn `_feed` scopes come with
  the Community Management API product the app already has.
- Token refreshes do not change `channels.scopes`, so a refreshed old channel is
  still correctly reported as missing the new scopes.

### Engagement gaps and why

- **LinkedIn personal profiles**: reading comments on a member's posts needs
  `r_member_social_feed`, which LinkedIn grants "to select developers only".
  `linkedin.engagement` is undefined and the inbox skips those channels.
- **X**:
  - Search and the mentions timeline need a **paid API tier** (not in Free), and
    every post read counts against the app's monthly read cap — poll sparingly.
  - Recent search covers **7 days**: replies to older posts are never seen, and
    `start_time` is clamped into that window.
  - Since February 2026, apps on Free/Basic/Pro/pay-per-use may only reply when
    the author of the post being answered **mentioned or quoted us**. X answers
    other replies with a 403 about the conversation, mapped to `invalid_request`
    (not `auth`), so the UI should show "X only allows replying to people who
    mentioned you". Replies under our own posts usually qualify (a reply to us
    mentions us), but this is unverified against live accounts.
  - Replies to our posts also appear in the mentions timeline (a reply mentions
    the author it answers); the same post can come back from both calls with
    kind `comment` and `mention`. The worker should upsert by
    `(channel, externalId)` and keep the `comment` kind.
  - Listening appends `-is:retweet lang:en` unless the query already mentions
    `is:retweet` / `lang:`; ORed queries are wrapped in parentheses first.
- **Instagram**: no `listMentions`. Caption/comment @mentions are only delivered
  through the `mentions` **webhook** (its ids are what `/{ig-user}/mentions`
  answers); the `/tags` edge lists photo tags, which the documented API cannot
  reply to. Comments on live videos and hidden comments cannot be answered.
  Comments have no permalink (`url: null`).
- **Facebook**: no mentions (`/{page}/tagged` needs more review surface for
  little value); without `pages_read_user_content` the commenter's identity is
  unknown. Video insights could now be read with `pages_manage_engagement` but
  are not yet (Analytics section).
- **Threads**: mentions (`threads_manage_mentions`) and keyword search
  (`threads_keyword_search`) need permissions we do not request.
- **YouTube**: no mentions feed in the Data API. `order=time` sorts threads by
  when they started, so we never stop early: a new reply on an old thread is
  found as long as the thread is within the first 500 threads. Replying spends
  50 quota units from the same 10,000-unit daily pool uploads use.
- **Reddit**: username mentions live in `/message/mentions`, which needs the
  `privatemessages` scope (and would expose the user's private messages), so
  `listMentions` is omitted. "Load more comments" stubs are skipped, not
  expanded; with `sort=new` the newest comments are always in the first 500.
  Listening searches posts only, not comments.
- **LinkedIn pages**: commenter names are not resolved (member profile lookups
  are restricted) — the author is just the actor URN. A 404 on the comments list
  means "no comments yet" as well as "deleted post"; both read as empty.

Docs used (September 2026): Meta
[object comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/),
[IG media comments](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments),
[IG comment replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies),
[IG comment](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment),
[IG mentions](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentions),
[IG tags](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/tags),
[Threads replies and conversations](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies/replies-and-conversations),
[Threads reply management](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies); X
[recent search](https://docs.x.com/x-api/posts/search-recent-posts),
[mentions](https://docs.x.com/x-api/users/get-mentions),
[create post](https://docs.x.com/x-api/posts/create-post),
[counting characters](https://docs.x.com/resources/fundamentals/counting-characters),
[reply restriction announcement](https://x.com/XDevelopers/status/2026084506822730185); YouTube
[commentThreads.list](https://developers.google.com/youtube/v3/docs/commentThreads/list),
[comments.list](https://developers.google.com/youtube/v3/docs/comments/list),
[comments.insert](https://developers.google.com/youtube/v3/docs/comments/insert); Reddit
[API reference](https://www.reddit.com/dev/api) (`/comments/{article}`, `/api/comment`, `/search`); LinkedIn
[Comments API](https://learn.microsoft.com/linkedin/marketing/community-management/shares/comments-api),
[Social actions](https://learn.microsoft.com/linkedin/marketing/community-management/shares/network-update-social-actions).

To verify against live accounts before relying on it: whether `commentThreads.list`
accepts a `youtube.readonly` token (Google's reference page does not list
scopes; if it demands `youtube.force-ssl`, move that scope into
`requiredScopes.read`); LinkedIn's single-comment lookup under the post URN for
nested comments (`GET /rest/socialActions/{postUrn}/comments/{id}` — falls back
to replying on the comment itself on 404) and whether comment text needs
little-text escaping (we send it raw); Facebook's read-after-write `fields` on
comment creation; X's `tweet.fields` parameter name (the new reference lists
`post.fields`; `tweet.fields` is what analytics already uses); the character
limits not stated in API references (Facebook 8,000, Instagram 2,200, YouTube
10,000, LinkedIn 1,250); Reddit docs could not be fetched this session and were
confirmed from secondary sources.

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
