"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TIMES = ["9:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"];
const TIME_HOURS: Record<string, number> = { "9:00 AM": 9, "12:00 PM": 12, "3:00 PM": 15, "6:00 PM": 18 };

type Ymd = { y: number; m: number; d: number };

/**
 * Schedule-publish modal — a compact month calendar + time picker. Used by the
 * editor's publishing workflow once a document is approved. Returns a formatted
 * "Mon D, h:mm AM" string to the caller (backend stores a real timestamp later).
 */
const ScheduleModal = ({
    open,
    onClose,
    onSchedule,
}: {
    open: boolean;
    onClose: () => void;
    /** `when` is a display label ("Mon D, h:mm AM"); `iso` is the real timestamp. */
    onSchedule: (when: string, iso: string) => void;
}) => {
    const [today] = useState<Ymd>(() => {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
    });
    const [cursor, setCursor] = useState({ y: today.y, m: today.m });
    const [selected, setSelected] = useState<Ymd>(today);
    const [time, setTime] = useState(TIMES[0]);

    const leading = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(leading).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    const todayMid = new Date(today.y, today.m, today.d).getTime();
    const isPast = (d: number) =>
        new Date(cursor.y, cursor.m, d).getTime() < todayMid;
    const isToday = (d: number) =>
        cursor.y === today.y && cursor.m === today.m && d === today.d;
    const isSel = (d: number) =>
        selected.y === cursor.y && selected.m === cursor.m && selected.d === d;

    const step = (dir: -1 | 1) =>
        setCursor((c) => {
            const m = c.m + dir;
            if (m < 0) return { y: c.y - 1, m: 11 };
            if (m > 11) return { y: c.y + 1, m: 0 };
            return { y: c.y, m };
        });

    const confirm = () => {
        const iso = new Date(selected.y, selected.m, selected.d, TIME_HOURS[time] ?? 9, 0, 0, 0).toISOString();
        onSchedule(`${MONTHS[selected.m].slice(0, 3)} ${selected.d}, ${time}`, iso);
    };

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95 translate-y-2"
                            enterTo="opacity-100 scale-100 translate-y-0"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-10 h-10 rounded-[0.75rem] bg-lavender-mist dark:bg-dark-3">
                                            <Icon className="w-5 h-5 fill-primary" name="calendar" />
                                        </span>
                                        <div>
                                            <Dialog.Title className="text-h5 text-black dark:text-white">
                                                Schedule publish
                                            </Dialog.Title>
                                            <p className="text-caption-2 text-grey">
                                                Pick a date &amp; time to go live
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Close"
                                        className="btn-circle w-9 h-9 dark:bg-dark-3"
                                    >
                                        <Icon className="w-4 h-4 fill-grey" name="close" />
                                    </button>
                                </div>

                                {/* Month header */}
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-title text-black dark:text-white">
                                        {MONTHS[cursor.m]} {cursor.y}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            aria-label="Previous month"
                                            onClick={() => step(-1)}
                                            className="btn-circle w-8 h-8 dark:bg-dark-3"
                                        >
                                            <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-left" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Next month"
                                            onClick={() => step(1)}
                                            className="btn-circle w-8 h-8 dark:bg-dark-3"
                                        >
                                            <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-right" />
                                        </button>
                                    </div>
                                </div>

                                {/* Weekday row */}
                                <div className="grid grid-cols-7 mb-1">
                                    {WEEK.map((w) => (
                                        <span
                                            key={w}
                                            className="text-center text-caption-2 font-semibold text-grey"
                                        >
                                            {w}
                                        </span>
                                    ))}
                                </div>

                                {/* Day grid */}
                                <div className="grid grid-cols-7 gap-1">
                                    {cells.map((d, i) =>
                                        d === null ? (
                                            <span key={`b${i}`} />
                                        ) : (
                                            <button
                                                key={d}
                                                type="button"
                                                disabled={isPast(d)}
                                                onClick={() =>
                                                    setSelected({ y: cursor.y, m: cursor.m, d })
                                                }
                                                className={cn(
                                                    "relative flex items-center justify-center h-9 rounded-[0.625rem] text-body-sm transition-colors",
                                                    isSel(d)
                                                        ? "bg-primary font-bold text-white"
                                                        : isPast(d)
                                                          ? "text-grey-light cursor-not-allowed dark:text-grey-light/20"
                                                          : "text-black hover:bg-lavender-mist dark:text-white dark:hover:bg-dark-3",
                                                )}
                                            >
                                                {d}
                                                {isToday(d) && !isSel(d) && (
                                                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                                                )}
                                            </button>
                                        ),
                                    )}
                                </div>

                                {/* Time picker */}
                                <div className="mt-5">
                                    <div className="mb-2 text-caption-1 text-black dark:text-white">
                                        Time
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {TIMES.map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setTime(t)}
                                                className={cn(
                                                    "h-9 rounded-xl text-caption-1 font-semibold transition-colors",
                                                    t === time
                                                        ? "bg-primary text-white"
                                                        : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3",
                                                )}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="btn-secondary grow"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirm}
                                        className="btn-primary grow gap-2"
                                    >
                                        <Icon className="w-4 h-4 fill-white" name="calendar" />
                                        Schedule
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default ScheduleModal;
