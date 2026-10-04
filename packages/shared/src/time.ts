/**
 * Calendar maths in a named IANA time zone ("Asia/Kolkata"), so "today", "this
 * week" and streaks mean the same thing on the server and in every browser.
 * Built on Intl only; no date library.
 */

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

function parts(at: Date, tz: string): Parts {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Whether `tz` is a real IANA time zone name this runtime knows ("Europe/London",
 *  "UTC"). Empty, misspelt and made-up names are not. */
export function isTimeZone(tz: unknown): tz is string {
    if (typeof tz !== "string" || !tz.trim() || tz !== tz.trim()) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** Every IANA zone the runtime knows, UTC first, for a picker. */
export function timeZones(): string[] {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return ["UTC", ...all.filter((z) => z !== "UTC")];
}

/** `tz` when the runtime knows it, else "UTC" (a bad stored value never throws). */
export function safeTimeZone(tz?: string | null): string {
    try {
        if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz || "UTC";
    } catch {
        return "UTC";
    }
}

/** How far ahead of UTC the zone is at this instant, in milliseconds. */
export function tzOffsetMs(at: Date, tz: string): number {
    const p = parts(at, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(+at / 1000) * 1000;
}

/** The instant a wall-clock midnight happens in the zone (day overflow is fine). */
function localMidnight(y: number, m: number, d: number, tz: string): Date {
    const guess = Date.UTC(y, m - 1, d);
    const off = tzOffsetMs(new Date(guess), tz);
    // Re-check at the corrected instant: the offset differs across a DST change.
    const off2 = tzOffsetMs(new Date(guess - off), tz);
    return new Date(guess - off2);
}

/** Midnight (in the zone) of the day containing `at`, moved by `addDays`. */
export function zonedDayStart(at: Date, tz: string, addDays = 0): Date {
    const p = parts(at, tz);
    return localMidnight(p.y, p.m, p.d + addDays, tz);
}

/** Day of the week in the zone, Monday = 0 … Sunday = 6. */
export function zonedWeekday(at: Date, tz: string): number {
    const p = parts(at, tz);
    return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

/** Monday midnight (in the zone) of the week containing `at`. */
export function zonedWeekStart(at: Date, tz: string): Date {
    return zonedDayStart(at, tz, -zonedWeekday(at, tz));
}

/** "YYYY-MM-DD" of the day containing `at` in the zone. */
export function zonedDayKey(at: Date, tz: string): string {
    const p = parts(at, tz);
    return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Hour of the day (0-23) and day of the month in the zone. */
export function zonedClock(at: Date, tz: string): { hour: number; day: number; month: number } {
    const p = parts(at, tz);
    return { hour: p.h, day: p.d, month: p.m };
}
