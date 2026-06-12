/**
 * Assets / media library mock for the "Northbound" studio. Images carry an `alt`
 * field with its source: "ai" (auto-generated on upload), "manual" (edited by a
 * person) or "none" (missing — needs attention). The AI model that writes alt
 * text is wired later.
 */
export type AssetType = "image" | "video" | "doc";
export type AltSource = "ai" | "manual" | "none";

export type Asset = {
    id: string;
    name: string;
    type: AssetType;
    ext: string;
    size: string;
    dimensions?: string;
    folder: string;
    grad: [string, string];
    alt: string;
    altSource: AltSource;
    uploadedBy: string;
    uploadedAt: string;
    usedIn: number;
};

export type Folder = { id: string; name: string };

export const assetFolders: Folder[] = [
    { id: "all", name: "All assets" },
    { id: "brand", name: "Brand" },
    { id: "web", name: "Web design" },
    { id: "work", name: "Case studies" },
    { id: "social", name: "Social" },
    { id: "docs", name: "Documents" },
];

export const assets: Asset[] = [
    {
        id: "as1",
        name: "lumen-brand-hero.jpg",
        type: "image",
        ext: "JPG",
        size: "842 KB",
        dimensions: "1600×900",
        folder: "work",
        grad: ["#6C5CE7", "#A29BFE"],
        alt: "Lumen brand identity hero — wordmark and gradient lockup on a deep navy background.",
        altSource: "ai",
        uploadedBy: "Liam Foster",
        uploadedAt: "2h ago",
        usedIn: 3,
    },
    {
        id: "as2",
        name: "atlas-coffee-store.png",
        type: "image",
        ext: "PNG",
        size: "318 KB",
        dimensions: "1280×720",
        folder: "work",
        grad: ["#E91E63", "#FFA2C0"],
        alt: "Atlas Coffee online store homepage shown on desktop and mobile.",
        altSource: "manual",
        uploadedBy: "Liam Foster",
        uploadedAt: "5h ago",
        usedIn: 1,
    },
    {
        id: "as3",
        name: "studio-team.jpg",
        type: "image",
        ext: "JPG",
        size: "1.2 MB",
        dimensions: "2000×1333",
        folder: "social",
        grad: ["#00B894", "#55EFC4"],
        alt: "",
        altSource: "none",
        uploadedBy: "Olivia Hayes",
        uploadedAt: "Yesterday",
        usedIn: 0,
    },
    {
        id: "as4",
        name: "northbound-logo.svg",
        type: "image",
        ext: "SVG",
        size: "12 KB",
        dimensions: "512×512",
        folder: "brand",
        grad: ["#3B82F6", "#74B9FF"],
        alt: "Northbound primary logo on a light background.",
        altSource: "ai",
        uploadedBy: "Sarah Whitfield",
        uploadedAt: "Yesterday",
        usedIn: 12,
    },
    {
        id: "as5",
        name: "vantage-walkthrough.mp4",
        type: "video",
        ext: "MP4",
        size: "18.4 MB",
        dimensions: "1920×1080",
        folder: "work",
        grad: ["#F5A623", "#FFD479"],
        alt: "",
        altSource: "none",
        uploadedBy: "Marcus Bennett",
        uploadedAt: "2d ago",
        usedIn: 2,
    },
    {
        id: "as6",
        name: "orbit-design-system.png",
        type: "image",
        ext: "PNG",
        size: "264 KB",
        dimensions: "1400×800",
        folder: "web",
        grad: ["#6C5DD3", "#CFC8FF"],
        alt: "Orbit design system component sheet showing buttons, inputs and cards.",
        altSource: "ai",
        uploadedBy: "Liam Foster",
        uploadedAt: "2d ago",
        usedIn: 1,
    },
    {
        id: "as7",
        name: "meridian-brand-guidelines.pdf",
        type: "doc",
        ext: "PDF",
        size: "904 KB",
        folder: "docs",
        grad: ["#E24B4A", "#FF8B8A"],
        alt: "",
        altSource: "none",
        uploadedBy: "Sarah Whitfield",
        uploadedAt: "3d ago",
        usedIn: 4,
    },
    {
        id: "as8",
        name: "social-launch-card.png",
        type: "image",
        ext: "PNG",
        size: "421 KB",
        dimensions: "1200×675",
        folder: "social",
        grad: ["#A0D7E7", "#74B9FF"],
        alt: "Launch announcement social card with the Northbound wordmark.",
        altSource: "manual",
        uploadedBy: "Olivia Hayes",
        uploadedAt: "4d ago",
        usedIn: 6,
    },
    {
        id: "as9",
        name: "services-grid.jpg",
        type: "image",
        ext: "JPG",
        size: "688 KB",
        dimensions: "1600×1000",
        folder: "web",
        grad: ["#00B894", "#A29BFE"],
        alt: "Grid of Northbound service icons: brand, web and growth.",
        altSource: "ai",
        uploadedBy: "Liam Foster",
        uploadedAt: "5d ago",
        usedIn: 2,
    },
    {
        id: "as10",
        name: "favicon.svg",
        type: "image",
        ext: "SVG",
        size: "4 KB",
        dimensions: "64×64",
        folder: "brand",
        grad: ["#8674F0", "#6C5CE7"],
        alt: "Northbound favicon mark.",
        altSource: "ai",
        uploadedBy: "Sarah Whitfield",
        uploadedAt: "1w ago",
        usedIn: 1,
    },
    {
        id: "as11",
        name: "webinar-cover.jpg",
        type: "image",
        ext: "JPG",
        size: "1.0 MB",
        dimensions: "1920×1080",
        folder: "social",
        grad: ["#FFA2C0", "#E91E63"],
        alt: "",
        altSource: "none",
        uploadedBy: "Olivia Hayes",
        uploadedAt: "1w ago",
        usedIn: 1,
    },
    {
        id: "as12",
        name: "brand-guidelines.pdf",
        type: "doc",
        ext: "PDF",
        size: "3.1 MB",
        folder: "docs",
        grad: ["#3B82F6", "#6C5CE7"],
        alt: "",
        altSource: "none",
        uploadedBy: "Sarah Whitfield",
        uploadedAt: "2w ago",
        usedIn: 8,
    },
];

export const typeIcon: Record<AssetType, string> = {
    image: "image",
    video: "overview",
    doc: "document",
};

/** Sample AI-generated alt suggestions, used when "uploading" or regenerating. */
export const sampleAiAlts = [
    "Abstract gradient hero in the Northbound brand purple.",
    "Editorial photo of a design team reviewing brand concepts on a studio wall.",
    "Close-up of an analytics dashboard showing rising organic traffic.",
    "Minimal screenshot of a clean marketing homepage in light mode.",
];

/* ---------- Page Templates (assets/templates) ---------- */
export type PageTemplate = {
    id: string;
    name: string;
    category: string;
    grad: [string, string];
    blocks: number;
    uses: number;
};

export const pageTemplates: PageTemplate[] = [
    { id: "t1", name: "Long-form Blog", category: "Blog", grad: ["#6C5CE7", "#A29BFE"], blocks: 9, uses: 142 },
    { id: "t2", name: "Case Study", category: "Case Study", grad: ["#00B894", "#55EFC4"], blocks: 10, uses: 64 },
    { id: "t3", name: "Service Page", category: "Page", grad: ["#3B82F6", "#74B9FF"], blocks: 8, uses: 41 },
    { id: "t4", name: "Landing Page", category: "Landing", grad: ["#E91E63", "#FFA2C0"], blocks: 12, uses: 87 },
    { id: "t5", name: "Home", category: "Page", grad: ["#6C5DD3", "#CFC8FF"], blocks: 11, uses: 9 },
    { id: "t6", name: "About", category: "Page", grad: ["#00B894", "#A29BFE"], blocks: 6, uses: 12 },
    { id: "t7", name: "Contact", category: "Page", grad: ["#A0D7E7", "#74B9FF"], blocks: 4, uses: 7 },
    { id: "t8", name: "Webinar / Event", category: "Landing", grad: ["#FFA2C0", "#E91E63"], blocks: 9, uses: 12 },
];
