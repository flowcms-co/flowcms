"use client";

import { useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import Icon from "@/components/ui/Icon";
import ScheduleModal from "@/components/editor/ScheduleModal";

type DocStatus = "draft" | "review" | "approved" | "scheduled" | "live";

/**
 * Editorial publishing workflow for the block editor topbar.
 *
 * Flow:  draft → (Submit for review) → review → (Approve) → approved
 *               → (Schedule | Publish now) → scheduled / live
 *
 * Role gating: anyone authoring can submit for review, but only the SEO Manager,
 * Admin and Super Admin can approve, request changes, schedule, or publish.
 * Editors see read-only status ("Awaiting approval", "Approved", …). Mock state
 * for now; the backend enforces this server-side later.
 */
const PublishWorkflow = () => {
    const { role } = useRole();
    const canApprove = role === "super" || role === "admin" || role === "seo";

    const [status, setStatus] = useState<DocStatus>("draft");
    const [scheduledFor, setScheduledFor] = useState<string | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);

    const schedule = (when: string) => {
        setScheduledFor(when);
        setStatus("scheduled");
        setScheduleOpen(false);
    };

    const btn = "h-10 px-4 gap-2 text-caption-1";

    return (
        <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
                <StatusPill status={status as PillStatus} />
            </span>
            {status === "scheduled" && scheduledFor && (
                <span className="hidden text-caption-2 text-grey lg:inline">
                    · {scheduledFor}
                </span>
            )}

            {/* draft → submit for review (any author) */}
            {status === "draft" && (
                <button
                    type="button"
                    onClick={() => setStatus("review")}
                    className={`btn-primary ${btn}`}
                >
                    <Icon className="w-4 h-4 fill-white" name="send" />
                    Submit for review
                </button>
            )}

            {/* review → approve / request changes (reviewers only) */}
            {status === "review" &&
                (canApprove ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setStatus("draft")}
                            className={`btn-secondary ${btn}`}
                        >
                            Request changes
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatus("approved")}
                            className={`btn-primary ${btn}`}
                        >
                            <Icon className="w-4 h-4 fill-white" name="check" />
                            Approve
                        </button>
                    </>
                ) : (
                    <Info icon="clock" color="#F5A623" label="Awaiting approval" />
                ))}

            {/* approved → schedule / publish (reviewers only) */}
            {status === "approved" &&
                (canApprove ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setScheduleOpen(true)}
                            className={`btn-secondary ${btn}`}
                        >
                            <Icon className="w-4 h-4 fill-primary dark:fill-lilac" name="calendar" />
                            Schedule
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatus("live")}
                            className={`btn-primary ${btn}`}
                        >
                            <Icon className="w-4 h-4 fill-white" name="check" />
                            Publish now
                        </button>
                    </>
                ) : (
                    <Info icon="check" color="#00B894" label="Approved" />
                ))}

            {/* scheduled → unschedule / publish now (reviewers only) */}
            {status === "scheduled" && canApprove && (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            setScheduledFor(null);
                            setStatus("approved");
                        }}
                        className={`btn-secondary ${btn}`}
                    >
                        Unschedule
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatus("live")}
                        className={`btn-primary ${btn}`}
                    >
                        <Icon className="w-4 h-4 fill-white" name="check" />
                        Publish now
                    </button>
                </>
            )}

            {/* live → unpublish (reviewers only) */}
            {status === "live" && canApprove && (
                <button
                    type="button"
                    onClick={() => setStatus("draft")}
                    className={`btn-secondary ${btn}`}
                >
                    Unpublish
                </button>
            )}

            <ScheduleModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                onSchedule={schedule}
            />
        </div>
    );
};

const Info = ({
    icon,
    color,
    label,
}: {
    icon: string;
    color: string;
    label: string;
}) => (
    <span
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl text-caption-1 font-semibold"
        style={{ backgroundColor: `${color}1f`, color }}
    >
        <Icon className="w-4 h-4" name={icon} fill={color} />
        {label}
    </span>
);

export default PublishWorkflow;
