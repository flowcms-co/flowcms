import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
    weight: ["400", "500", "600", "700"],
    subsets: ["latin"],
    display: "swap",
    variable: "--ff-inter",
});

const poppins = Poppins({
    weight: ["400", "500", "600", "700", "800"],
    subsets: ["latin"],
    display: "swap",
    variable: "--ff-poppins",
});

export const metadata: Metadata = {
    title: "Flow CMS",
    description:
        "AI-powered content management: content creation, SEO, and publishing in one platform.",
    icons: {
        icon: "/favicon.svg",
    },
};

// Pre-paint white-label boot: reads the brand cookie (mirrored by BrandStyle) and
// applies the accent CSS vars + favicon + title BEFORE first paint, so a licensed
// workspace never flashes the default Flow CMS purple/logo on load. The CSS here
// must match brandAccentCss() in lib/brand.ts. Cleared by BrandStyle once it hydrates.
const BRAND_BOOT = `(function(){try{
  var m=document.cookie.match(/(?:^|; )fc_brand=([^;]*)/);if(!m)return;
  var b=JSON.parse(decodeURIComponent(m[1]));if(!b)return;
  var a=b.accent;
  if(a&&/^#[0-9a-fA-F]{6}$/.test(a)){
    var css=":root{--color-primary:"+a+";--color-purple-500:"+a+";--color-purple-600:color-mix(in oklab,"+a+" 86%,black);--color-purple-700:color-mix(in oklab,"+a+" 68%,black);--color-purple-400:color-mix(in oklab,"+a+" 74%,white);--color-lilac:color-mix(in oklab,"+a+" 52%,white);--color-purple-300:color-mix(in oklab,"+a+" 52%,white);--color-purple-200:color-mix(in oklab,"+a+" 32%,white);--color-purple-100:color-mix(in oklab,"+a+" 18%,white);--color-lavender-mist:color-mix(in oklab,"+a+" 9%,white);--color-purple-50:color-mix(in oklab,"+a+" 7%,white);--shadow-glow:0 0.5rem 1.25rem color-mix(in oklab,"+a+" 38%,transparent);}";
    var s=document.createElement("style");s.id="flow-brand-accent-boot";s.appendChild(document.createTextNode(css));(document.head||document.documentElement).appendChild(s);
  }
  if(b.name)document.title=b.name;
  if(b.logo){var l=document.querySelector("link[rel~='icon']");if(!l){l=document.createElement("link");l.rel="icon";(document.head||document.documentElement).appendChild(l);}l.href=b.logo;}
}catch(e){}})();`;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            className={`${inter.variable} ${poppins.variable}`}
            suppressHydrationWarning
        >
            <body>
                <script dangerouslySetInnerHTML={{ __html: BRAND_BOOT }} />
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
