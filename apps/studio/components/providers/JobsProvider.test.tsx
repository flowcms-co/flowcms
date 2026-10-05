import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { JobsProvider, useJobs, type Job } from "./JobsProvider";
import { api } from "@/lib/api";

const realtime: Record<string, (payload: unknown) => void> = {};
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ useRealtime: (event: string, fn: (p: unknown) => void) => void (realtime[event] = fn) }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated" }) }));

const job = (id: string, status: Job["status"], extra: Partial<Job> = {}): Job => ({ id, type: "t", label: id, status, total: 10, completed: 0, failed: 0, progress: 0, ...extra });
const running = job("audit", "RUNNING", { label: "Audit pages" });
const oldDone = job("old-delete", "SUCCEEDED", { label: "Delete 35 items", completed: 35 });
const oldFailed = job("old-images", "FAILED", { label: "Process 460 images", failed: 460 });

/** Mount the provider with GET /jobs answering `list`, and let the seed fetch settle. */
async function mount(list: Job[]) {
    vi.mocked(api).mockResolvedValue(list);
    const view = renderHook(() => useJobs(), { wrapper: ({ children }: { children: ReactNode }) => <JobsProvider>{children}</JobsProvider> });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return view;
}
const poll = () => act(async () => { await vi.advanceTimersByTimeAsync(5000); });
const ids = (r: { current: { jobs: Job[] } }) => r.current.jobs.map((j) => j.id);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.mocked(api).mockReset();
});

describe("JobsProvider", () => {
    it("does not add old finished jobs that the poll returns", async () => {
        const { result } = await mount([running, oldDone, oldFailed]);
        expect(ids(result)).toEqual(["audit"]);
        await poll();
        await poll();
        expect(ids(result)).toEqual(["audit"]);
    });

    it("adds a job the poll finds running that is not on screen yet", async () => {
        const { result } = await mount([running]);
        vi.mocked(api).mockResolvedValue([running, job("import", "QUEUED")]);
        await poll();
        expect(ids(result).sort()).toEqual(["audit", "import"]);
    });

    it("keeps a dismissed job gone on the next poll and on realtime events", async () => {
        const second = job("publish", "RUNNING");
        const { result } = await mount([running, second]);
        act(() => result.current.dismiss("publish"));
        expect(ids(result)).toEqual(["audit"]);
        await poll(); // the endpoint still returns it
        act(() => realtime["job:update"]({ id: "publish", progress: 50 }));
        act(() => realtime["job:done"]({ ...second, status: "SUCCEEDED" }));
        expect(ids(result)).toEqual(["audit"]);
    });

    it("updates a running job in place when it completes, and keeps it until dismissed", async () => {
        const { result } = await mount([running]);
        act(() => realtime["job:update"]({ id: "audit", progress: 40, completed: 4 }));
        expect(result.current.jobs[0]).toMatchObject({ status: "RUNNING", progress: 40 });

        // Finishes via the poll (socket dropped): final state shows, nothing else is added.
        vi.mocked(api).mockResolvedValue([{ ...running, status: "SUCCEEDED", progress: 100, completed: 10 }, oldDone]);
        await poll();
        expect(result.current.jobs).toHaveLength(1);
        expect(result.current.jobs[0]).toMatchObject({ id: "audit", status: "SUCCEEDED", progress: 100 });

        // No job is active now, so polling has stopped and the result stays on screen.
        const calls = vi.mocked(api).mock.calls.length;
        await poll();
        expect(vi.mocked(api).mock.calls.length).toBe(calls);
        expect(ids(result)).toEqual(["audit"]);

        act(() => result.current.dismiss("audit"));
        expect(ids(result)).toEqual([]);
    });

    it("ignores a job:done event for a finished job that was never on screen", async () => {
        const { result } = await mount([running]);
        act(() => realtime["job:done"](oldFailed));
        expect(ids(result)).toEqual(["audit"]);
    });
});
