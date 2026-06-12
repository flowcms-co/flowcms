"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type AiProvider = {
    id: string;
    provider: string;
    name: string;
    status: string;
    defaultModel: string | null;
    suggestedModels: string[];
};

export type AiUsage = { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null };
export type AiResult = { text: string; provider: string; model: string; usage: AiUsage };

export type RunAiOpts = {
    feature: string;
    prompt: string;
    system?: string;
    provider?: string;
    model?: string;
    contentTypeApiId?: string;
    maxTokens?: number;
    temperature?: number;
};

/** Load the workspace's AI providers and track the active provider + model. */
export function useAiProviders() {
    const [providers, setProviders] = useState<AiProvider[]>([]);
    const [providerId, setProviderId] = useState("");
    const [model, setModel] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<AiProvider[]>("/ai/providers")
            .then((list) => {
                setProviders(list);
                const connected = list.find((p) => p.status === "CONNECTED") ?? list[0];
                if (connected) {
                    setProviderId(connected.provider);
                    setModel(connected.defaultModel ?? "");
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const hasProvider = providers.some((p) => p.status === "CONNECTED");
    const activeProvider = providers.find((p) => p.provider === providerId);
    return { providers, providerId, setProviderId, model, setModel, loading, hasProvider, activeProvider };
}

/** POST /ai/generate and return the result. Throws ApiError on failure. */
export function runAi(opts: RunAiOpts): Promise<AiResult> {
    return api<AiResult>("/ai/generate", { method: "POST", body: JSON.stringify(opts) });
}

/** Friendly message from an unknown error thrown by runAi. */
export function aiErrorMessage(e: unknown): string {
    return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}

/**
 * Pull a JSON object/array out of a model response that may be wrapped in prose
 * or ```json fences. Returns null if nothing parseable is found.
 */
export function extractJson<T>(raw: string): T | null {
    if (!raw) return null;
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();

    const firstObj = s.indexOf("{");
    const firstArr = s.indexOf("[");
    let start = -1;
    let closeCh = "}";
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
        start = firstArr;
        closeCh = "]";
    } else if (firstObj !== -1) {
        start = firstObj;
    }
    if (start === -1) return null;
    const end = s.lastIndexOf(closeCh);
    if (end <= start) return null;

    try {
        return JSON.parse(s.slice(start, end + 1)) as T;
    } catch {
        try {
            return JSON.parse(s) as T;
        } catch {
            return null;
        }
    }
}
