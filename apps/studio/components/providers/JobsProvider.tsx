"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/components/providers/AuthProvider";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";
export type JobFailure = { id: string; label: string; reason: string };
export type Job = {
    id: string;
    type: string;
    label: string;
    status: JobStatus;
    total: number;
    completed: number;
    failed: number;
    progress: number;
    error?: string | null;
    result?: { done?: number; failed?: number; failures?: JobFailure[] } | null;
};

const ACTIVE = new Set<JobStatus>(["QUEUED", "RUNNING"]);

type Ctx = {
    jobs: Job[];
    /** POST to an enqueue endpoint, start tracking the returned job, return it. */
    enqueue: (endpoint: string, body?: unknown, label?: string) => Promise<Job | null>;
    dismiss: (id: string) => void;
};

const JobsContext = createContext<Ctx>({ jobs: [], enqueue: async () => null, dismiss: () => {} });

/**
 * Tracks the current user's background jobs so bulk work never blocks the UI. Seeds
 * active jobs on mount, then merges realtime `job:update`/`job:done` events (with a
 * poll fallback while anything is running). `JobToasts` renders from this; completed
 * jobs also land in the notifications bell (written server-side).
 */
export function JobsProvider({ children }: { children: ReactNode }) {
    const [jobs, setJobs] = useState<Job[]>([]);

    const upsert = useCallback((patch: Partial<Job> & { id: string }) => {
        setJobs((prev) => {
            const i = prev.findIndex((j) => j.id === patch.id);
            if (i === -1) return [{ total: 0, completed: 0, failed: 0, progress: 0, label: "", type: "", status: "RUNNING", ...patch } as Job, ...prev];
            const next = prev.slice();
            next[i] = { ...next[i], ...patch };
            return next;
        });
    }, []);

    // Seed only ACTIVE jobs once signed in (terminal ones live in the bell, not
    // the toaster). Gated on auth so the login screen makes no /jobs request.
    const { status: authStatus } = useAuth();
    useEffect(() => {
        if (authStatus !== "authenticated") return;
        api<Job[]>("/jobs")
            .then((list) => setJobs((Array.isArray(list) ? list : []).filter((j) => ACTIVE.has(j.status))))
            .catch(() => undefined);
    }, [authStatus]);

    useRealtime<Partial<Job> & { id: string }>("job:update", (p) => upsert(p), []);
    useRealtime<Job>("job:done", (j) => upsert(j), []);

    // Poll fallback while any job is active (covers a dropped socket).
    const hasActive = jobs.some((j) => ACTIVE.has(j.status));
    useEffect(() => {
        if (!hasActive) return;
        const t = setInterval(() => {
            api<Job[]>("/jobs")
                .then((list) => (Array.isArray(list) ? list : []).forEach((j) => upsert(j)))
                .catch(() => undefined);
        }, 5000);
        return () => clearInterval(t);
    }, [hasActive, upsert]);

    const enqueue = useCallback(async (endpoint: string, body?: unknown, label?: string) => {
        const job = await api<Job>(endpoint, { method: "POST", body: JSON.stringify(body ?? {}) });
        if (job?.id) upsert({ ...job, label: label ?? job.label, status: job.status ?? "QUEUED" });
        return job ?? null;
    }, [upsert]);

    const dismiss = useCallback((id: string) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);

    return <JobsContext.Provider value={{ jobs, enqueue, dismiss }}>{children}</JobsContext.Provider>;
}

export const useJobs = () => useContext(JobsContext);
