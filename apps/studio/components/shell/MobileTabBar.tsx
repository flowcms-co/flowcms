"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Native-app-style bottom tab bar (mobile only). The most-used destinations for thumb
 * reach; the full nav (Assets, Chat, Settings…) lives in the hamburger drawer. Hidden at
 * lg+, where the sidebar takes over.
 */
const TABS = [
    { title: "Home", icon: "overview", href: "/" },
    { title: "Content", icon: "document", href: "/content" },
    { title: "AI", icon: "sparkles", href: "/ai" },
    { title: "SEO", icon: "chart", href: "/seo" },
    { title: "Assets", icon: "folder", href: "/assets" },
];

function isActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export default function MobileTabBar() {
    const pathname = usePathname();
    return (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-grey-light bg-white/85 backdrop-blur-xl lg:hidden dark:border-grey-light/10 dark:bg-dark-2/85">
            <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
                {TABS.map((t) => {
                    const active = isActive(pathname, t.href);
                    return (
                        <Link
                            key={t.href}
                            href={t.href}
                            aria-current={active ? "page" : undefined}
                            className="group relative flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2"
                        >
                            <span className={cn("flex h-8 w-12 items-center justify-center rounded-xl transition-colors", active ? "bg-primary/12" : "group-active:bg-grey-light/50 dark:group-active:bg-dark-3/60")}>
                                <Icon name={t.icon} classSize="w-[22px] h-[22px]" className={cn("transition-colors", active ? "fill-primary" : "fill-grey")} />
                            </span>
                            <span className={cn("text-[0.625rem] font-semibold leading-none transition-colors", active ? "text-primary" : "text-grey")}>{t.title}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
