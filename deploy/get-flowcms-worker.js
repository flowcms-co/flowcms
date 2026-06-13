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
 * A browser hitting https://get.flowcms.co/ gets a branded landing page with
 * the two install paths (self-host curl + Deploy on Railway).
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

// Set this once you publish a Railway template (Railway > your template > Share).
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
<meta name="description" content="Get Flow CMS running: fully managed on Railway, or self-hosted on your own server. Open source, AI-powered headless CMS." />
<meta name="theme-color" content="#F4F3FB" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#131220" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='30' fill='%236C5CE7'/%3E%3Crect x='28' y='40' width='64' height='14' rx='7' fill='white'/%3E%3Crect x='28' y='62' width='46' height='14' rx='7' fill='white' fill-opacity='.6'/%3E%3Crect x='28' y='84' width='28' height='14' rx='7' fill='white' fill-opacity='.35'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet" />
<script>
(function () {
  var d = document.documentElement;
  d.classList.add('has-js');
  try {
    var t = localStorage.getItem('flowcms-theme');
    if (t === 'dark' || t === 'light') d.setAttribute('data-theme', t);
  } catch (e) {}
  var dark = d.getAttribute('data-theme') === 'dark' ||
    (!d.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  d.setAttribute('data-mode', dark ? 'dark' : 'light');
})();
</script>
<style>
  *{ box-sizing: border-box; }
  html{ -webkit-text-size-adjust: 100%; }
  :root{
    color-scheme: light dark;
    --bg:#F4F3FB; --surface:#FFFFFF; --surface-2:#FBFAFE; --border:#E7E4F3;
    --text:#1A1A2E; --dim:#52526B; --mute:#73738C;
    --primary:#6C5CE7; --primary-hover:#5A4BD4; --accent:#5A4BD4; --on-primary:#FFFFFF;
    --feature:#F3F0FE; --feature-border:rgba(108,92,231,.34);
    --glow:rgba(108,92,231,.20); --ring:rgba(108,92,231,.5);
    --shadow:0 1px 2px rgba(26,26,46,.05), 0 14px 44px -16px rgba(108,92,231,.22);
    --shadow-lg:0 28px 64px -28px rgba(76,61,174,.40);
    --dot:rgba(108,92,231,.16);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#131220; --surface:#1C1B2B; --surface-2:#242338; --border:#322F4A;
      --text:#ECECF5; --dim:#B6B4CA; --mute:#807E99;
      --primary:#6C5CE7; --primary-hover:#7C6CF0; --accent:#A29BFE; --on-primary:#FFFFFF;
      --feature:#211F36; --feature-border:rgba(162,155,254,.34);
      --glow:rgba(140,116,240,.26); --ring:rgba(162,155,254,.55);
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 18px 54px -18px rgba(0,0,0,.6);
      --shadow-lg:0 32px 72px -30px rgba(0,0,0,.72);
      --dot:rgba(162,155,254,.14);
    }
  }
  :root[data-theme="dark"]{
    --bg:#131220; --surface:#1C1B2B; --surface-2:#242338; --border:#322F4A;
    --text:#ECECF5; --dim:#B6B4CA; --mute:#807E99;
    --primary:#6C5CE7; --primary-hover:#7C6CF0; --accent:#A29BFE; --on-primary:#FFFFFF;
    --feature:#211F36; --feature-border:rgba(162,155,254,.34);
    --glow:rgba(140,116,240,.26); --ring:rgba(162,155,254,.55);
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 18px 54px -18px rgba(0,0,0,.6);
    --shadow-lg:0 32px 72px -30px rgba(0,0,0,.72);
    --dot:rgba(162,155,254,.14);
  }

  body{
    margin:0; background:var(--bg); color:var(--text);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    min-height:100vh; min-height:100svh; display:flex; flex-direction:column;
    position:relative; overflow-x:hidden;
  }
  h1, .card-title, .brand .word{ font-family:'Poppins',sans-serif; }
  a{ color:inherit; text-decoration:none; }

  .bg{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
  .glow{
    position:absolute; top:-24vh; left:50%; width:min(1100px,150vw); height:780px;
    transform:translateX(-50%);
    background:radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%);
    filter:blur(6px); opacity:.92; will-change:transform,opacity;
  }
  .grid{
    position:absolute; inset:0;
    background-image:radial-gradient(var(--dot) 1px, transparent 1px);
    background-size:26px 26px;
    -webkit-mask-image:radial-gradient(78% 50% at 50% 14%, #000, transparent 76%);
    mask-image:radial-gradient(78% 50% at 50% 14%, #000, transparent 76%);
    opacity:.55;
  }

  .skip{ position:absolute; left:-9999px; top:0; z-index:60; background:var(--surface); color:var(--text);
    padding:10px 14px; border:1px solid var(--border); border-radius:10px; }
  .skip:focus{ left:16px; top:16px; }

  .nav{
    position:relative; z-index:2; width:100%; max-width:980px; margin:0 auto;
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:22px clamp(20px,5vw,40px);
  }
  .brand{ display:inline-flex; align-items:center; gap:10px; font-weight:600; }
  .brand .mark{ display:block; border-radius:8px; box-shadow:0 8px 20px -8px var(--glow); }
  .brand .word{ font-size:20px; font-weight:700; letter-spacing:-.01em; }
  .brand .word .accent{ color:var(--accent); }
  .nav-actions{ display:flex; align-items:center; gap:10px; }
  .ghost{
    display:inline-flex; align-items:center; gap:7px; color:var(--dim);
    font-size:14px; font-weight:500; padding:9px 13px; border-radius:10px;
    border:1px solid transparent;
    transition:color .18s ease, background .18s ease, border-color .18s ease;
  }
  .ghost svg, .iconbtn svg{ width:16px; height:16px; display:block; }
  .iconbtn{
    display:inline-grid; place-items:center; width:38px; height:38px; border-radius:10px;
    border:1px solid var(--border); background:var(--surface); color:var(--dim); cursor:pointer;
    transition:color .18s ease, border-color .18s ease, transform .12s ease;
  }
  @media (hover:hover) and (pointer:fine){
    .ghost:hover{ color:var(--text); background:var(--surface); border-color:var(--border); }
    .iconbtn:hover{ color:var(--text); border-color:var(--accent); }
  }
  .iconbtn:active{ transform:scale(.95); }
  .i-sun{ display:none; }
  :root[data-mode="dark"] .i-sun{ display:block; }
  :root[data-mode="dark"] .i-moon{ display:none; }

  .wrap{
    position:relative; z-index:1; flex:1 0 auto; width:100%; max-width:980px; margin:0 auto;
    padding:clamp(20px,5vh,52px) clamp(20px,5vw,40px) 40px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  }
  .hero{ text-align:center; display:flex; flex-direction:column; align-items:center; }
  .badge{
    display:inline-flex; align-items:center; gap:9px;
    padding:7px 14px; border-radius:10px; border:1px solid var(--border);
    background:var(--surface); box-shadow:var(--shadow);
    font-size:13px; font-weight:500; color:var(--dim);
  }
  .badge .dot{ width:7px; height:7px; border-radius:999px; background:#00B894; box-shadow:0 0 0 3px rgba(0,184,148,.18); }
  h1{ margin:24px 0 0; font-weight:700; letter-spacing:-.03em; line-height:1.04;
    font-size:clamp(33px,6vw,58px); text-wrap:balance; }
  .sub{ margin:18px 0 0; max-width:54ch; color:var(--dim);
    font-size:clamp(15px,2.3vw,18px); line-height:1.6; text-wrap:pretty; }

  .paths{
    display:grid; grid-template-columns:1fr 1fr; gap:20px;
    width:100%; max-width:920px; margin:clamp(34px,5vh,48px) auto 0; text-align:left;
  }
  @media (max-width:820px){ .paths{ grid-template-columns:1fr; max-width:560px; } }

  .card{
    position:relative; overflow:hidden; display:flex; flex-direction:column;
    padding:0 0 22px; background:var(--surface); border:1px solid var(--border);
    border-radius:18px; box-shadow:var(--shadow);
    transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
  }
  .card.feature{ background:var(--feature); border-color:var(--feature-border); box-shadow:var(--shadow-lg); }
  @media (hover:hover) and (pointer:fine){
    .card:hover{ transform:translateY(-2px); box-shadow:var(--shadow-lg); }
  }
  .spot{
    position:absolute; top:0; left:0; width:320px; height:320px; translate:-50% -50%;
    background:radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%);
    opacity:0; pointer-events:none; z-index:0;
  }
  .card > *:not(.spot){ position:relative; z-index:1; }

  .card-top{ display:flex; align-items:center; gap:13px; padding:22px 22px 0; }
  .card-ic{
    flex:none; width:42px; height:42px; border-radius:12px; display:grid; place-items:center;
    background:var(--surface-2); border:1px solid var(--border); color:var(--accent);
  }
  .card-ic svg{ width:20px; height:20px; display:block; }
  .card.feature .card-ic{ background:var(--surface); border-color:var(--feature-border); color:var(--text); }
  .card-h{ display:flex; flex-direction:column; gap:2px; min-width:0; }
  .card-title{ font-size:18px; font-weight:600; letter-spacing:-.01em; }
  .tag{ font-size:12.5px; color:var(--mute); font-weight:500; }
  .rec{
    margin-left:auto; align-self:flex-start; white-space:nowrap;
    font-size:11.5px; font-weight:600; color:var(--primary);
    background:var(--surface); border:1px solid var(--feature-border);
    padding:5px 9px; border-radius:8px;
  }
  :root[data-mode="dark"] .rec{ color:var(--accent); }

  .card-desc{ margin:0; padding:15px 22px 0; color:var(--dim); font-size:14px; line-height:1.55; }

  .feats{ list-style:none; margin:0; padding:16px 22px 0; display:flex; flex-direction:column; gap:10px; }
  .feats li{ display:flex; gap:10px; align-items:flex-start; font-size:13.5px; color:var(--dim); line-height:1.45; }
  .feats svg{ flex:none; width:17px; height:17px; color:#00B894; margin-top:1px; }

  .note{ margin:0; padding:14px 22px 0; color:var(--mute); font-size:12.5px; line-height:1.5; }

  .action{ margin-top:auto; padding:18px 22px 0; }

  .codeline{
    display:flex; align-items:center; gap:8px;
    padding:10px 10px 10px 14px; background:var(--surface-2);
    border:1px solid var(--border); border-radius:11px; overflow:hidden;
  }
  .codeline code{
    flex:1; min-width:0; overflow-x:auto; white-space:nowrap;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:13.5px; color:var(--text);
  }
  .codeline code::-webkit-scrollbar{ height:0; }
  .codeline .p{ color:var(--accent); user-select:none; margin-right:8px; font-weight:600; }
  .codeline .url{ color:var(--accent); }
  .codeline .mut{ color:var(--mute); }
  .copy{
    flex:none; display:inline-grid; place-items:center; width:34px; height:34px; cursor:pointer;
    color:var(--dim); border:1px solid var(--border); background:var(--surface); border-radius:9px;
    transition:color .16s ease, border-color .16s ease, transform .1s ease;
  }
  .copy svg{ width:15px; height:15px; display:block; }
  @media (hover:hover) and (pointer:fine){ .copy:hover{ color:var(--text); border-color:var(--accent); } }
  .copy:active{ transform:scale(.94); }
  .copy.ok{ color:#00B894; border-color:rgba(0,184,148,.5); }
  .copy .check{ display:none; }
  .copy.ok .ic{ display:none; }
  .copy.ok .check{ display:block; }

  .btn{
    display:inline-flex; align-items:center; justify-content:center; gap:9px; width:100%; cursor:pointer;
    font-weight:600; font-size:15px; color:var(--on-primary);
    background:var(--primary); padding:14px 22px; border-radius:12px; border:1px solid transparent;
    box-shadow:0 10px 28px -10px rgba(108,92,231,.6);
    transition:background .18s ease, transform .12s ease, box-shadow .18s ease;
  }
  .btn svg{ width:16px; height:16px; display:block; }
  @media (hover:hover) and (pointer:fine){
    .btn:hover{ background:var(--primary-hover); transform:translateY(-1px); box-shadow:0 16px 36px -12px rgba(108,92,231,.7); }
  }
  .btn:active{ transform:scale(.985); }

  .foot{ position:relative; z-index:1; display:flex; align-items:center; justify-content:center;
    gap:12px; padding:28px 20px 30px; color:var(--mute); font-size:13px; flex-wrap:wrap; }
  .foot a{ color:var(--dim); transition:color .16s ease; }
  @media (hover:hover) and (pointer:fine){ .foot a:hover{ color:var(--accent); } }
  .foot .sep{ opacity:.5; }

  :focus-visible{ outline:2px solid var(--ring); outline-offset:2px; border-radius:8px; }

  .has-js .reveal{ opacity:0; transform:translateY(16px); }
  @media (prefers-reduced-motion: reduce){ .has-js .reveal{ opacity:1; transform:none; } }
  @media (max-width:560px){ .card-top, .card-desc, .feats, .note, .action{ padding-left:18px; padding-right:18px; } }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<div class="bg" aria-hidden="true">
  <div class="glow"></div>
  <div class="grid"></div>
</div>

<header class="nav reveal">
  <a class="brand" href="https://github.com/${REPO}" aria-label="Flow CMS on GitHub">
    <svg class="mark" width="34" height="34" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" rx="30" fill="#6C5CE7"/>
      <rect x="28" y="40" width="64" height="14" rx="7" fill="#fff"/>
      <rect x="28" y="62" width="46" height="14" rx="7" fill="#fff" fill-opacity=".6"/>
      <rect x="28" y="84" width="28" height="14" rx="7" fill="#fff" fill-opacity=".35"/>
    </svg>
    <span class="word">flow<span class="accent">cms</span></span>
  </a>
  <div class="nav-actions">
    <a class="ghost" href="https://github.com/${REPO}" rel="noopener">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      <span>GitHub</span>
    </a>
    <button class="iconbtn" id="themeToggle" type="button" aria-label="Switch color theme" title="Switch theme">
      <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
      <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    </button>
  </div>
</header>

<main id="main" class="wrap">
  <div class="hero">
    <span class="badge reveal"><span class="dot"></span>Open source, self-hostable</span>
    <h1 class="reveal">Run Flow CMS your way.</h1>
    <p class="sub reveal">An open source, AI-powered headless CMS. Choose the setup that fits you: fully managed on Railway, or self-hosted on your own server.</p>
  </div>

  <div class="paths">
    <!-- Path 1: managed on Railway (recommended for newcomers) -->
    <section class="card feature reveal" aria-label="Deploy on Railway">
      <div class="spot" aria-hidden="true"></div>
      <div class="card-top">
        <span class="card-ic">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.113 10.27A13.026 13.026 0 000 11.48h18.23c-.064-.125-.15-.237-.235-.347-3.117-4.027-4.793-3.677-7.19-3.78-.8-.034-1.34-.048-4.524-.048-1.704 0-3.555.005-5.358.01-.234.63-.459 1.24-.567 1.737h9.342v1.216H.113v.002zm18.26 2.426H.009c.02.326.05.645.094.961h16.955c.754 0 1.179-.429 1.315-.96zm-17.318 4.28s2.81 6.902 10.93 7.024c4.855 0 9.027-2.883 10.92-7.024H1.056zM11.988 0C7.5 0 3.593 2.466 1.531 6.108l4.75-.005v-.002c3.71 0 3.849.016 4.573.047l.448.016c1.563.052 3.485.22 4.996 1.364.82.621 2.007 1.99 2.712 2.965.654.902.842 1.94.396 2.934-.408.914-1.289 1.458-2.353 1.458H.391s.099.42.249.886h22.748A12.026 12.026 0 0024 12.005C24 5.377 18.621 0 11.988 0z"/></svg>
        </span>
        <div class="card-h">
          <h2 class="card-title">Deploy on Railway</h2>
          <span class="tag">Easiest, fully managed</span>
        </div>
        <span class="rec">Recommended</span>
      </div>
      <p class="card-desc">Railway is a cloud platform that runs your app and database for you. No server to set up, no Linux to learn, no maintenance.</p>
      <ul class="feats">
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Postgres database provisioned automatically</span></li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>HTTPS, secrets, and scaling handled for you</span></li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Free trial credits, live in about two minutes</span></li>
      </ul>
      <div class="action">
        <a class="btn" href="${RAILWAY_TEMPLATE_URL}" rel="noopener">
          Deploy on Railway
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
        </a>
      </div>
    </section>

    <!-- Path 2: self-host on your own server -->
    <section class="card reveal" aria-label="Self-host on your own server">
      <div class="spot" aria-hidden="true"></div>
      <div class="card-top">
        <span class="card-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>
        </span>
        <div class="card-h">
          <h2 class="card-title">Self-host</h2>
          <span class="tag">Free, full control</span>
        </div>
      </div>
      <p class="card-desc">Run Flow CMS on your own Linux server with one command. You own the box and every byte of your data.</p>
      <ul class="feats">
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Installs Docker and a free HTTPS certificate</span></li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Runs on any fresh Linux server (a small VPS works)</span></li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>You point a domain at it; the script does the rest</span></li>
      </ul>
      <div class="action">
        <div class="codeline">
          <code><span class="p">$</span>curl -fsSL <span class="url">https://get.flowcms.co</span> <span class="mut">| bash</span></code>
          <button class="copy" id="copyBtn" type="button" aria-label="Copy install command">
            <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
        <p class="note">Need the longer guide first? Read the <a href="https://github.com/${REPO}/blob/main/docs/DEPLOY.md" rel="noopener">deploy docs</a>.</p>
      </div>
    </section>
  </div>
</main>

<footer class="foot reveal">
  <a href="https://github.com/${REPO}" rel="noopener">View on GitHub</a>
  <span class="sep" aria-hidden="true">&middot;</span>
  <a href="https://github.com/${REPO}/blob/main/docs/DEPLOY.md" rel="noopener">Deploy guide</a>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" onerror="document.documentElement.classList.remove('has-js')"></script>
<script>
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!window.gsap;

  function effective(){
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncMode(){ root.setAttribute('data-mode', effective()); }

  var toggle = document.getElementById('themeToggle');
  if (toggle) toggle.addEventListener('click', function () {
    var next = effective() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('flowcms-theme', next); } catch (e) {}
    syncMode();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!root.getAttribute('data-theme')) syncMode();
  });

  var copyBtn = document.getElementById('copyBtn');
  var CMD = 'curl -fsSL https://get.flowcms.co | bash';
  var ct;
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var done = function () {
      copyBtn.classList.add('ok');
      copyBtn.setAttribute('aria-label', 'Copied to clipboard');
      clearTimeout(ct);
      ct = setTimeout(function () {
        copyBtn.classList.remove('ok');
        copyBtn.setAttribute('aria-label', 'Copy install command');
      }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(CMD).then(done).catch(done);
    } else { done(); }
  });

  function showAll(){ root.classList.remove('has-js'); }
  if (!hasGsap || reduce) { showAll(); syncMode(); return; }

  try {
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.set('.reveal', { opacity: 0, y: 16 });
    tl.to('.reveal', { opacity: 1, y: 0, duration: 0.8, stagger: 0.07 });

    var glow = document.querySelector('.glow');
    if (glow) gsap.to(glow, { opacity: '+=0.08', scale: 1.08, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      var cards = document.querySelectorAll('.card');
      cards.forEach(function (card) {
        var spot = card.querySelector('.spot');
        if (!spot) return;
        var qx = gsap.quickTo(spot, 'x', { duration: 0.5, ease: 'power3' });
        var qy = gsap.quickTo(spot, 'y', { duration: 0.5, ease: 'power3' });
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          qx(e.clientX - r.left); qy(e.clientY - r.top);
          gsap.to(spot, { opacity: 1, duration: 0.3 });
        });
        card.addEventListener('pointerleave', function () {
          gsap.to(spot, { opacity: 0, duration: 0.5 });
        });
      });
    }
  } catch (err) { showAll(); }
  syncMode();
})();
</script>
</body>
</html>`;
}
