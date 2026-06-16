/**
 * Derive a plural apiId from a singular one for the public delivery route
 * (/public/<pluralApiId>). Naive `${apiId}s` produced doubled tails like
 * "services" -> "servicess"; this leaves an already-plural (s-ending) id alone
 * and handles the common consonant+y case.
 */
export function pluralize(apiId: string): string {
    if (!apiId) return apiId;
    if (/s$/i.test(apiId)) return apiId; // already ends in "s" (e.g. "services")
    if (/[^aeiou]y$/i.test(apiId)) return apiId.replace(/y$/i, "ies"); // category -> categories
    return `${apiId}s`;
}
