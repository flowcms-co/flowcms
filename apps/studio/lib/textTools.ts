/**
 * Offline writing tools — deterministic, rule-based engines that run entirely in
 * the browser with no AI cost and no network. They mirror what spell/grammar
 * checkers (Word, Pages, Docs, LanguageTool, write-good) did before LLMs:
 *
 *  - checkGrammar    → spelling/grammar/style issues + a Flesch readability score
 *  - checkOriginality→ duplicate-passage detection against the workspace's own
 *                      pages (self-plagiarism) + boilerplate/cliché flags
 *  - suggestLinks    → internal-link suggestions by phrase-matching real pages
 *
 * Each AI tool uses these as the free default and offers an optional "Check with
 * AI" pass for deeper, context-aware analysis.
 */

export type GrammarIssueType = "Spelling" | "Grammar" | "Style" | "Clarity";
export type TextIssue = { id: string; type: GrammarIssueType; text: string; suggestion: string };

const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from", "as", "is", "are",
    "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "your", "you", "our", "we",
    "how", "what", "why", "when", "near", "needs", "need", "not", "no", "do", "does",
]);

/* ── Common misspellings (high-confidence, no dictionary needed) ── */
const MISSPELLINGS: Record<string, string> = {
    occured: "occurred", occurence: "occurrence", occuring: "occurring", recieve: "receive", recieved: "received",
    seperate: "separate", definately: "definitely", definatly: "definitely", neccessary: "necessary",
    accomodate: "accommodate", acheive: "achieve", beleive: "believe", calender: "calendar", collegue: "colleague",
    concious: "conscious", embarass: "embarrass", enviroment: "environment", existance: "existence",
    foriegn: "foreign", goverment: "government", gaurantee: "guarantee", harrass: "harass",
    independant: "independent", occassion: "occasion", persistant: "persistent", priviledge: "privilege",
    recomend: "recommend", refered: "referred", relevent: "relevant", succesful: "successful",
    succesfully: "successfully", tendancy: "tendency", untill: "until", wich: "which", alot: "a lot",
    teh: "the", adress: "address", arguement: "argument", basicly: "basically", begining: "beginning",
    completly: "completely", dissapoint: "disappoint", finaly: "finally", immediatly: "immediately",
    knowlege: "knowledge", publically: "publicly", suprise: "surprise", tommorow: "tomorrow",
    truely: "truly", wierd: "weird", writting: "writing", thier: "their", alright: "all right",
};

/* ── Grammar rules: regex → replacement ── */
const GRAMMAR_RULES: { re: RegExp; replace: (m: RegExpExecArray) => string; type: GrammarIssueType }[] = [
    { re: /\b(should|could|would|must|might)\s+of\b/gi, replace: (m) => `${m[1]} have`, type: "Grammar" },
    { re: /\bmore\s+(better|worse|easier|faster|simpler|cheaper|harder|cleaner)\b/gi, replace: (m) => m[1], type: "Grammar" },
    { re: /\btheir\s+(is|are|was|were)\b/gi, replace: (m) => `there ${m[1]}`, type: "Grammar" },
    { re: /\byour\s+welcome\b/gi, replace: () => "you're welcome", type: "Grammar" },
    { re: /\bcould\s+care\s+less\b/gi, replace: () => "couldn't care less", type: "Grammar" },
    { re: /\b(\w+)\s+\1\b/gi, replace: (m) => m[1], type: "Grammar" }, // doubled word
];

/* ── Wordiness / clarity: phrase → simpler ── */
const WORDY: Record<string, string> = {
    "in order to": "to", "due to the fact that": "because", "in the event that": "if",
    "at this point in time": "now", "a large number of": "many", "the majority of": "most",
    "in spite of the fact that": "although", "with regard to": "about", "in the near future": "soon",
    "for the purpose of": "to", "in the process of": "", "has the ability to": "can", "very unique": "unique",
};

/* ── Weasel / filler words (flag → consider removing) ── */
const WEASEL = ["very", "really", "actually", "basically", "literally", "simply", "just", "quite"];

/* ── Clichés / buzzwords (rephrase) ── */
const CLICHES = [
    "at the end of the day", "think outside the box", "low-hanging fruit", "move the needle", "circle back",
    "synergy", "game-changer", "cutting-edge", "best-in-class", "world-class", "revolutionary", "seamless",
    "paradigm shift", "in today's fast-paced world", "it is important to note that", "needless to say",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length <= 3) return 1;
    const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
}

/** Flesch Reading Ease (0–100, higher = easier), clamped to an integer score. */
export function readabilityScore(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    const words = text.match(/\b[\w']+\b/g) ?? [];
    if (words.length === 0) return 0;
    const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
    const flesch = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
    return Math.max(0, Math.min(100, Math.round(flesch)));
}

/**
 * Deterministic grammar / spelling / style check. Returns a readability score and
 * a deduped, capped list of issues (spelling first, then grammar, then style).
 */
export function checkGrammar(text: string): { score: number; issues: TextIssue[] } {
    const issues: TextIssue[] = [];
    const seen = new Set<string>();
    const push = (type: GrammarIssueType, matched: string, suggestion: string) => {
        const key = `${matched.toLowerCase()}→${suggestion.toLowerCase()}`;
        if (seen.has(key) || !matched.trim()) return;
        seen.add(key);
        issues.push({ id: `s${issues.length}`, type, text: matched, suggestion });
    };

    // Spelling
    for (const m of text.matchAll(/\b[\w']+\b/g)) {
        const word = m[0];
        const fix = MISSPELLINGS[word.toLowerCase()];
        if (fix) push("Spelling", word, fix);
    }
    // Grammar rules
    for (const rule of GRAMMAR_RULES) {
        let m: RegExpExecArray | null;
        const re = new RegExp(rule.re.source, rule.re.flags);
        while ((m = re.exec(text))) {
            const replacement = rule.replace(m);
            if (m[0].toLowerCase() !== replacement.toLowerCase()) push(rule.type, m[0], replacement);
            if (m.index === re.lastIndex) re.lastIndex++;
        }
    }
    // Wordiness
    for (const [phrase, simpler] of Object.entries(WORDY)) {
        const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
        const m = re.exec(text);
        if (m) push("Clarity", m[0], simpler || "(remove)");
    }
    // Clichés
    for (const c of CLICHES) {
        const re = new RegExp(`\\b${escapeRe(c)}\\b`, "gi");
        const m = re.exec(text);
        if (m) push("Style", m[0], "(cliché — rephrase)");
    }
    // Passive voice (heuristic)
    const passive = /\b(am|is|are|was|were|be|been|being)\s+(\w+ed|done|made|known|seen|given|taken|written|built|held|sent)\b/gi;
    let pm: RegExpExecArray | null;
    let passiveCount = 0;
    while ((pm = passive.exec(text)) && passiveCount < 3) {
        push("Style", pm[0], "(consider active voice)");
        passiveCount++;
    }
    // Weasel words (flag a few, don't flood)
    let weaselCount = 0;
    for (const w of WEASEL) {
        if (weaselCount >= 3) break;
        const re = new RegExp(`\\b${w}\\b`, "i");
        const m = re.exec(text);
        if (m) {
            push("Style", m[0], "(filler — consider removing)");
            weaselCount++;
        }
    }

    const order: Record<GrammarIssueType, number> = { Spelling: 0, Grammar: 1, Clarity: 2, Style: 3 };
    issues.sort((a, b) => order[a.type] - order[b.type]);
    return { score: readabilityScore(text), issues: issues.slice(0, 15) };
}

/* ── Originality (self-plagiarism + boilerplate) ── */
export type CorpusPage = { title: string; body: string };
export type OriginalityNote = { severity: "high" | "medium" | "low"; snippet: string; why: string };
export type OriginalityResult = { score: number; notes: OriginalityNote[] };

const normalizeWords = (s: string) =>
    s.toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);

const SHINGLE = 6;
const shingles = (words: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i + SHINGLE <= words.length; i++) set.add(words.slice(i, i + SHINGLE).join(" "));
    return set;
};

/**
 * Compare text against the workspace's own pages to flag duplicated passages
 * (self-plagiarism) plus generic boilerplate. Honest scope: this is NOT a
 * web-wide scan — that needs a dedicated plagiarism API.
 */
export function checkOriginality(text: string, corpus: CorpusPage[]): OriginalityResult {
    const words = normalizeWords(text);
    const notes: OriginalityNote[] = [];

    if (words.length >= SHINGLE) {
        const inputShingles = [...shingles(words)];
        for (const page of corpus) {
            const pageSet = shingles(normalizeWords(page.body));
            const overlap = inputShingles.filter((sh) => pageSet.has(sh));
            if (overlap.length > 0) {
                const ratio = overlap.length / inputShingles.length;
                notes.push({
                    severity: ratio > 0.3 ? "high" : ratio > 0.1 ? "medium" : "low",
                    snippet: overlap[0],
                    why: `Overlaps with your existing page “${page.title}” (${Math.round(ratio * 100)}% of phrases match).`,
                });
            }
        }
    }

    // Boilerplate / clichés
    for (const c of CLICHES) {
        const re = new RegExp(`\\b${escapeRe(c)}\\b`, "i");
        const m = re.exec(text);
        if (m) notes.push({ severity: "low", snippet: m[0], why: "Generic boilerplate phrase — rephrase for originality." });
    }

    const dupRatio = notes.filter((n) => n.severity !== "low").reduce((max, n) => Math.max(max, n.severity === "high" ? 0.4 : 0.15), 0);
    const score = Math.max(0, Math.min(100, Math.round(100 - dupRatio * 100 - notes.filter((n) => n.severity === "low").length * 2)));
    return { score, notes: notes.slice(0, 12) };
}

/* ── Internal link suggestions (phrase matching) ── */
export type LinkPage = { title: string; slug: string };
export type LinkSuggestion = { anchor: string; target: string; relevance: number };

const contentWords = (title: string) => title.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, "")).filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));

/**
 * Suggest internal links by matching each page's significant title phrases inside
 * the draft. Deterministic, grounded in real pages — only links to pages that exist.
 */
export function suggestLinks(text: string, pages: LinkPage[]): LinkSuggestion[] {
    const out: LinkSuggestion[] = [];
    const usedTargets = new Set<string>();

    // Try the most specific candidates first: bigrams, then strong unigrams.
    for (const page of pages) {
        const words = contentWords(page.title);
        const target = `/${page.slug}`;
        if (usedTargets.has(target)) continue;
        const candidates: { phrase: string; relevance: number }[] = [];
        for (let i = 0; i + 1 < words.length; i++) candidates.push({ phrase: `${words[i]} ${words[i + 1]}`, relevance: 85 });
        for (const w of words) candidates.push({ phrase: w, relevance: w.length >= 7 ? 70 : 60 });

        for (const c of candidates.sort((a, b) => b.relevance - a.relevance)) {
            const re = new RegExp(`\\b${escapeRe(c.phrase)}\\b`, "i");
            const m = re.exec(text);
            if (m) {
                out.push({ anchor: m[0], target, relevance: c.relevance });
                usedTargets.add(target);
                break;
            }
        }
    }
    return out.sort((a, b) => b.relevance - a.relevance).slice(0, 12);
}
