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
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
