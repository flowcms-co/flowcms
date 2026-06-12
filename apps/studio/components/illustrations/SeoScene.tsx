/**
 * SeoScene — a flat, friendly SEO illustration (our own art, drawn as SVG).
 * A magnifying glass inspecting a rising rankings chart, with a search bar,
 * a #1 rank pin and playful accents. Built to sit on the purple banner:
 * mostly white/light shapes with colorful accent fills that pop on violet.
 *
 * Style is inspired by playful learning-dashboard illustrations but composed
 * from scratch around search/ranking motifs — nothing is traced or lifted.
 */
const SeoScene = ({ className }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 260 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        {/* soft halo */}
        <ellipse cx="132" cy="120" rx="104" ry="92" fill="#ffffff" opacity="0.08" />

        {/* report card (tilted) */}
        <g transform="rotate(-7 120 118)">
            <rect x="44" y="58" width="150" height="120" rx="18" fill="#ffffff" />
            <rect x="44" y="58" width="150" height="120" rx="18" fill="#6C5CE7" opacity="0.04" />

            {/* search bar on the page */}
            <rect x="60" y="74" width="118" height="20" rx="10" fill="#EEF0FF" />
            <circle cx="72" cy="84" r="5" fill="none" stroke="#A29BFE" strokeWidth="2.4" />
            <line x1="76" y1="88" x2="80" y2="92" stroke="#A29BFE" strokeWidth="2.4" strokeLinecap="round" />
            <rect x="86" y="81" width="64" height="6" rx="3" fill="#CFD3FF" />

            {/* rising bars */}
            <rect x="64" y="142" width="18" height="22" rx="5" fill="#2BC4A0" />
            <rect x="90" y="128" width="18" height="36" rx="5" fill="#A29BFE" />
            <rect x="116" y="112" width="18" height="52" rx="5" fill="#6C5CE7" />
            <rect x="142" y="98" width="18" height="66" rx="5" fill="#FFC75A" />

            {/* upward trend line + arrow */}
            <polyline
                points="70,140 99,126 125,110 151,96"
                fill="none"
                stroke="#1A1A2E"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
            />
            <path
                d="M143 94 L153 94 L153 104"
                fill="none"
                stroke="#1A1A2E"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
            />
            <circle cx="70" cy="140" r="3.4" fill="#1A1A2E" opacity="0.85" />
        </g>

        {/* magnifying glass */}
        <g>
            <circle cx="178" cy="150" r="40" fill="#ffffff" opacity="0.16" />
            <circle cx="178" cy="150" r="40" fill="none" stroke="#ffffff" strokeWidth="11" />
            {/* magnified upward arrow inside the lens */}
            <path
                d="M161 162 L173 150 L182 158 L196 142"
                fill="none"
                stroke="#ffffff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M188 142 L196 142 L196 150"
                fill="none"
                stroke="#ffffff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* handle */}
            <line
                x1="207"
                y1="179"
                x2="232"
                y2="204"
                stroke="#ffffff"
                strokeWidth="13"
                strokeLinecap="round"
            />
        </g>

        {/* #1 rank pin */}
        <g transform="rotate(-10 60 52)">
            <rect x="34" y="40" width="52" height="26" rx="13" fill="#FFC75A" />
            <text
                x="60"
                y="58"
                textAnchor="middle"
                fontFamily="Poppins, system-ui, sans-serif"
                fontSize="15"
                fontWeight="800"
                fill="#1A1A2E"
            >
                #1
            </text>
        </g>

        {/* playful accents */}
        <path
            d="M214 70 l3.4 6.9 7.6 1.1 -5.5 5.4 1.3 7.6 -6.8 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.4 7.6 -1.1z"
            fill="#FF8FB1"
        />
        <circle cx="34" cy="118" r="5" fill="#2BC4A0" />
        <circle cx="226" cy="150" r="4" fill="#A29BFE" />
        <circle cx="44" cy="186" r="3.5" fill="#FFC75A" />
        <path d="M232 120 l2 4 4 .6 -3 3 .7 4.4 -3.7-2 -3.7 2 .7-4.4 -3-3 4-.6z" fill="#ffffff" opacity="0.85" />
    </svg>
);

export default SeoScene;
