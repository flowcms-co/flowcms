#!/usr/bin/env node
// Apply a content rules file to one content type through the agent model API.
//
//   FLOWCMS_URL=https://cms.example.com FLOWCMS_TOKEN=... \
//   node scripts/apply-content-rules.mjs resources path/to/resources-rules.json            (dry run)
//   node scripts/apply-content-rules.mjs resources path/to/resources-rules.json --apply     (writes)
//
// The token needs the model.update scope. A dry run asks the server to check the rules against the
// type's fields and writes nothing. Refuses a file that still has a placeholder guide link
// (REPLACE, or an example.com address) and an install that is not licensed for content_rules
// (an Enterprise feature).
import { readFileSync } from "node:fs";

const [type, file, ...flags] = process.argv.slice(2);
const base = (process.env.FLOWCMS_URL ?? "").replace(/\/$/, "");
const token = process.env.FLOWCMS_TOKEN;
if (!type || !file || !base || !token) {
    console.error("Usage: FLOWCMS_URL=... FLOWCMS_TOKEN=... node scripts/apply-content-rules.mjs <type apiId> <rules.json> [--apply]");
    process.exit(2);
}
const rules = JSON.parse(readFileSync(file, "utf8"));
const guideUrl = rules.guide?.url ?? "";
let guideHost = "";
try {
    guideHost = new URL(guideUrl).hostname.toLowerCase();
} catch {
    // not a URL: caught below when a guide is present
}
if (/REPLACE/i.test(guideUrl) || guideHost === "example.com" || guideHost.endsWith(".example.com")) {
    console.error("The guide link in the file is still a placeholder. Put the real link in guide.url first.");
    process.exit(2);
}
const notLicensed = () => {
    console.error('This install is not licensed for content rules ("content_rules", an Enterprise feature). Nothing was applied. See Settings > License.');
    process.exit(1);
};
// The license endpoint the studio uses. An agent token may not be allowed to read it; the server then
// still refuses the request below with a 403 when the install is not licensed.
const lic = await fetch(`${base}/api/license`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
if (lic?.ok) {
    const info = await lic.json().catch(() => null);
    const has = info && info.valid && !info.expired && Array.isArray(info.features) && (info.features.includes("*") || info.features.includes("content_rules"));
    if (info && !has) notLicensed();
}
const apply = flags.includes("--apply");
const res = await fetch(`${base}/api/agent/model/types/${encodeURIComponent(type)}${apply ? "" : "?dryRun=true"}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ schema: { contentRules: rules } }),
});
const body = await res.json().catch(() => ({}));
if (res.status === 403 && /content_rules/.test(body.message ?? "")) notLicensed();
if (!res.ok) {
    console.error(`Refused (${res.status}): ${body.message ?? JSON.stringify(body)}`);
    process.exit(1);
}
console.log(apply ? `Applied the rules to "${type}".` : `Dry run passed for "${type}". Nothing was written. Repeat with --apply to write.`);
