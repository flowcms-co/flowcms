/**
 * Rough price table (USD per 1M tokens) for cost estimates on the Usage
 * dashboard. Unknown models estimate to null (shown as "—"). Approximate; the
 * provider's bill is the source of truth.
 */
const PRICES: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5, out: 10 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 },
    "o3-mini": { in: 1.1, out: 4.4 },
    "claude-3-5-sonnet-latest": { in: 3, out: 15 },
    "claude-3-5-haiku-latest": { in: 0.8, out: 4 },
    "gemini-2.0-flash": { in: 0.1, out: 0.4 },
    "gemini-1.5-pro": { in: 1.25, out: 5 },
    "deepseek-chat": { in: 0.27, out: 1.1 },
    "deepseek-reasoner": { in: 0.55, out: 2.19 },
    "mistral-large-latest": { in: 2, out: 6 },
    "llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
    "grok-2-latest": { in: 2, out: 10 },
    sonar: { in: 1, out: 1 },
};

export function estimateCostUsd(
    model: string,
    promptTokens: number,
    completionTokens: number,
): number | null {
    const p = PRICES[model];
    if (!p) return null;
    return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}
