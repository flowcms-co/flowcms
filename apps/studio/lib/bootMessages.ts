export type BootTask = {
    title: string;
    desc: string;
    icon: string;
};

export const STARTER_TASKS: BootTask[] = [
    { title: "Forging your content types", desc: "Defining the structure of your content", icon: "document" },
    { title: "Drawing up the schema", desc: "Mapping relationships and rules", icon: "grid" },
    { title: "Planting the first fields", desc: "Adding the essential fields", icon: "edit" },
    { title: "Wiring the content engine", desc: "Connecting everything together", icon: "sparkles" },
];

export const FINISH_TASKS: BootTask[] = [
    { title: "Locking in your setup", desc: "Securing your configuration and preferences", icon: "lock" },
    { title: "Polishing the dashboard", desc: "Preparing your personalized workspace", icon: "overview" },
    { title: "Igniting launch sequence", desc: "Starting up the essential services", icon: "send" },
    { title: "Handing you the key", desc: "Finalizing access and permissions", icon: "key" },
];

// Backward-compatible string arrays (used by MIGRATE_MESSAGES consumers)
export const STARTER_MESSAGES = STARTER_TASKS.map((t) => t.title);
export const FINISH_MESSAGES = FINISH_TASKS.map((t) => t.title);

export const BOOT_MESSAGES = [
    "Powering up your CMS",
    "Warming up the engines",
    "Bootstrapping your workspace",
    "Spinning up the content API",
    "Calibrating content models",
    "Tuning the delivery pipeline",
    "Aligning the content lattice",
    "Greasing the cogs",
    "Reticulating splines",
    "Charging the capacitors",
];

export const MIGRATE_MESSAGES = (src = "your platform") => [
    `Beaming in content from ${src}`,
    "Mapping fields across",
    "Rehydrating your posts",
    "Stitching entries together",
    "Reconciling slugs",
    "Indexing everything",
];
