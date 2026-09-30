# What SocialFly is missing (compared with treg)

Reviewed 2026-09-24 against [superdesigndev/treg](https://github.com/superdesigndev/treg) (Apache-2.0),
used as a reference only. treg is an "OpenRouter for agent tools": one token gives an AI agent
3,000+ paid API endpoints (SEO, social, ads, enrichment, AI media) billed per call. Its catalog
overlaps SocialFly's space, so the list below covers both product features and platform/UX
patterns worth adopting. Nothing here is implemented yet.

Legend: **P1** = high value, fits the current product; **P2** = valuable, larger effort; **P3** = later.

## 1. AI-agent access (treg's core idea)

| Gap | treg has | For SocialFly | Priority |
| --- | --- | --- | --- |
| MCP server | `/mcp` + a Claude.ai connector with read/write-separated tools | Let Claude/ChatGPT agents draft, schedule and report ("post this to LinkedIn and X tomorrow 9am", "how did last week do?") | P1 |
| `llms.txt` + "Give this to your agent" | One-line setup prompt on the landing page and in onboarding | Public `llms.txt` describing the API; copyable setup block in Settings | P1 |
| Personal API keys | Token per user, masked by default, reveal/copy separate | Settings → API keys (scoped, revocable, last-used); the API already accepts bearer auth | P1 |
| CLI | `treg login / call / balance` | `socialfly post … --at …`, useful for CI and agents | P3 |
| Agent skill / plugin | Ships a `SKILL.md` + Claude Code plugin | Publish a SocialFly skill so agents know how to use the API | P2 |

## 2. Billing and usage

| Gap | treg has | For SocialFly | Priority |
| --- | --- | --- | --- |
| Billing | Prepaid team balance, top-ups, $1 free credit, per-call prices | Plans + Stripe checkout, AI credit top-ups (we only have a monthly AI budget cap today) | P1 |
| Usage & activity log | Activity page: every call, cost, status | Workspace activity: who scheduled/edited/deleted what, AI spend per generation (admin has an audit log; customers don't) | P1 |
| Bring your own keys | "Your own key always wins, never metered" (Secrets page) | Workspace OpenAI/Gemini/Anthropic keys for AI Studio, unmetered | P2 |
| Referrals | Referral page with rewards | Referral credits | P3 |

## 3. Features in treg's catalog that SocialFly lacks

| Gap | For SocialFly | Priority |
| --- | --- | --- |
| **TikTok, Pinterest, Bluesky, Google Business Profile publishing** | We support X, LinkedIn (profile + page), Facebook, Instagram, Threads, Reddit, YouTube; TikTok is the biggest hole | P1 |
| Social trends & discovery | Trending sounds/hashtags/videos per platform feeding the composer and AI Studio | P2 |
| Creator & influencer search | Find creators by niche/followers for collaborations | P2 |
| Reviews monitoring | Google Business, App Store/Play, G2 reviews into the Inbox | P2 |
| People/company enrichment | Enrich inbox authors (company, role) to spot leads | P3 |
| Search Console / GA4 / backlinks | Research tab: real rankings and traffic instead of estimates | P2 |
| E-commerce catalog (Shopify) | Product posts and ad creatives from the catalog | P3 |
| Voice cloning / brand voice library | The video studio already has AI voice-over; treg adds voice discovery and cloning as team resources | P3 |

## 4. UX patterns worth adopting

| Pattern | treg | Status in SocialFly |
| --- | --- | --- |
| Getting started page with numbered steps and copyable "try it" examples | Yes | Partly: the home page has a setup checklist; add a template/prompt gallery ("Try it") |
| Command/search everywhere | Search opens the catalog | Done: Ctrl/⌘K palette |
| Monochrome design, pixel titles, mono numbers | Yes | Done in this redesign (`docs/design.md`) |
| Help page / docs in-app | Help page | Missing: add Help (FAQ, shortcuts, contact) |
| Product tour | Dashboard tour script | Missing: first-run tour of the calendar and composer |
| Public programmatic SEO pages | Catalog/provider pages are public and indexed | Site has "Free tools"; add per-platform guides and tool pages |
| Credential health | `treg health` | Partly: channel health + reconnect exists |

## Suggested order

1. API keys + MCP server + `llms.txt` (agents are the differentiator; the API exists already).
2. Billing (Stripe plans, AI credit top-ups) + customer-facing activity log.
3. TikTok + Pinterest + Google Business Profile publishing.
4. Trends and creator discovery, reviews in the Inbox, Search Console/GA4 in Research.
5. BYO AI keys, help centre, product tour, referrals, CLI.
