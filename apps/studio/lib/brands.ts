/**
 * Centralized third-party brand-icon registry.
 *
 * Maps a canonical brand key to its logo asset under
 * `/public/third-party-brand-icons/`, plus a table of aliases that resolve the
 * many identifiers used across the app (provider ids, AI-platform display names,
 * analytics source keys, import-source kinds) to that key.
 *
 * Render brands with the `<BrandIcon>` component, never by hardcoding a logo
 * path or a per-brand letter-badge colour inline. Adding a new brand = drop the
 * SVG in the asset folder, add one `BRANDS` entry, and (optionally) any aliases.
 */

export type BrandKey =
    // AI / model providers
    | "openai"
    | "anthropic"
    | "gemini"
    | "openrouter"
    | "mistral"
    | "xai"
    | "deepseek"
    | "perplexity"
    | "nvidia"
    | "together"
    | "fireworks"
    | "cohere"
    | "kimi"
    | "vercel"
    | "ollama"
    | "litellm"
    | "copilot"
    // Communication / automation
    | "slack"
    | "zapier"
    // CMS platforms
    | "wordpress"
    | "strapi"
    | "contentful"
    | "sanity"
    // Analytics / search data
    | "googleAnalytics"
    | "googleSearchConsole"
    | "pagespeed"
    | "dataforseo";

export interface BrandDef {
    /** Human label, used as the default alt text. */
    name: string;
    /** Filename under `/third-party-brand-icons/`. */
    file: string;
    /**
     * The surface the mark is designed to sit on. Most logos are dark/colour
     * marks that read on a light tile; a few (e.g. Grok) are white marks that
     * need a dark tile. Defaults to "light".
     */
    tile?: "light" | "dark";
}

export const BRANDS: Record<BrandKey, BrandDef> = {
    // ---- AI / model providers ----
    openai: { name: "OpenAI", file: "openai.svg" },
    anthropic: { name: "Anthropic", file: "claude.svg" },
    gemini: { name: "Google Gemini", file: "gemini.svg" },
    openrouter: { name: "OpenRouter", file: "openrouter.svg" },
    mistral: { name: "Mistral AI", file: "mistral_ai.svg" },
    xai: { name: "Grok", file: "grok.svg", tile: "dark" },
    deepseek: { name: "DeepSeek", file: "deepseek.svg" },
    perplexity: { name: "Perplexity", file: "perplexity.svg" },
    nvidia: { name: "NVIDIA", file: "nvidia.svg" },
    together: { name: "Together AI", file: "together.svg" },
    fireworks: { name: "Fireworks AI", file: "fireworks-ai.svg" },
    cohere: { name: "Cohere", file: "cohere.svg" },
    kimi: { name: "Kimi", file: "kimi.svg" },
    vercel: { name: "Vercel", file: "vercel.svg" },
    ollama: { name: "Ollama", file: "ollama.svg" },
    litellm: { name: "LiteLLM", file: "litellm.svg" },
    copilot: { name: "Microsoft Copilot", file: "copilot.svg" },
    // ---- Communication / automation ----
    slack: { name: "Slack", file: "slack.svg" },
    zapier: { name: "Zapier", file: "zapier.svg" },
    // ---- CMS platforms ----
    wordpress: { name: "WordPress", file: "wordpress.svg" },
    strapi: { name: "Strapi", file: "strapi.svg" },
    contentful: { name: "Contentful", file: "contentful.svg" },
    sanity: { name: "Sanity", file: "sanity.svg" },
    // ---- Analytics / search data ----
    googleAnalytics: { name: "Google Analytics", file: "google-analytics.svg" },
    googleSearchConsole: { name: "Google Search Console", file: "google-search-console.svg" },
    pagespeed: { name: "PageSpeed Insights", file: "google-pagespeed-insights.svg" },
    dataforseo: { name: "DataForSEO", file: "dataforseo.svg" },
};

/**
 * Lowercased alias → canonical key. Covers the back-end provider ids, the AI
 * platform display names that show up in SEO/AEO data, the analytics source
 * keys, and the import-source kinds. Anything not listed here (Copilot, Groq,
 * Google AI Overviews, Serper, Profound, Peec, raw domains, file formats)
 * resolves to `null` so the caller keeps its existing placeholder.
 */
const ALIASES: Record<string, BrandKey> = {
    // OpenAI / ChatGPT
    chatgpt: "openai",
    "chat gpt": "openai",
    gpt: "openai",
    // Anthropic / Claude
    claude: "anthropic",
    "anthropic (claude)": "anthropic",
    // Google Gemini
    "google gemini": "gemini",
    bard: "gemini",
    // xAI / Grok
    grok: "xai",
    "xai (grok)": "xai",
    // Mistral
    "mistral ai": "mistral",
    // Kimi / Moonshot
    "kimi (moonshot)": "kimi",
    moonshot: "kimi",
    // Vercel
    "vercel ai gateway": "vercel",
    // Ollama
    "ollama (local)": "ollama",
    // Microsoft Copilot
    copilot: "copilot",
    "microsoft copilot": "copilot",
    // Together / Fireworks
    "together ai": "together",
    "fireworks ai": "fireworks",
    // Analytics source keys
    gsc: "googleSearchConsole",
    "search console": "googleSearchConsole",
    "google search console": "googleSearchConsole",
    ga4: "googleAnalytics",
    "google analytics 4": "googleAnalytics",
    // PageSpeed
    "pagespeed insights": "pagespeed",
};

/** Direct lookup of the canonical keys themselves (case-insensitive). */
const DIRECT: Record<string, BrandKey> = Object.fromEntries(
    (Object.keys(BRANDS) as BrandKey[]).map((k) => [k.toLowerCase(), k]),
);

/**
 * Resolve any provider id / platform name / source key to a brand key, or
 * `null` when there is no brand asset for it (the caller should then fall back
 * to its previous placeholder).
 */
export function resolveBrand(input?: string | null): BrandKey | null {
    if (!input) return null;
    const norm = input.trim().toLowerCase();
    return ALIASES[norm] ?? DIRECT[norm] ?? null;
}

/** Public path to a brand's SVG asset. */
export function brandAsset(key: BrandKey): string {
    return `/third-party-brand-icons/${BRANDS[key].file}`;
}
