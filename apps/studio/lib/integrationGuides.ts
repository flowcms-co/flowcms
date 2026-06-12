/**
 * Step-by-step connection guides shown inside the integration connect flows.
 *
 * MAINTENANCE: external providers occasionally change their console UIs. Review
 * these steps periodically and bump `reviewedAt`. This is the single place to
 * update the in-product instructions — no other code changes needed.
 */

export type GuideStep = {
    title: string;
    body: string;
    link?: { href: string; label: string };
};

export type Guide = {
    title: string;
    intro?: string;
    reviewedAt: string;
    steps: GuideStep[];
};

const GOOGLE_SA_STEPS: GuideStep[] = [
    {
        title: "Open Google Cloud Console",
        body: "Sign in and create a new project (or pick an existing one) at the top-left project picker.",
        link: { href: "https://console.cloud.google.com/", label: "Open Cloud Console" },
    },
    {
        title: "Create a service account",
        body: "Go to IAM & Admin → Service Accounts → Create service account. Give it any name; you don't need to grant it any project roles.",
        link: {
            href: "https://console.cloud.google.com/iam-admin/serviceaccounts",
            label: "Service Accounts",
        },
    },
    {
        title: "Create a JSON key",
        body: "Open the service account → Keys → Add key → Create new key → JSON. A .json file downloads — that's what you paste below.",
    },
    {
        title: "Copy the service-account email",
        body: "It looks like name@your-project.iam.gserviceaccount.com — you'll grant this email access to your property next.",
    },
];

export const ANALYTICS_GUIDES: Record<"gsc" | "ga4", Guide> = {
    gsc: {
        title: "Connect Google Search Console",
        intro: "Uses a Google service account with read access to your verified site.",
        reviewedAt: "June 2026",
        steps: [
            ...GOOGLE_SA_STEPS,
            {
                title: "Enable the Search Console API",
                body: "In the same project, enable the Google Search Console API.",
                link: {
                    href: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
                    label: "Enable Search Console API",
                },
            },
            {
                title: "Grant the service account access in Search Console",
                body: "Settings → Users and permissions → Add user → paste the service-account email → permission Full (or Restricted). You must be an Owner of the property to add users.",
                link: { href: "https://search.google.com/search-console", label: "Open Search Console" },
            },
            {
                title: '"Email not found" when adding the user?',
                body: "Copy the email exactly from IAM & Admin → Service Accounts (use the copy icon); confirm you're an Owner. A brand-new service account can take up to an hour or two to be recognized by Google's add-user check — wait and retry.",
            },
            {
                title: '"Insufficient permission" on Sync?',
                body: "Two causes: (1) the Site URL above doesn't exactly match the property (trailing slash / sc-domain: form), or (2) the service-account email isn't added as a user on that exact property yet. Fix both, then Sync again. Connecting always works first — only Sync needs the grant.",
            },
            {
                title: "Enter your Site URL above — exactly as shown",
                body: "Copy it precisely from Search Console: a URL-prefix property keeps its trailing slash (https://example.com/), and a domain property uses the sc-domain: form (sc-domain:example.com). A mismatch causes a 'does not have sufficient permission' error even when access is granted.",
            },
            {
                title: "Paste the JSON below and Connect",
                body: "Then click Sync now to pull your data — the dashboard charts will switch to live.",
            },
        ],
    },
    ga4: {
        title: "Connect Google Analytics 4",
        intro: "Uses a Google service account with Viewer access to your GA4 property.",
        reviewedAt: "June 2026",
        steps: [
            ...GOOGLE_SA_STEPS,
            {
                title: "Enable the Analytics Data API",
                body: "In the same project, enable the Google Analytics Data API.",
                link: {
                    href: "https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com",
                    label: "Enable Analytics Data API",
                },
            },
            {
                title: "Grant the service account access in GA4",
                body: "Admin → Property Access Management → + → add the service-account email with the Viewer role.",
                link: { href: "https://analytics.google.com/", label: "Open Google Analytics" },
            },
            {
                title: "Enter your Property ID above",
                body: "Admin → Property details → PROPERTY ID (a number like 123456789). Paste just the number.",
            },
            {
                title: "Paste the JSON below and Connect",
                body: "Then click Sync now to pull sessions, pageviews and bounce rate.",
            },
        ],
    },
};

/** Generic guide for AI providers — most just need an API key from their console. */
export function aiProviderGuide(name: string, docs: string | null, keyOptional: boolean): Guide {
    const steps: GuideStep[] = [];
    if (docs) {
        steps.push({
            title: `Open the ${name} API keys page`,
            body: "Sign in to the provider and find the API keys section.",
            link: { href: docs, label: `Open ${name}` },
        });
        steps.push({ title: "Create a new API key", body: "Generate a key and copy it (you usually can't view it again)." });
    } else {
        steps.push({
            title: "Get your endpoint + key",
            body: "For a self-hosted or custom endpoint, have your base URL ready (and a key if your server requires one).",
        });
    }
    steps.push({
        title: keyOptional ? "Paste the key (if any) and Connect" : "Paste the key and Connect",
        body: "We test it against the provider, then store it encrypted. You can change it anytime.",
    });
    return { title: `Connect ${name}`, reviewedAt: "June 2026", steps };
}
