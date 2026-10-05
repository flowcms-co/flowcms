# The FlowCMS SEO crawler

FlowCMS reads your public site to audit it. This page says what it requests, how
it identifies itself, and what to allow so it is not blocked.

## User agent

```
FlowCMS-SEO-Auditor/1.0 (+https://flowcms.co)
```

Every request the crawler and the page audit make carries this user agent. If
your site, CDN or firewall has bot, rate or geo rules, allow it:

- **Cloudflare**: add a WAF custom rule with the expression
  `(http.user_agent contains "FlowCMS-SEO-Auditor")` and the action **Skip**
  (or **Allow**).
- **Vercel Firewall / other WAFs**: add an allow rule on the same user agent
  substring.
- **robots.txt** does not need a rule: the crawler only fetches the pages you
  manage and your sitemap, at a low rate.

Requests come from the server that runs your FlowCMS API (your own host on a
self-hosted install), so a geo rule has to allow that server's region.

## How fast it requests

The rate adapts to your site. It starts at **1 request per second per host**,
speeds up by half a request per second after every 10 healthy responses, and
never passes the workspace maximum (10 per second by default). Both numbers
are in Settings, Workspace, System; set the maximum equal to the start to hold
a fixed rate.

It slows down whenever the site asks:

- On **429 or 503** it halves its rate and stops sending to that host for the
  time in `Retry-After` (or 5, 10, 20 seconds and so on, doubling, when there
  is no header; 10 minutes at most), then resumes where it left off.
- It reads `RateLimit-Remaining` / `RateLimit-Reset` and the `X-RateLimit-*`
  equivalents, spreads the remaining requests over the window, and waits for
  the reset when none are left.

A page that answered 429, a 5xx error or nothing at all is never given
findings. A page checked before keeps its earlier result and its "last
fetched" date; a page with no earlier result is marked "not checked" and left
out of "clean pages". Both are retried: up to three more times in the same
run, then by the background check.

## How it avoids fetching

The audit does not crawl the whole site each time.

- **Only what changed.** "Run audit" fetches a page only when something it is
  built from changed since its last fetch: the entry, an entry it references
  (a parent service, a city, a tag), its content type's schema or URL pattern,
  a reusable component it uses, or a newer `lastmod` in your sitemap. Every
  other page is re-checked from what was last fetched, with no request. An
  unchanged workspace causes no requests at all.
- **Conditional requests.** Fetches send `If-None-Match` and
  `If-Modified-Since` from the last response, so an unchanged page can answer
  304 with no body.
- **Sampling large page types.** When more than 200 pages of one content type
  need fetching, the audit fetches a sample of 50 (the least recently checked,
  so it rotates). If those 50 agree on which JSON-LD types, canonical and
  robots tags the template renders, the rest are filled in from the sample and
  labelled "inferred from a sample". If they disagree, every page of that type
  is fetched. Inferred pages are never counted as clean.
- **Pages that can rank first.** Indexable pages are fetched in order of
  Search Console impressions, then other indexable pages, then noindexed ones.
- **A steady background check.** A few pages at a time, the stalest first, so
  every page is fetched again within 14 days (configurable) without anyone
  running anything. For 1,400 pages that is one request about every 14 minutes.
- **"Re-check every page"** is the explicit full crawl, as a background job
  you can pause or cancel.

## Telling FlowCMS the site changed

Call this from a deploy hook or your frontend, with a workspace API token (the
same Bearer token the delivery API uses):

```
POST /api/public/seo/signal
Authorization: Bearer <api token>
Content-Type: application/json

{ "urls": ["https://yoursite.com/a", "/b"] }    these pages changed
{ "deployed": true }                             the site was deployed
```

Changed URLs are fetched on the next run (one starts if none is running). A
deploy starts a sample re-check of each page type, not a full crawl.

## What it requests

| What | When | How many |
|---|---|---|
| Site crawl (Technical score) | On demand and when the stored crawl is over 10 minutes old; the stored result is served meanwhile | Up to 40 pages: the homepage, top Search Console pages, one page per content type, sitemap URLs and the CMS's own page URLs |
| `robots.txt`, `sitemap.xml`, `llms.txt` | With each crawl, and the sitemap once per audit run | One request each, plus up to 3 child sitemaps |
| Page audit (AI Optimizer) | "Run audit", the background check, and pages that changed | One request per page that changed or is due, at the page's real URL |
| PageSpeed Insights | Daily, in the background | Google fetches the homepage and one page per content type, mobile and desktop |

Only HTTP 200 responses are audited. Anything else is reported with its status
(for example "blocked: 403") instead of being treated as a page with missing tags.

## Where the URLs come from

- **Site URL**: Settings, Workspace, System. If it is empty, FlowCMS uses the
  connected Search Console property, then the origin of the live preview URL.
- **Page URLs**: each content type's page type and URL pattern (Schema Builder),
  for example `/{service.slug}/{city.slug}` or `/resources/tags/{slug}`. Types
  whose entries are not pages (cities, tags with no page of their own) are
  switched off with "Entries are pages on the site" and are not requested.

## If the crawler is blocked

The SEO dashboard shows "The site blocked the crawler" under Technical, and the
AI Optimizer lists the affected pages under "Live page could not be read" with
the HTTP status. Allow the user agent above, then refresh.
