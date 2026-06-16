"use client";

import PoweredBy from "@/components/shell/PoweredBy";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRole } from "@/components/providers/RoleProvider";
import { navForRole, type NavItem } from "@/lib/navigation";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/shell/Logo";
import WorkspaceSwitcher from "@/components/shell/WorkspaceSwitcher";
import { usePlan } from "@/components/providers/LicenseProvider";
import { cn } from "@/lib/cn";

function isActive(pathname: string, href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
}

const NavLink = ({
    item,
    active,
    collapsed,
}: {
    item: NavItem;
    active: boolean;
    collapsed: boolean;
}) => (
    <Link
        href={item.href}
        title={collapsed ? item.title : undefined}
        className={cn(
            "relative group flex items-center h-12 shrink-0 rounded-2xl text-menu transition-all hover:text-primary dark:text-grey dark:hover:text-white",
            collapsed ? "justify-center px-0" : "px-4",
            active
                ? "bg-primary font-bold !text-white shadow-glow"
                : "text-grey",
        )}
    >
        <Icon
            className={cn(
                "shrink-0 transition-colors group-hover:fill-primary dark:fill-grey dark:group-hover:fill-white",
                collapsed ? "mr-0" : "mr-3",
                active ? "!fill-white" : "fill-grey",
            )}
            name={item.icon}
        />
        {!collapsed && item.title}
        {!collapsed && item.counter ? (
            <span
                className={cn(
                    "flex justify-center items-center shrink-0 w-6 h-6 ml-auto rounded-md text-[0.75rem]",
                    active ? "bg-white/20 text-white" : "bg-orange text-white",
                )}
            >
                {item.counter}
            </span>
        ) : null}
        {/* collapsed: show a dot for counters */}
        {collapsed && item.counter ? (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange" />
        ) : null}
    </Link>
);

const Sidebar = ({
    show,
    collapsed = false,
    onToggleCollapse,
    onNavigate,
}: {
    show: boolean;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    onNavigate?: () => void;
}) => {
    const pathname = usePathname();
    const router = useRouter();
    const { signout } = useAuth();
    const { role } = useRole();
    const { has } = usePlan();
    // The workspace switcher is the multi-workspace (Enterprise) console. Without
    // it, the brand spot shows the Flow CMS logo (its icon doubles as the toggle).
    const showSwitcher = has("multi_workspace");
    // White-label installs have paid to drop Flow CMS attribution, so the
    // "Powered by" badge is suppressed for them. Gated on the license (seeded
    // server-side at first paint) rather than the async-loaded brand, so the badge
    // never flashes in before branding resolves.
    const whiteLabel = has("white_label");
    const items = navForRole(role);

    async function handleLogout() {
        await signout();
        router.replace("/login");
    }

    return (
        <aside
            className={cn(
                // Mobile: off-canvas fixed drawer (slides in over the content).
                "fixed top-0 left-0 bottom-0 z-5 flex flex-col bg-bg transition-all dark:bg-dark-2",
                // Desktop: an in-flow column that STRETCHES to the full document
                // height (so the footer sits at the true bottom and every nav item
                // shows, even in full-page screenshots). The brand + nav are kept in
                // view by an inner sticky wrapper, so it still feels pinned on scroll.
                "lg:static lg:h-auto lg:translate-x-0 lg:shrink-0 lg:self-stretch",
                collapsed ? "w-20" : "w-64 lg:w-52",
                show ? "translate-x-0" : "-translate-x-full",
            )}
        >
            {/* Pinned cluster: brand + nav stay in view while the page scrolls.
                On desktop it sticks to the top and is capped to the viewport height
                (the nav scrolls internally if a role has many items); on mobile it
                simply fills the drawer. The footer below sits at the column's true
                bottom, so full-page screenshots show the whole sidebar correctly. */}
            <div className="flex min-h-0 flex-1 flex-col lg:flex-none lg:sticky lg:top-0 lg:max-h-screen">
            {/* Brand row. Multi-workspace (Enterprise): a hamburger toggle + the
                workspace switcher (which carries the workspace's own logo/name when
                white-labeled), kept outside the scrolling nav so its menu never clips.
                Otherwise (Community / single-tenant): the Flow CMS logo, with its icon
                doubling as the collapse toggle. */}
            <div
                className={cn(
                    "flex h-24 shrink-0 items-center",
                    showSwitcher
                        ? collapsed
                            ? "justify-center px-3"
                            : "px-2.5"
                        : collapsed
                          ? "justify-center px-3"
                          : "px-5",
                )}
            >
                {showSwitcher ? (
                    // The brand icon doubles as the collapse toggle (no separate hamburger).
                    <div className={cn(collapsed ? "" : "min-w-0 flex-1")}>
                        <WorkspaceSwitcher collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
                    </div>
                ) : (
                    <Logo iconOnly={collapsed} compact onIconClick={onToggleCollapse} onNavigate={onNavigate} />
                )}
            </div>

            {/* Nav */}
            <nav
                className="flex flex-col grow gap-1 px-4 pb-4 pt-6 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-grey-light/20"
                onClick={onNavigate}
            >
                {items.map((item) => (
                    <NavLink
                        key={item.href}
                        item={item}
                        active={isActive(pathname, item.href)}
                        collapsed={collapsed}
                    />
                ))}

                    {/* Logout — sits below the nav items */}
                <button
                    type="button"
                    onClick={handleLogout}
                    title={collapsed ? "Log out" : undefined}
                    className={cn(
                        "group mt-1 flex items-center h-12 shrink-0 rounded-2xl text-menu text-grey transition-all hover:bg-error/10 hover:text-error",
                        collapsed ? "justify-center px-0" : "px-4",
                    )}
                >
                    <Icon
                        className={cn(
                            "shrink-0 fill-grey transition-colors group-hover:fill-error",
                            collapsed ? "mr-0" : "mr-3",
                        )}
                        name="logout"
                    />
                    {!collapsed && "Log out"}
                </button>

                {/* Powered-by badge — sits just below Log out (a small gap), so it
                    stays in view next to the nav rather than pinned to the page
                    bottom. Multi-workspace (Enterprise) only, and hidden on
                    white-label installs (no Flow CMS attribution). */}
                {showSwitcher && !whiteLabel && (
                    <div className={cn("mt-4 shrink-0", collapsed && "flex justify-center")}>
                        <PoweredBy collapsed={collapsed} />
                    </div>
                )}
            </nav>
            </div>
        </aside>
    );
};

export default Sidebar;
