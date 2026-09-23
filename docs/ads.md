# Ads

Phase 7 lets a workspace run paid campaigns on six ad platforms from one draft
(`CampaignDraft`). Every platform is an `AdsProvider`
(`packages/integrations/src/ads/types.ts`), and `createAdsRegistry(env)` in
`packages/integrations/src/ads/registry.ts` lists them. A platform without
credentials is hidden, as organic providers are. An ad account is a separate
connection from the organic page or profile: it asks for different OAuth
permissions, and often needs a different app approval.

## Safety model

Ads spend real money, and a mistake is paid for before anyone notices. Every
adapter keeps the same rules.

1. **Paused by default.** `createCampaign` creates every object paused
   (campaign, ad set or ad group, creative, ad) or in the platform's
   non-serving draft state. The platform's own default is ignored: Google
   Ads, for example, creates campaigns `ENABLED` unless told otherwise. Tests
   check this by reading the request bodies.
2. **Explicit activation.** Spending starts only through
   `setStatus(campaign, "active")`, which the user confirms in the app.
   Activation enables the paused children first and the campaign **last**, so
   nothing delivers until every part is in place. Pausing touches only the
   campaign, which stops all delivery beneath it.
3. **Budget ceiling.** `validate()` checks the budget before any call: exactly
   one of daily or lifetime, the documented platform minimum, and at most as
   many decimals as the currency (and platform) allow. Budgets are never
   rounded silently: `25.555 USD` is rejected, not sent as `25.56`.
   Conversion to the platform unit (cents, Meta's offset units, micros,
   decimal strings) uses integer math only. On top of this, the caller applies
   the hard ceiling `ADS_MAX_DAILY_BUDGET` (`packages/config/src/ads.ts`).
4. **Unknown outcome.** Every create, update, status and archive call is
   `mutating: true`. A timeout, reset connection or 5xx after sending raises
   `ProviderError` of kind `unknown_outcome`, and the adapter never retries
   it. The campaign row becomes "needs checking" and the user looks in the
   platform's ads manager. A retry here is how duplicate campaigns (and double
   spend) happen.
5. **Cleanup after partial failure.** Creation takes several calls on most
   platforms. If a later step fails, the adapter deletes or archives what it
   already created, newest first, and rethrows with the original error kind.
   Ids it could not remove are in `error.details.orphanedExternalIds`. They
   are paused and spend nothing, but they need a person to delete them. Google
   Ads creates everything in one atomic request, so it has nothing to clean
   up.
6. **Targeting is never dropped.** A targeting field an adapter does not
   implement (for example gender on Google Search) is a `validate()` error,
   not ignored. Ignoring it would widen the audience and spend on people the
   user excluded. Platform features that widen audiences (Meta Advantage+
   audience, LinkedIn audience expansion and Audience Network) are turned off
   explicitly.

**Declarations.** Meta (`special_ad_categories: []`), Google
(`containsEuPoliticalAdvertising: DOES_NOT_CONTAIN_…`) and LinkedIn
(`politicalIntent: NOT_POLITICAL`) all require a declaration that the ad is
not political advertising or in a special category. LinkedIn requires the
partner app to show the advertiser a consent notice, checked by default. The
adapters send the "not political / no special category" declaration, so **the
app must show that confirmation before creating a campaign**. `CampaignDraft`
has no field for it yet.

**Context metadata.** Some adapters need a choice the user makes after
connecting, read from `AdsContext.metadata`:

| Platform | Field | Why |
|---|---|---|
| meta_ads | `pageId` (required), `instagramUserId`, `pixelId` (leads/sales) | the Page (and IG account) the ads run as; the pixel that website leads/sales optimise for |
| google_ads | `loginCustomerId`, `timeZone` (set on connect) | access path header and the account's date zone |
| linkedin_ads | `organizationUrn` (set on connect from the account's `reference`, can be overridden) | the company page that authors the sponsored post |

`validate(draft, { currency })` cannot see metadata, so a missing `pageId` or
`organizationUrn` is reported by `createCampaign`'s pre-flight check as
`invalid_request`, before any request is sent.

## Platforms

### Meta Ads (`meta_ads`) — Facebook + Instagram

Adapter: `packages/integrations/src/ads/meta-ads.ts`. API: Marketing API on
Graph `META_GRAPH_VERSION`. It uses the organic Meta app (`META_APP_ID/SECRET`).

**Setup and approval**

1. In the existing Meta app, add the **Marketing API** product.
2. Request **Advanced Access** for `ads_management`, `ads_read` and
   `business_management` through App Review, with a screencast of the connect
   and create flow. Business verification is required. Until then, only users
   with a role on the app can connect ad accounts, which is fine for testing.
3. The Marketing API access tier (Development → Standard) sets the rate limits.
   Apply for Standard once the app makes real API calls.

**Scopes.** `ads_management ads_read business_management pages_show_list
pages_read_engagement instagram_basic`. The Page scopes let the user pick the
Page, and its linked Instagram account, that the ads run as. If Meta rejects
creatives for Page permissions, add `pages_manage_ads`.

**Connect.** Facebook Login, then a long-lived user token (about 60 days, no
refresh token; the user reconnects). Accounts come from
`/me/adaccounts`. `account_status` is mapped as 1 or 9 (grace period) →
active, 7 or 8 → pending, anything else → disabled. `min_daily_budget` and the
user's Pages go into metadata.

**What gets created (all `PAUSED`)**

1. The campaign: ODAX objective, `special_ad_categories: []`,
   `is_adset_budget_sharing_enabled: false`.
2. One ad set, with:
   - `daily_budget` or `lifetime_budget` as an integer string in Meta's
     offset units: cents, or whole units for CLP, COP, CRC, HUF, ISK, IDR,
     JPY, KRW, PYG, TWD and VND
   - `billing_event: IMPRESSIONS` and `LOWEST_COST_WITHOUT_CAP`
   - Unix `start_time`/`end_time`
   - the targeting spec: countries, or cities/regions/zips from the picker,
     plus age, gender and interests, with
     `targeting_automation.advantage_audience: 0`
3. Per ad: the video, if any (`/advideos` with `file_url`, polled until
   `status.video_status` is `ready`, bounded to 3 minutes); then a creative
   (`object_story_spec` with `page_id` and optional `instagram_user_id`, and
   `link_data` with `picture` URL, or `child_attachments` for a carousel, or
   `video_data`); then the ad.

A failure deletes the objects created so far, newest first.

**Objectives**

| Ours | Meta objective | Ad set optimisation |
|---|---|---|
| awareness | OUTCOME_AWARENESS | REACH |
| traffic | OUTCOME_TRAFFIC | LINK_CLICKS |
| engagement | OUTCOME_ENGAGEMENT (ON_POST) | POST_ENGAGEMENT |
| video_views | OUTCOME_ENGAGEMENT (ON_VIDEO) | THRUPLAY |
| leads | OUTCOME_LEADS | OFFSITE_CONVERSIONS, pixel event LEAD (`metadata.pixelId`) |
| sales | OUTCOME_SALES | OFFSITE_CONVERSIONS, pixel event PURCHASE (`metadata.pixelId`) |

**Formats:** image (1 image), video (1 video plus an optional thumbnail image;
without one, Meta's preferred thumbnail is used), carousel (2–10 images).

**Limits enforced by `validate()`**

- USD minimum daily budget: 0.50 for awareness and 2.50 for the rest (ad set
  reference, `LOWEST_COST_WITHOUT_CAP`). A lifetime budget must be at least
  that × days.
- For any currency, `createCampaign` also checks the account's own
  `min_daily_budget`.
- Ages 13–65. At most 50 ads.
- Text: primary text 2,200 (Instagram's cap), headline and description 255.
- Language, keyword, job-title and industry targeting are rejected.

**Status and reporting**

- `setStatus("active")` sets the paused ad sets, then the ads, to ACTIVE, and
  the campaign last.
- `archiveCampaign` sets `ARCHIVED`.
- Status reads the campaign's `effective_status` and, while it is active, the
  ads' review states (PENDING_REVIEW → in_review, all DISAPPROVED → rejected).
- Insights: `/{campaign}/insights?time_increment=1` returns `spend` (already in
  major units), impressions, reach and clicks. Conversions are the aggregated
  `purchase` + `lead` action types; video views are the `video_view` action
  (3-second views).
- Targeting search uses `/search?type=adinterest` and `type=adgeolocation`.

**Gaps and unconfirmed**

- App installs is not offered (it needs an app id and store URL).
- Minimum budgets outside USD come only from the account's `min_daily_budget`;
  the "2x in some countries" rule is Meta's to enforce.
- `is_adset_budget_sharing_enabled` and `advantage_audience` follow Meta's
  2025 API changes; confirm them on the first sandbox run.
- The status field on video uploads (`status.video_status`) is from the Video
  API docs and is not in the advideos reference page.

### Google Ads (`google_ads`)

Adapter: `packages/integrations/src/ads/google-ads.ts`. API: Google Ads API
REST, `https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}`.

**Setup and approval**

1. In a Google Cloud project, enable the Google Ads API, configure the OAuth
   consent screen and create a web OAuth client. The YouTube project can be
   reused. Set `GOOGLE_ADS_CLIENT_ID/SECRET`.
2. In a Google Ads **manager (MCC)** account, open API Center and get a
   **developer token**. It starts as "Test account access", which can only
   touch test accounts. Apply for **Basic access** (15,000 operations/day)
   before real advertisers use it; Standard access removes the cap. Set
   `GOOGLE_ADS_DEVELOPER_TOKEN`. The provider counts as configured only when
   the token is present.
3. `adwords` is a sensitive scope, so the OAuth app needs Google verification
   before it can be published.
4. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is optional. It is the MCC used as the
   access path for accounts connected through a manager.
5. **Set `GOOGLE_ADS_API_VERSION` to a supported version (v23 or later, as of
   September 2026).** The config default `v21` has been sunset. The adapter
   sends `startDateTime`/`endDateTime` for v23+ and `startDate`/`endDate` for
   older versions.

**Scope.** `https://www.googleapis.com/auth/adwords`, requested with
`access_type=offline&prompt=consent` so Google issues a refresh token
(`refreshTokens` is supported). Every request carries `developer-token` and
`login-customer-id`.

**Connect.** `customers:listAccessibleCustomers` lists the accounts, and each
one is described with a GAQL read on `customer` (name, currency, time zone,
status, manager). Manager accounts are listed but `disabled`, because they
cannot hold campaigns. Unreadable (for example cancelled) accounts are
`disabled`.

**What gets created: ONE atomic `googleAds:mutate`**

The request uses temporary resource names (`campaignBudgets/-1`,
`campaigns/-2`, `adGroups/-3`):

- a campaign budget: `amountMicros` via cents, `STANDARD`, not shared
- the campaign: `SEARCH`, **`status: PAUSED`**, Google Search plus search
  partners, no Display, `PRESENCE` geo targeting, the EU political
  declaration and dates in the account time zone. Bidding is Maximize clicks
  (`targetSpend`) for traffic, or Maximize conversions for leads/sales, which
  needs conversion tracking in the account.
- campaign criteria: countries resolved to `geoTargetConstants` by a GAQL read
  beforehand (or locations from the picker), and languages to
  `languageConstants`
- an ad group: `SEARCH_STANDARD`, **PAUSED**
- keywords: bare = BROAD, `"…"` = PHRASE, `[…]` = EXACT
- Responsive Search Ads, **PAUSED**

Google applies all of it or none of it, so **no cleanup is ever needed**. A
timeout on this call is `unknown_outcome`.

**Objectives and formats.** traffic, leads, sales. Format **search** only.
Image, video and carousel need Performance Max or Demand Gen, which are
asset-group campaigns with their own asset rules (logos, several aspect
ratios, YouTube-hosted video) and Google-driven automation. They are out of
scope, and `validate()` says so.

**Limits enforced by `validate()`**

- 3–15 headlines of at most 30 characters and 2–4 descriptions of at most 90.
- No media.
- At least one keyword, each at most 80 characters and 10 words.
- At most 3 RSAs (Google's limit of enabled RSAs per ad group).
- Daily budget only: lifetime ("total") budgets exist only for some campaign
  types.
- The budget has at most the currency's decimals, which is Google's minimum
  unit rule.
- Age, gender, interest, job-title and industry targeting are rejected.

**Status and reporting**

- `setStatus("active")` reads the campaign's paused ad groups and ads and
  enables them with the campaign in one atomic mutate.
- `archiveCampaign` removes the campaign (`REMOVED` is final).
- Status uses `campaign.status` + `primary_status` +
  `primary_status_reasons`: ENDED → archived, NOT_ELIGIBLE with
  HAS_ADS_DISAPPROVED → rejected, MOST_ADS_UNDER_REVIEW → in_review.
- Insights come from GAQL (`segments.date`, `metrics.cost_micros` → spend,
  impressions, clicks, conversions).
- Targeting search covers locations via `geoTargetConstants:suggest`. Keyword
  ideas (KeywordPlanIdeaService) are out of scope.

**Gaps and unconfirmed**

- Client accounts reachable only through a manager are not expanded
  (`customer_client`); the user must have direct access.
- `manageUrl` is null: Ads UI deep links need an internal id (`ocid`) that the
  API does not expose.
- Google counts CJK characters as width 2 in RSA limits; we count code points.

### LinkedIn Ads (`linkedin_ads`)

Adapter: `packages/integrations/src/ads/linkedin-ads.ts`. API: LinkedIn
Marketing API (versioned `/rest/*`, `LINKEDIN_API_VERSION`). It uses the
organic LinkedIn app (`LINKEDIN_CLIENT_ID/SECRET`).

**Setup and approval**

1. In the LinkedIn developer portal, request the **Advertising API** product
   for the app. Development tier comes first: it can manage only the ad
   accounts the developer has access to. Upgrade to **Standard** tier (a
   review of the integration) before customers connect.
2. The member who connects needs a role on the ad account. VIEWER and
   CREATIVE_MANAGER can connect, but their accounts show as `disabled`
   because they cannot create campaigns.
3. **Set `LINKEDIN_API_VERSION` to a live version.** LinkedIn sunsets versions
   after about a year: `202510` is sunset on 2026-10-15, and the config
   default `202509` may already be. This also affects the organic LinkedIn
   providers.

**Scopes.** `r_ads rw_ads r_ads_reporting r_organization_social`. Without a
partner programme there are no refresh tokens, so the user reconnects every
60 days.

**Connect.** `adAccounts?q=search` (all accessible accounts) plus
`adAccountUsers?q=authenticatedUser` (the member's role). The account's
`reference` organization becomes `metadata.organizationUrn`. LinkedIn budgets
and reports run on UTC days.

**What gets created**

1. A campaign group in **`DRAFT`**. Groups can only be created ACTIVE or DRAFT;
   a DRAFT group serves nothing and can be hard-deleted.
2. The campaign in **`PAUSED`**, with:
   - `SPONSORED_UPDATES` and format `STANDARD_UPDATE` or `SINGLE_VIDEO`
   - auto-bidding, with `unitCost` 0
   - `dailyBudget`, or `totalBudget` + `pacingStrategy: LIFETIME`, as
     `{amount: "50.50", currencyCode}` strings built from integers
   - `locale`
   - `targetingCriteria`: locations as countries resolved to `urn:li:geo` with
     the typeahead, plus job titles, industries and the interface locale
   - `audienceExpansionEnabled: false`, `offsiteDeliveryEnabled: false` and
     `politicalIntent: NOT_POLITICAL`
3. Per ad: the image (Images API) or video (Videos API, multi-part), owned by
   the organization. Then `creatives?action=createInline`, which creates the
   sponsored "dark" post (`adContext.dscAdAccount`, author = the organization,
   `contentLandingPage` and a CTA label) and the creative in one call, with
   **`intendedStatus: DRAFT`**. Review starts only on activation.

Cleanup deletes DRAFT creatives, sets the campaign to `PENDING_DELETION`
(only DRAFT campaigns can be hard-deleted) and deletes the DRAFT group.

**Objectives**

| Ours | objectiveType | optimizationTargetType | costType |
|---|---|---|---|
| awareness | BRAND_AWARENESS | MAX_IMPRESSION | CPM |
| traffic | WEBSITE_VISIT | MAX_CLICK | CPM |
| engagement | ENGAGEMENT | MAX_CLICK | CPM |
| video_views | VIDEO_VIEW | MAX_VIDEO_VIEW | CPV |

**Formats:** image, video (one format per campaign). CTA labels: learn_more,
sign_up, download, get_quote (VIEW_QUOTE) and subscribe. shop_now, contact_us
and book_now have no LinkedIn equivalent and are rejected.

**Limits enforced by `validate()`**

- USD minimum: 10/day, or 100 lifetime (Help Center "minimum campaign budget").
- Introductory text 600, headline 200, at most 15 ads.
- One language, which must be a supported locale.
- Age, gender, interest and keyword targeting are rejected.

**Status and reporting**

- `setStatus("active")` sets the group ACTIVE, then DRAFT/PAUSED creatives
  ACTIVE, then the campaign ACTIVE. Pausing sets only the campaign.
- `archiveCampaign` sets `ARCHIVED`.
- Status maps the campaign status plus the review of active creatives (all
  REJECTED → rejected, PENDING/NEEDS_REVIEW with none APPROVED → in_review).
- Insights: `adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY`
  with `costInLocalCurrency` → spend, impressions, clicks,
  `externalWebsiteConversions` → conversions, and videoViews.
- Targeting search uses the `adTargetingEntities` typeahead for the locations,
  titles and industries facets.

**Gaps and unconfirmed**

- A PAUSED campaign inside a DRAFT campaign group is not documented either
  way. If LinkedIn rejects it, create the group ACTIVE instead. It serves
  nothing while the campaign is paused and the creatives are DRAFT.
- CPV with MAX_VIDEO_VIEW follows the docs' video sample (manual CPV). The
  general text says auto-bidding bills CPM. Confirm on the first run.
- Leads (Lead Gen Forms) and sales (WEBSITE_CONVERSION needs a conversion
  associated before activation) are not offered. Neither are carousel ads.
- The minimum budget outside USD is enforced by LinkedIn only. The text
  limits come from the Sponsored Content ad specs, not the API reference.


### TikTok Ads (`tiktok_ads`)

Adapter: `packages/integrations/src/ads/tiktok.ts`. API: TikTok API for Business
(Marketing API) v1.3, `https://business-api.tiktok.com/open_api/v1.3`.

**Setup**

1. Register a developer at <https://business-api.tiktok.com/portal> and create a
   Marketing API app and register the API's ads OAuth callback URL as its
   redirect URI.
2. Tick the permission groups the adapter uses: Ad Account Management, Ads
   Management (campaigns, ad groups, ads, creative/file upload), Reporting, and
   Tools (targeting lookups). TikTok returns them as numeric scope ids with the
   token, which we store as `scopes`. `AdsProvider.scopes` is empty because
   nothing is requested per authorization.
3. Set `TIKTOK_ADS_APP_ID` and `TIKTOK_ADS_APP_SECRET`.

**Approval.** The app must pass TikTok's Marketing API app review before
advertisers outside your own Business Center can authorize it. Rate limits
start at the "Basic" level; apply for more under My Apps → App Detail.

**OAuth.** The user goes to `https://business-api.tiktok.com/portal/auth?app_id&state&redirect_uri`.
The callback's `auth_code` is valid for 1 hour and can be used once, and it
becomes `code` in `exchangeCode`. `POST /oauth2/access_token/` returns a
**long-lived** token: it has no expiry and there is no refresh token. The
token ends when the advertiser revokes the app. Accounts come from the
returned `advertiser_ids` plus `/advertiser/info/`.

**What gets created (all `DISABLE`)**

1. The campaign, with `budget_mode: BUDGET_MODE_INFINITE`. The budget lives
   on the ad group, so only the ad-group minimum applies. A random
   `request_id` makes TikTok treat a replay of that exact request as a no-op.
2. The ad group, on `PLACEMENT_TIKTOK`. It carries:
   - locations: countries resolved via `/tool/region/`, or finer location ids from the picker
   - age groups, gender, languages and interest categories
   - `BUDGET_MODE_DAY` or `BUDGET_MODE_TOTAL`
   - a UTC schedule
   - `BID_TYPE_NO_BID` bidding
3. The video, uploaded by URL. The cover image is either the one supplied or
   the frame TikTok extracted, uploaded again as an image. Both are invisible
   library assets.
4. Ads (`SINGLE_VIDEO`), which run as the identity in
   `metadata.identityId`/`identityType` (default `CUSTOMIZED_USER`). The
   `display_name` is the ad's headline.

After creating, the adapter reads the campaign back. If TikTok enabled it
anyway, the adapter disables it (one report says campaign-level
`operation_status` can be ignored). Delivery needs all three levels enabled,
so nothing spends in the meantime.

`setStatus("active")` first enables the campaign's disabled ad groups and ads,
then the campaign, which is the master switch. `"paused"` disables only the
campaign. `archiveCampaign` uses `DELETE`, which is **terminal** on TikTok.

**Objectives and formats**

| Ours | TikTok objective | Optimisation / billing |
|---|---|---|
| awareness | REACH | REACH / CPM |
| traffic | TRAFFIC (`promotion_type: WEBSITE`) | CLICK / CPC |
| video_views | VIDEO_VIEWS | ENGAGED_VIEW / CPV |

**Formats:** video only.

**Limits enforced by `validate()`**

- The ad text is 1–100 characters with no emoji.
- The display name is at most 40 characters, and names at most 512.
- A **USD** budget must be at least 20/day. A lifetime budget must be at least
  20 × the number of scheduled days.
- Budgets can have at most 2 decimals, or be whole amounts for JPY, KRW, CLP
  and VND.
- A lifetime budget needs an end date.
- Ages must fall on TikTok's bucket edges: 18/25/35/45/55 to 24/34/44/54/55+.
  13–17 is never offered.
- An identity is required.

**Insights.** `/report/integrated/get/` with `AUCTION_CAMPAIGN` ×
`stat_time_day`, in 30-day windows, with dates in the advertiser's timezone.
It maps `spend`, `impressions`, `reach`, `clicks`, `conversion` and
`video_play_actions`. Values arrive as strings; `"-"` means unknown.

**Gaps and unconfirmed**

- **TikTok's docs site is unreachable from our dev network (India).** Every
  endpoint was confirmed against TikTok's official SDK
  (`tiktok/tiktok-business-api-sdk`: OpenAPI files and the error-code table)
  and the doc text mirrored in bububa's Go SDK. Live calls also need a
  VPN/proxy or a non-Indian host.
- The minimum budget for non-USD currencies is not checked; we rely on
  TikTok's rejection.
- The response shape of `ad/create` is unconfirmed. We read `data.ad_ids`,
  then `data.creatives[].ad_id`.
- ENGAGED_VIEW + CPV for VIDEO_VIEWS is unconfirmed; check it on the first
  sandbox run.
- Not supported:
  - image and carousel ads (images serve only on Pangle/app placements, and a
    carousel needs a `music_id`)
  - the engagement, leads, sales and app-installs objectives (they need a
    TikTok-account identity, form, pixel, catalog or app)
  - keyword targeting
- The per-endpoint rate-limit numbers are unpublished. The adapter paces
  writes at 20/min, and code 40100 waits 5 minutes as TikTok asks.

### Pinterest Ads (`pinterest_ads`)

Adapter: `packages/integrations/src/ads/pinterest.ts`. API: Pinterest API v5.
Fields and enums were checked against the official OpenAPI description
(v5.28.0): <https://github.com/pinterest/api-description>.

**Setup**

1. Create an app at <https://developers.pinterest.com/apps/> and add the
   redirect URI.
2. Set `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`.

**Approval.** New apps get **Trial** access: rate limits are per DAY, and
Pins and boards are visible only to their creator. Apply for **Standard**
access (it needs a demo video of the OAuth flow and the integration) before
real advertisers use it.

**Scopes.** `ads:read ads:write boards:read boards:write pins:read pins:write user_accounts:read`.
`boards:write` is needed because creating and deleting Pins requires it.

**OAuth.** The authorization-code flow sends the token request with HTTP
Basic auth. Access tokens last 30 days. Refresh tokens last 60 days and are
renewed on every refresh (`refreshTokens` is supported). `/v5/ad_accounts`
has no status field, so an account counts as `active` when the user's role
is OWNER, ADMIN or CAMPAIGN_MANAGER, and `disabled` otherwise.

**What gets created (all `PAUSED`)**

1. The campaign, with the budget at campaign level: `daily_spend_cap` or
   `lifetime_spend_cap` in integer **micro-currency** of the account currency.
   `is_campaign_budget_optimization` is true, since the objectives we use are
   campaign-budget-optimised.
2. The ad group, with:
   - `budget_type: CBO_ADGROUP` and `AUTOMATIC_BID`
   - `auto_targeting_enabled: false`, so no Performance+ widening of the
     audience the user picked
   - a `targeting_spec` with `LOCATION` (countries, or metro codes from the
     picker), `MINIMUM_AGE`/`MAXIMUM_AGE`, `GENDER`, `LOCALE` and `INTEREST`
3. **One Pin per ad**, on the board in `metadata.boardId` (created as the ad
   account owner via `?ad_account_id=`). Pins are public on that board, so a
   failed creation deletes them. Media depends on the format:
   - image: `image_url`
   - carousel: `multiple_image_urls` (2–5 images)
   - video: registered via `/v5/media`, uploaded to the S3 `upload_url`, and
     polled until `succeeded` (bounded to 5 minutes). The cover is a supplied
     image, or else the key frame at 0 s.
4. Ads (`REGULAR`, `VIDEO` or `CAROUSEL`), linking the ad group and the Pin.

`setStatus("active")` resumes the paused ad groups and ads, then the campaign
last. `"paused"` pauses only the campaign. Pinterest cannot delete campaigns,
so `archiveCampaign` and cleanup set it to `ARCHIVED`.

**Objectives.** awareness → AWARENESS (IMPRESSION), traffic and engagement →
CONSIDERATION (CLICKTHROUGH), video_views → VIDEO_COMPLETION (VIDEO_V_50_MRC).
VIDEO_VIEW is deprecated. **Formats:** image, video, carousel.

**Limits enforced by `validate()`**

- Pin title (headline) at most 100 characters, description (text) at most
  800, link at most 2048 and https only; names at most 255.
- Minimum age 18.
- The account currency must be one Pinterest supports.
- Budgets have at most 2 decimals, or whole amounts for JPY, KRW and CLP.
- A lifetime budget needs an end date.
- A board is required.

**Insights.** `/ad_accounts/{id}/campaigns/analytics` with `granularity=DAY`,
in chunks of 90 days and 250 campaigns. It reads:

| Pinterest column | Our field |
|---|---|
| `SPEND_IN_MICRO_DOLLAR` | spend (micro-units of the **account** currency, despite the name) |
| `TOTAL_IMPRESSION` | impressions |
| `TOTAL_IMPRESSION_USER` | reach |
| `TOTAL_CLICKTHROUGH` | clicks |
| `TOTAL_CONVERSIONS` | conversions |
| `TOTAL_VIDEO_3SEC_VIEWS` | video views |

**Targeting search.** `/v5/resources/targeting/{INTEREST|LOCATION}` has no
search parameter, so the adapter fetches the full list and filters it.

**Gaps and unconfirmed**

- Pinterest documents no minimum budget, so none is enforced.
- The spec says `bid_in_micro_currency` is "required" for some
  objective/billable-event pairs. We send `AUTOMATIC_BID` without a bid, which
  is unconfirmed until the first sandbox run.
- The CTA is not sent: `customizable_cta_type` has limited availability.
- The `exceptions` of ad items are typed as an object rather than an array;
  both shapes are parsed.
- Not supported: WEB_CONVERSION (needs a conversion tag), LEADS (needs a lead
  form) and keyword targeting (a separate keywords API).
- `manageUrl` points to the account's Ads Manager because no deep link to a
  single campaign is documented.
- Writes are paced at 60/min. The limit is 400/min on Standard but only
  300/**day** on Trial.

### X Ads (`x_ads`)

Adapter: `packages/integrations/src/ads/x-ads.ts`. API: X Ads API **v12**
(`https://ads-api.x.com/12`), the current version with no end-of-life date.
<https://docs.x.com/x-ads-api>

**Setup**

1. Create an app at console.x.com and enable OAuth 1.0a with a callback URL.
   The redirect URI must be registered; `state` is added to it as a query
   parameter.
2. Submit the **Ads API Access Form** (<https://docs.x.com/forms/ads-api-access>)
   for that app, asking for Standard Access. Approval takes up to ~3 business
   days.
3. Set `X_ADS_CONSUMER_KEY` and `X_ADS_CONSUMER_SECRET`. User tokens issued
   **before** the approval must be generated again.

**Auth.** OAuth 1.0a user context has no scopes and no refresh; tokens last
until the user revokes them. Every request is HMAC-SHA1 signed with
`node:crypto`, and there is a unit test against X's documented example. The
three-legged flow maps onto the contract like this:

| Contract | OAuth 1.0a |
|---|---|
| `getAuthorizationUrl` | `POST /oauth/request_token` (with `oauth_callback`), then redirect to `/oauth/authorize?oauth_token=` |
| returned `codeVerifier` | `"<request token>:<request token secret>"`. The API stores it with `state` |
| `exchangeCode({ code })` | `code` is the callback's `oauth_verifier` |
| result | `tokens.accessToken` and `tokens.tokenSecret`. The token secret must be stored encrypted and passed back as `ctx.accessTokenSecret` |

The OAuth user needs a role on the ad account: account administrator, ad
manager or creative manager.

**Accounts.** `/12/accounts` has no currency field; currency comes from the
account's funding instrument. The adapter takes the first funding instrument
that is `ACTIVE`, `able_to_fund` and not deleted, paused or cancelled. It
stores that instrument in `metadata.fundingInstrumentId` along with the
account timezone. An account with no such instrument is `disabled`, and one
with an approval status other than ACCEPTED is `pending`.

**What gets created (all `PAUSED`)**

1. The campaign, with `funding_instrument_id` and
   `daily_budget_amount_local_micro`. A lifetime budget is sent as both total
   and daily cap, because X requires a daily budget no larger than the total.
   Campaigns have no dates.
2. The line item, with:
   - `PROMOTED_TWEETS` on `ALL_ON_TWITTER`
   - `bid_strategy AUTO` and `standard_delivery`
   - `start_time`/`end_time`
3. Targeting criteria, created in one all-or-nothing batch:
   - `LOCATION`: country hashes looked up once, or location ids from the picker
   - `AGE`: one enum bucket
   - `GENDER`: 1 or 2
   - `LANGUAGE`
   - `INTEREST`
   - `BROAD_KEYWORD` for keywords
4. Media uploaded through v2 chunked upload (`amplify_video` for video, owned
   by the promotable user), then added to the account's Media Library.
5. A **website card**: media, plus the headline as title, plus the
   destination URL.
6. A **promoted-only tweet** (`nullcast=true`, never on the profile) posted as
   the account's FULL promotable user. The id is read from `id_str`, because
   `id` loses precision in JavaScript.
7. `promoted_tweets` linking the tweet to the line item.

`setStatus("active")` resumes the paused line items, then the campaign.
`"paused"` pauses only the campaign. `archiveCampaign` uses `DELETE`, which is
final. When a creation fails, the adapter deletes the line item and the
campaign. It does **not** delete cards or promoted-only tweets, which are
invisible and cannot spend without a line item; their ids are always listed
in `orphanedExternalIds`.

**Objectives and formats**

| Ours | X objective |
|---|---|
| awareness | REACH |
| traffic | WEBSITE_CLICKS |
| engagement | ENGAGEMENTS |
| video_views | VIDEO_VIEWS |

**Formats:** image, video.

**Limits enforced by `validate()`**

- Tweet text at most 280 characters, using X's weighted count.
- A headline is required (card title, at most 70 characters).
- Video at most 500 MB and 10 minutes.
- Ages must be one of X's buckets exactly: 13+, 18+, 21+, 25+, 35+, 50+,
  13/18/21–34, 13/18/21/25/35–49, 13/18/21/25/35–54, or 13–24.
- Languages are ISO 639-1 codes.
- An active funding instrument is required.
- Budgets use micro-units exactly.

**Insights.** Synchronous `/12/stats/accounts/:id` with `entity=CAMPAIGN`,
`granularity=DAY` and metric groups BILLING, ENGAGEMENT and VIDEO. Each
request covers at most 20 campaigns and 7 days, and windows run from midnight
to midnight in the **account timezone**. `billed_charge_local_micro` becomes
spend; `impressions`, `clicks` and `video_total_views` are also read. Billing
figures are estimates for about 3 days and can change for up to 14.

**Gaps and unconfirmed**

- X documents no minimum budget.
- The 70-character card title limit comes from the Ads Manager, not the API
  docs.
- The AGE enum comes from X's official Python SDK because the docs'
  enumeration page is gone.
- The Ads Manager deep link (`https://ads.x.com/ads_manager/{account}/campaigns`)
  is unconfirmed.
- Targeting lookups (`/targeting_criteria/locations|interests`) are *global*
  reads, limited to 5 per 15 minutes per user, so the picker must debounce.
  Each campaign creation spends one of these reads on the country lookup.
- Not supported: carousel, leads and sales (need a web event tag), and app
  installs.
