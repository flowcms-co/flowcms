/**
 * Cloudflare Worker — serves https://get.flowcms.co
 *
 * Single source of truth: the installer lives ONLY in the repo at
 * deploy/install.sh. This Worker proxies it so users get a clean, branded,
 * stable URL:
 *
 *   curl -fsSL https://get.flowcms.co | bash
 *   curl -fsSL https://get.flowcms.co/install.sh | bash
 *
 * A browser hitting https://get.flowcms.co/ gets a tiny landing page with the
 * two install paths (self-host curl + Deploy on Railway).
 *
 * Deploy: see the "Cloudflare" steps in docs/DEPLOY.md. In short — Workers &
 * Pages > Create Worker, paste this file, then Settings > Domains & Routes >
 * Add Custom Domain > get.flowcms.co (Cloudflare wires the DNS automatically).
 *
 * To pin installs to a release tag instead of the moving `main`, change
 * RAW_REF below from "main" to e.g. "v1.0.0".
 */
const REPO = "flowcms-co/flowcms";
const RAW_REF = "main";
const SCRIPT_URL = `https://raw.githubusercontent.com/${REPO}/${RAW_REF}/deploy/install.sh`;

// Published Railway template (one-click app + managed Postgres).
const RAILWAY_TEMPLATE_URL = "https://railway.com/deploy/flowcms?referralCode=nMR5GG&utm_medium=integration&utm_source=template&utm_campaign=landing_page";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const wantsScript =
      url.pathname === "/install.sh" ||
      url.pathname.startsWith("/install") ||
      // `curl /` (no browser Accept) → serve the script so the one-liner works.
      (url.pathname === "/" && !(request.headers.get("accept") || "").includes("text/html"));

    if (wantsScript) {
      const upstream = await fetch(SCRIPT_URL, { cf: { cacheTtl: 300 } });
      if (!upstream.ok) {
        return new Response(
          `# Could not fetch installer (${upstream.status}). Try:\n# git clone https://github.com/${REPO}\n`,
          { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
        );
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    // Browser landing page.
    return new Response(landingHTML(), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};

function landingHTML() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Install Flow CMS</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, Inter, Segoe UI, Roboto, sans-serif;
    background: #0f0e17; color: #e9e8f0; padding: 24px; }
  .card { max-width: 640px; width: 100%; }
  h1 { font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }
  .accent { color: #a99bff; }
  p { color: #b7b5c8; line-height: 1.6; }
  pre { background: #1a1925; border: 1px solid #2a2940; border-radius: 10px;
    padding: 16px; overflow-x: auto; font-size: 14px; }
  code { color: #d8d5ff; }
  a.btn { display: inline-block; margin-top: 12px; padding: 10px 18px;
    background: #6C5CE7; color: #fff; text-decoration: none; border-radius: 10px;
    font-weight: 600; }
  .muted { font-size: 13px; color: #8a8799; margin-top: 28px; }
</style>
</head>
<body>
<div class="card">
  <h1>Flow CMS <span class="accent">·</span> install</h1>
  <p>An AI-powered, self-hostable headless CMS. Two ways to run it:</p>

  <p><strong>On your own server</strong> (a fresh Linux VPS):</p>
  <pre><code>curl -fsSL https://get.flowcms.co | bash</code></pre>

  <p><strong>Hosted for you</strong> (no server to manage):</p>
  <a class="btn" href="${RAILWAY_TEMPLATE_URL}">Deploy on Railway</a>

  <p class="muted">Source &amp; docs: <a href="https://github.com/${REPO}" style="color:#a99bff">github.com/${REPO}</a></p>
</div>
</body>
</html>`;
}
