/**
 * Turns a Core Web Vitals / PageSpeed finding code into concrete, plain-language
 * fix steps. PageSpeed Insights tells you *what* is slow (LCP, CLS, render-blocking
 * resources, oversized images, …); this maps each to *what to do about it*, so the
 * AI Optimizer's instructions modal shows an actionable checklist, not just "this is
 * slow". Used whether the data is live (real values interpolated) or a labelled sample.
 */
export const PERF_ADVICE: Record<string, { headline: string; steps: string[] }> = {
    CWV_LCP_POOR: {
        headline: "Largest Contentful Paint is slow (the main image/text takes too long to appear).",
        steps: [
            "Find the largest above-the-fold element (usually the hero image or heading) and make it load first.",
            "Serve the hero image as WebP/AVIF, correctly sized for the viewport, and add fetchpriority=\"high\" + a <link rel=\"preload\">.",
            "Remove or defer render-blocking CSS/JS above the fold; inline only the critical CSS.",
            "Put static assets behind a CDN and enable long-lived caching.",
        ],
    },
    CWV_LCP_WARN: {
        headline: "Largest Contentful Paint is borderline; a little work will pass it.",
        steps: [
            "Preload and right-size the hero image; serve it as WebP/AVIF.",
            "Defer non-critical JavaScript so the main content paints sooner.",
            "Cache static assets and serve them from a CDN.",
        ],
    },
    CWV_CLS_POOR: {
        headline: "Cumulative Layout Shift is high (content jumps as the page loads).",
        steps: [
            "Set explicit width and height (or aspect-ratio) on every image, video and iframe.",
            "Reserve space for ads, embeds and banners so they don't push content down.",
            "Load web fonts with font-display: optional/swap and preload them to avoid a late reflow.",
            "Never insert content above existing content after load (e.g. cookie bars should overlay, not shift).",
        ],
    },
    CWV_INP_POOR: {
        headline: "Interaction to Next Paint is slow (the page feels laggy when clicked/typed).",
        steps: [
            "Break up long JavaScript tasks (yield to the main thread; defer heavy work).",
            "Remove unused third-party scripts; load the rest with async/defer.",
            "Debounce expensive handlers and move heavy computation off the main thread (Web Workers).",
        ],
    },
    PERF_RENDER_BLOCKING: {
        headline: "Render-blocking resources delay the first paint.",
        steps: [
            "Defer or async non-critical <script> tags.",
            "Inline critical CSS and load the rest with media=\"print\" onload, or split CSS by route.",
            "Move third-party tags (analytics, chat) below the fold or load them after first paint.",
        ],
    },
    PERF_IMAGE_OPT: {
        headline: "Images are larger than they need to be.",
        steps: [
            "Convert images to WebP/AVIF and compress them.",
            "Serve responsive sizes with srcset/sizes so phones don't download desktop images.",
            "Lazy-load below-the-fold images (loading=\"lazy\").",
        ],
    },
    PERF_UNMINIFIED: {
        headline: "CSS/JS isn't minified.",
        steps: [
            "Enable minification in your build (most frameworks do this in production builds).",
            "Enable Brotli/gzip compression on the server or CDN.",
        ],
    },
    PERF_TEXT_COMPRESSION: {
        headline: "Text resources aren't compressed in transit.",
        steps: [
            "Turn on Brotli (preferred) or gzip for HTML, CSS and JS at the server/CDN.",
            "Verify with the Content-Encoding response header.",
        ],
    },
    PERF_TOTAL_WEIGHT: {
        headline: "The page is heavy overall.",
        steps: [
            "Audit the largest assets and remove or lazy-load what isn't needed on first view.",
            "Code-split JavaScript so each page ships only what it uses.",
            "Compress images and fonts; subset fonts to the characters you actually use.",
        ],
    },
};

export const perfAdvice = (code: string) => PERF_ADVICE[code] ?? null;
