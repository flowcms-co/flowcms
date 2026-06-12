"use client";

import { Menu, Transition } from "@headlessui/react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRole } from "@/components/providers/RoleProvider";
import { ROLE_ORDER, ROLES } from "@/lib/roles";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

/**
 * Top-bar profile card: avatar + name + role/title. A Super Admin can open it to
 * "switch view" (preview the app as another role); everyone else sees a static
 * card. Settings and Log out live in the left nav, not here.
 */
const ProfileMenu = () => {
    const { user } = useAuth();
    const { role, meta, canSwitchView, setRole } = useRole();
    const name = user?.name || user?.email || meta.user.name;

    const Card = (
        <div className="flex items-center gap-2.5 h-12 px-1.5 rounded-2xl transition-colors hover:bg-lavender-mist/60 dark:hover:bg-dark-3/50">
            <Avatar userId={user?.id} character={user?.avatarStyle} src={user?.avatarUrl} name={name} size={36} />
            <span className="hidden flex-col leading-tight text-left md:flex">
                <span className="text-body-sm font-semibold text-black dark:text-white">{name}</span>
                <span className="text-caption-2 text-grey">{meta.label}</span>
            </span>
            {canSwitchView && (
                <span className="hidden md:flex flex-col -space-y-1 text-grey">
                    <Icon className="w-4 h-4 fill-grey rotate-180" name="arrow-down" />
                    <Icon className="w-4 h-4 fill-grey" name="arrow-down" />
                </span>
            )}
        </div>
    );

    // Non-super users: static identity card, no menu.
    if (!canSwitchView) return Card;

    // Super Admin: "view as" role switcher.
    return (
        <Menu as="div" className="relative">
            <Menu.Button className="transition-transform active:scale-[0.98]">{Card}</Menu.Button>
            <Transition
                enter="transition duration-100 ease-out"
                enterFrom="opacity-0 scale-95 -translate-y-1"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-75 ease-in"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
            >
                <Menu.Items className="absolute right-0 z-3 mt-2 w-72 p-2 rounded-2xl bg-surface shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:bg-dark-1 dark:shadow-[0_1.25rem_2.5rem_rgba(0,0,0,0.5)]">
                    <div className="px-3 py-2 text-caption-2 text-grey">Switch view</div>
                    {ROLE_ORDER.map((id) => {
                        const r = ROLES[id];
                        const active = id === role;
                        return (
                            <Menu.Item key={id}>
                                {() => (
                                    <button
                                        type="button"
                                        onClick={() => setRole(id)}
                                        className={cn(
                                            "flex w-full flex-col items-start gap-0.5 px-3 py-2 rounded-xl text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3",
                                            active && "bg-lavender-mist dark:bg-dark-3",
                                        )}
                                    >
                                        <span className="flex w-full items-center justify-between text-title text-black dark:text-white">
                                            {id === "super" ? "Super Admin (you)" : r.label}
                                            {active && <Icon className="w-4 h-4 fill-primary" name="check" />}
                                        </span>
                                        <span className="text-caption-2 text-grey">{r.description}</span>
                                    </button>
                                )}
                            </Menu.Item>
                        );
                    })}
                </Menu.Items>
            </Transition>
        </Menu>
    );
};

export default ProfileMenu;
