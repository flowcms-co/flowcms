import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import SeoDonut from "@/components/charts/SeoDonut";
import { cn } from "@/lib/cn";

/** One pillar of the FlowCMS SEO Score. */
export type ScorePillar = { key: string; label: string; source: string; weight: number; score: number | null; live: boolean };

/** The unified FlowCMS SEO Score + the inputs for the next-best-actions, from the Dashboard. */
export type ScoreData = {
    isLive: boolean;
    score: number;
    pillars: ScorePillar[];
    quickFixes: number;
    strikingDistance: number;
    conflicts: number;
};

const PILLAR_COLOR: Record<string, string> = { visibility: "#6C5CE7", technical: "#00B894", speed: "#F5A623" };

/**
 * SEO score header — two cards matching the rest of the dashboard:
 *  • the one FlowCMS SEO Score as a segmented donut (the 3 pillars are the segments,
 *    same visual as the Overview SEO card) + a legend of each pillar's weight + score;
 *  • the three highest-leverage next actions, each a deep link.
 */
const ScoreHeader = ({ data }: { data: ScoreData }) => {
    const { isLive, score, pillars, quickFixes, strikingDistance, conflicts } = data;

    const segments = pillars.map((p) => ({ label: p.label, value: Math.max(p.score ?? 0, 0.001), color: PILLAR_COLOR[p.key] ?? "#9999B0" }));

    const actions = [
        { label: "Quick-fix issues", value: quickFixes, sub: "fixable on-page", icon: "settings", color: "#6C5CE7", href: "/seo/optimizer" },
        { label: "Striking distance", value: strikingDistance, sub: "keywords on page 2", icon: "compass", color: "#00B894", href: "/seo/keywords" },
        { label: "Keyword conflicts", value: conflicts, sub: "pages competing", icon: "hash", color: "#F5A623", href: "/seo/cannibalization" },
    ];

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Score donut + pillar legend */}
            <Card>
                <div className="mb-1 flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">SEO score</h2>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6875rem] font-bold", isLive ? "bg-success/10 text-success" : "bg-grey-light/70 text-grey dark:bg-dark-3")}>
                        <Icon className={cn("h-3 w-3", isLive ? "fill-success" : "fill-grey")} name={isLive ? "check" : "clock"} />
                        {isLive ? "Live" : "Sample"}
                    </span>
                </div>
                <p className="text-caption-2 text-grey">Visibility, technical health and page speed, combined.</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
                    <SeoDonut size={168} score={score} segments={segments} />
                    <div className="flex grow flex-col gap-3.5 min-w-[10rem]">
                        {pillars.map((p) => {
                            const c = PILLAR_COLOR[p.key] ?? "#9999B0";
                            return (
                                <div key={p.key} className="flex items-center gap-2.5 text-body-sm">
                                    <span className="h-3 w-3 shrink-0 rounded-[0.25rem]" style={{ backgroundColor: c }} />
                                    <span className="font-semibold text-black dark:text-white">{p.label}</span>
                                    <span className="text-caption-2 text-grey">· {p.weight}%</span>
                                    <span className="ml-auto font-poppins text-h6 font-bold" style={{ color: p.score != null ? c : undefined }}>
                                        {p.score != null ? <CountUp value={p.score} /> : <span className="text-grey">—</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>

            {/* Next best actions */}
            <Card>
                <h2 className="text-h5 text-black dark:text-white">Next best actions</h2>
                <p className="mb-1 text-caption-2 text-grey">The three highest-leverage fixes right now.</p>
                <div className="flex flex-col">
                    {actions.map((a) => (
                        <Link key={a.label} href={a.href} className="group -mx-2 flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-lavender-mist/70 dark:hover:bg-dark-3/50">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem]" style={{ backgroundColor: `${a.color}1f` }}>
                                <Icon className="h-5 w-5" name={a.icon} fill={a.color} />
                            </span>
                            <CountUp value={a.value} className="font-poppins text-h5 font-extrabold leading-none" style={{ color: a.color }} />
                            <div className="min-w-0 grow leading-tight">
                                <div className="truncate text-title text-black dark:text-white">{a.label}</div>
                                <div className="text-caption-2 text-grey">{a.sub}</div>
                            </div>
                            <Icon className="h-4 w-4 shrink-0 fill-grey transition-transform group-hover:translate-x-0.5" name="arrow-right" />
                        </Link>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default ScoreHeader;
