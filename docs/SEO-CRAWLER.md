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

At most **1 request per second per host** by default. Change it per workspace
in Settings, Workspace, System ("SEO crawl rate", 0.1 to 10 requests per
second). At the default, auditing 1,600 pages takes about 27 minutes and runs
as a background job with progress.

If the site answers 429 or 503, the crawler stops sending to that host for the
time in `Retry-After` (or 5, 10, 20 seconds and so on, doubling, when there is
no header; 10 minutes at most), then resumes where it left off. A page that
answered 429, a 5xx error or nothing at all is never given findings. It is
marked "not checked", shown as such in the AI Optimizer, left out of "clean
pages", and retried: up to three more times in the same run, then by the
background audit.

## What it requests

| What | When | How many |
|---|---|---|
| Site crawl (Technical score) | On demand and when the stored crawl is over 10 minutes old; the stored result is served meanwhile | Up to 40 pages at the crawl rate: the homepage, top Search Console pages, one page per content type, sitemap URLs and the CMS's own page URLs |
| `robots.txt`, `sitemap.xml`, `llms.txt` | With each crawl | One request each, plus up to 3 child sitemaps |
| Page audit (AI Optimizer) | When you run the audit, and for pages that changed | One request per published page at the crawl rate, at the page's real URL |
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
