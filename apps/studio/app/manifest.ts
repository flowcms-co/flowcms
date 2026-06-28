import type { MetadataRoute } from "next";

/** PWA manifest so the studio installs as a standalone app on iOS / Android. */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Flow CMS",
        short_name: "Flow CMS",
        description: "AI-powered content management: content, SEO and publishing in one place.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fcfdfd",
        theme_color: "#6c5ce7",
        icons: [
            { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
