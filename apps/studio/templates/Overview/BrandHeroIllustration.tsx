/**
 * Theme-aware overview hero, used on white-label (Enterprise) workspaces in place
 * of the avatar-matched raster illustration. Everything brand-driven (the figure's
 * shirt, the trend line, accents) is painted with `var(--color-primary)`, which
 * `<BrandStyle>` overrides to the workspace accent, so the art follows the brand
 * color. Surfaces use the shared `--ill-*` tokens so it reads in light and dark.
 * Hand-built flat vector (our own art); purely decorative.
 */
const BrandHeroIllustration = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 340 220"
        className={className}
        role="img"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
    >
        <defs>
            <linearGradient id="bh-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bh-shirt" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.78" />
            </linearGradient>
        </defs>

        {/* soft brand glow disc */}
        <ellipse cx="170" cy="116" rx="150" ry="92" fill="var(--ill-backdrop)" />

        {/* contact shadow under the scene */}
        <ellipse cx="166" cy="196" rx="118" ry="12" fill="var(--ill-shadow)" />

        {/* ── analytics window ── */}
        <g>
            <rect x="34" y="48" width="186" height="126" rx="14" fill="var(--ill-surface)" />
            <rect
                x="34"
                y="48"
                width="186"
                height="126"
                rx="14"
                fill="none"
                stroke="var(--ill-line)"
                strokeWidth="1.5"
            />
            {/* window header */}
            <circle cx="50" cy="64" r="3.4" fill="var(--color-primary)" />
            <circle cx="61" cy="64" r="3.4" fill="var(--ill-line)" />
            <circle cx="72" cy="64" r="3.4" fill="var(--ill-line)" />
            <rect x="150" y="60" width="56" height="8" rx="4" fill="var(--ill-surface-2)" />

            {/* trend area + line */}
            <path
                d="M48 150 L80 132 L106 140 L134 110 L162 120 L196 86 L196 160 L48 160 Z"
                fill="url(#bh-area)"
            />
            <path
                d="M48 150 L80 132 L106 140 L134 110 L162 120 L196 86"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* data points */}
            <circle cx="134" cy="110" r="3.6" fill="var(--ill-surface)" stroke="var(--color-primary)" strokeWidth="2.5" />
            <circle cx="196" cy="86" r="4.2" fill="var(--color-primary)" />

            {/* baseline */}
            <line x1="48" y1="160" x2="196" y2="160" stroke="var(--ill-line)" strokeWidth="1.5" />
        </g>

        {/* ── floating stat chip ── */}
        <g>
            <rect x="206" y="82" width="74" height="44" rx="11" fill="var(--ill-surface)" />
            <rect x="206" y="82" width="74" height="44" rx="11" fill="none" stroke="var(--ill-line)" strokeWidth="1.5" />
            <rect x="218" y="94" width="30" height="7" rx="3.5" fill="var(--color-primary)" />
            <rect x="218" y="107" width="50" height="6" rx="3" fill="var(--ill-line)" />
            {/* up arrow */}
            <path
                d="M262 116 L268 106 L274 116"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </g>

        {/* ── the figure (shirt follows the brand color) ── */}
        <g>
            {/* seat shadow */}
            <ellipse cx="252" cy="190" rx="40" ry="7" fill="var(--ill-shadow)" />
            {/* torso / shirt */}
            <path
                d="M232 188 C232 162 240 150 256 150 C272 150 280 162 280 188 Z"
                fill="url(#bh-shirt)"
            />
            {/* arm gesturing to the chart */}
            <path
                d="M236 162 C224 158 214 150 206 140"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="9"
                strokeLinecap="round"
            />
            {/* neck */}
            <rect x="250" y="138" width="12" height="14" rx="5" fill="var(--ill-line)" />
            {/* head */}
            <circle cx="256" cy="130" r="15" fill="var(--ill-line)" />
            {/* hair cap in brand color */}
            <path
                d="M242 128 C242 116 250 110 256 110 C262 110 270 116 270 127 C266 121 248 120 242 128 Z"
                fill="var(--color-primary)"
            />
        </g>

        {/* ── motion sparks ── */}
        <circle cx="300" cy="56" r="4.5" fill="var(--color-primary)" />
        <circle cx="314" cy="74" r="2.6" fill="var(--color-primary)" opacity="0.6" />
        <path
            d="M24 96 l4 4 -4 4 -4 -4 z"
            fill="var(--color-primary)"
            opacity="0.7"
        />
    </svg>
);

export default BrandHeroIllustration;
