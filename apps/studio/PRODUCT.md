# PRODUCT.md — Flow CMS studio (admin UI)

**What it is:** The admin UI for Flow CMS, an AI-powered, self-hostable headless
CMS. Content teams model content, write/schedule/publish entries, run an AI
writing suite (their own provider keys), track live SEO/analytics, manage media,
team, integrations and webhooks. Talks to a separate NestJS API.

**Register:** product. App UI / dashboard; the tool should disappear into the
task. Earned familiarity (Linear/Notion/Stripe-class trust), not spectacle.

**Audience (role-aware):**
- **Super Admin / Admin** — workspace, team, integrations, everything.
- **Search Strategist** — SEO/AEO, research, review/publish.
- **Editor** — write/edit content, AI tools, assets, submit for review.
Mixed technical fluency; some non-technical editors.

## Design Context

- **Brand:** purple `#6C5CE7` (lilac `#a29bfe` in dark). Unity-dashboard visual
  reference.
- **Type:** Poppins (display) + Inter (body/UI/data).
- **Radii:** no round pills anywhere (curved-square, `--radius-pill: 0.4rem`);
  avatars + status dots are the only exception.
- **Theme:** light + dark (next-themes); both must hold.
- **Tokens:** `apps/studio/app/globals.css`. Shell: `components/shell`; primitives:
  `components/ui`; screens: `templates/*` (Overview, setup, ContentPage,
  EditorPage, SchemaPage, QueuePage, CalendarPage, AssetsPage, ChatPage,
  NotificationsPage, ai, seo, settings).
- **Motion:** GSAP; word-wipe header reveal, count-ups, scroll-reveal; all
  focus/reduced-motion guarded. Block editor deliberately not animated.
- **Voice:** plain, specific; no em dashes; verb+object button labels.

## Key surfaces (audit focus)
- **Overview** (role-aware dashboards: shared/seo/editor).
- **Onboarding** `/setup` (full-screen wizard: choose path → starter/import →
  connect → finish; hand-built flat-vector illustrations).
