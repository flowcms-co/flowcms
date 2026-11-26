import { DEFAULT_THEME, themeCss } from "./theme";

/** The default theme as CSS. A workspace theme replaces it through `themeCss`. */
export const DEFAULT_THEME_CSS = themeCss(DEFAULT_THEME);

/** Base styles for every element: layout only, all colour comes from the --el-* variables. */
export const BASE_CSS = `.flow-el{container-type:inline-size;min-width:0;max-width:100%;margin:1.5rem 0;font-family:var(--el-font);color:var(--el-text);line-height:1.4;overflow-wrap:anywhere}
.flow-el *{box-sizing:border-box}
.flow-el .el-title{margin:0;font-family:var(--el-font);font-size:1.5em;font-weight:800;line-height:1.2;color:var(--el-text)}
.flow-el .el-steps-card{padding:24px;border:1px solid var(--el-border);border-radius:var(--el-radius);background:var(--el-surface);box-shadow:0 1px 2px rgba(0,0,0,.05)}
.flow-el .el-steps-card .el-title{font-size:1.25em;margin-bottom:24px}
.flow-el ol.el-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:24px}
.flow-el .el-steps li{position:relative;display:flex;gap:16px;flex:1;margin:0;padding:0}
.flow-el .el-n{position:relative;z-index:1;flex:none;width:40px;height:40px;border-radius:50%;background:var(--el-accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:1em}
.flow-el .el-steps li:not(:last-child):after{content:"";position:absolute;background:color-mix(in srgb,var(--el-accent) 30%,transparent);left:19px;top:44px;width:2px;height:calc(100% - 20px)}
.flow-el .el-steps .l{font-weight:700;color:var(--el-text)}
.flow-el .el-steps .tm{font-size:.75em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--el-accent)}
.flow-el .el-steps .el-tx{margin-top:4px;font-size:.875em;color:var(--el-muted)}
.flow-el .el-card{border:1px solid var(--el-border);border-radius:var(--el-radius);background:var(--el-surface);box-shadow:0 1px 2px rgba(0,0,0,.05);overflow:hidden}
.flow-el .el-cap{margin:0;font-size:.75em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--el-muted)}
.flow-el .el-head{background:var(--el-panel);padding:20px 24px}
.flow-el .el-head:empty{display:none}
.flow-el .el-loc{margin:4px 0 0;font-size:.875em;color:var(--el-muted)}
.flow-el .el-grid{display:grid}
.flow-el .el-main{padding:20px 24px}
.flow-el .el-big{margin:8px 0 0;font-size:clamp(1.25em,8.5cqi,2.4em);font-weight:800;line-height:1.1;color:var(--el-accent)}
.flow-el .el-det{margin-top:12px;font-size:.875em;color:var(--el-muted)}
.flow-el .el-det summary{cursor:pointer;text-decoration:underline;display:flex;align-items:center;min-height:44px}
.flow-el .el-det summary:hover{color:var(--el-accent-hover)}
.flow-el .el-det p{margin:8px 0 0}
.flow-el .el-side{display:grid;gap:16px;padding:20px 24px;border-top:1px solid var(--el-border);align-content:start;grid-template-columns:repeat(3,minmax(0,1fr))}
.flow-el .el-side b{display:block;font-size:1.25em;font-weight:700;color:var(--el-text)}
.flow-el .el-bar{padding:8px 24px 32px}
.flow-el .el-track{position:relative;height:8px;border-radius:999px;background:var(--el-border)}
.flow-el .el-fill{position:absolute;top:0;bottom:0;left:var(--p-low,0%);width:calc(var(--p-high,100%) - var(--p-low,0%));border-radius:999px;background:var(--el-accent)}
.flow-el .el-dot{position:absolute;top:50%;left:var(--p-avg,50%);width:16px;height:16px;transform:translate(-50%,-50%);border-radius:50%;border:3px solid var(--el-accent);background:var(--el-surface)}
.flow-el .el-avg{position:absolute;top:16px;left:var(--p-avg,50%);transform:translateX(-50%);font-size:.75em;font-weight:700;white-space:nowrap}
.flow-el .el-lh{margin-top:32px;display:flex;justify-content:space-between}
.flow-el .el-tw{overflow-x:auto;border:1px solid var(--el-border);border-radius:calc(var(--el-radius) * .75);background:var(--el-surface)}
.flow-el .el-table{width:100%;margin:0;border-collapse:collapse;text-align:left;font-size:1em}
.flow-el .el-table caption{padding:12px 20px;text-align:left;color:var(--el-muted)}
.flow-el .el-table th,.flow-el .el-table td{padding:14px 20px;text-align:left;vertical-align:top;border:0}
.flow-el .el-table th{background:var(--el-surface);font-weight:700;border-bottom:2px solid var(--el-rule)}
.flow-el .el-table tbody tr:nth-child(odd) td{background:var(--el-surface)}
.flow-el .el-table tbody tr:nth-child(even) td{background:var(--el-panel)}
.flow-el .el-calc .el-card{padding:24px}
.flow-el .el-calc .el-title{font-size:1.25em;margin-bottom:20px}
.flow-el .el-cf{display:grid;gap:16px}
.flow-el .el-cf label{display:block;font-size:.875em;font-weight:600;color:var(--el-text)}
.flow-el .el-cf input,.flow-el .el-cf select{min-height:44px;transition:border-color .15s,box-shadow .15s;margin-top:4px;width:100%;border:1px solid var(--el-border);border-radius:calc(var(--el-radius) * .6);background:var(--el-surface);padding:10px 12px;font:inherit;font-size:calc(1em / .875);color:var(--el-text);outline:0}
.flow-el .el-cf input:focus,.flow-el .el-cf select:focus{border-color:var(--el-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--el-accent) 30%,transparent)}
.flow-el .el-res{margin-top:20px;border-radius:calc(var(--el-radius) * .75);background:var(--el-panel);padding:20px}
.flow-el .el-res .v{font-size:2em;font-weight:800;line-height:1.2;color:var(--el-accent)}
.flow-el .el-res .el-note{margin:4px 0 0;font-size:.875em;color:var(--el-muted)}
.flow-el .el-intro{margin:-12px 0 20px;color:var(--el-muted)}
.flow-el [hidden]{display:none!important}
.flow-el .el-un{font-weight:400;color:var(--el-muted)}
.flow-el .el-lb{display:block;font-size:.875em;font-weight:600;color:var(--el-text)}
.flow-el .el-opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.flow-el .el-opts button{min-height:44px;padding:8px 16px;border:1px solid var(--el-border);border-radius:calc(var(--el-radius) * .6);background:var(--el-surface);font:inherit;font-size:.875em;font-weight:600;color:var(--el-text);cursor:pointer}
.flow-el .el-opts button[aria-pressed="true"]{border-color:var(--el-accent);background:color-mix(in srgb,var(--el-accent) 12%,transparent);color:var(--el-accent)}
.flow-el .el-cf .el-chk{display:flex;align-items:center;gap:8px;min-height:44px}
.flow-el .el-cf .el-chk input{width:auto;min-height:0;margin:0}
.flow-el .el-bd{width:100%;margin:8px 0 0;border-collapse:collapse;font-size:.875em}
.flow-el .el-bd td{padding:6px 0;border-bottom:1px solid var(--el-border);vertical-align:top}
.flow-el .el-bd td:last-child{text-align:right;white-space:nowrap;padding-left:12px}
.flow-el .el-res .el-adv{font-weight:600;color:var(--el-text)}
.flow-el .el-fine{margin:12px 0 0;font-size:.75em;color:var(--el-muted)}
@container (min-width:420px){.flow-el .el-cf{grid-template-columns:1fr 1fr}.flow-el .el-cf .full{grid-column:1/-1}}
@container (min-width:520px){.flow-el .el-grid{grid-template-columns:minmax(0,1fr) 11em}.flow-el .el-side{grid-template-columns:1fr;border-top:0;border-left:1px solid var(--el-border)}.flow-el .el-big{font-size:clamp(1.25em,5.2cqi,2.4em)}}
@container (max-width:359px){.flow-el .el-side{grid-template-columns:1fr}}
@container (max-width:419px){
.flow-el .el-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.flow-el .el-table,.flow-el .el-table tbody,.flow-el .el-table tr,.flow-el .el-table td,.flow-el .el-table caption{display:block;width:100%}
.flow-el .el-table tr{border-bottom:1px solid var(--el-border);padding:6px 0}
.flow-el .el-table td{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;text-align:right}
.flow-el .el-table td:before{content:attr(data-label);font-weight:700;text-align:left;color:var(--el-muted);flex:none;max-width:45%}
}
@container (min-width:560px){
.flow-el ol.el-steps.h{flex-direction:row;gap:16px}
.flow-el .el-steps.h li{flex-direction:column;gap:12px}
.flow-el .el-steps.h li:not(:last-child):after{left:48px;top:19px;width:calc(100% - 32px + 16px - 8px);height:2px}
}
@container (max-width:399px){.flow-el .el-head,.flow-el .el-main,.flow-el .el-side{padding:16px}.flow-el .el-bar{padding:8px 16px 28px}.flow-el .el-steps-card,.flow-el .el-calc .el-card{padding:16px}.flow-el .el-title{font-size:1.25em}}
@media (prefers-reduced-motion:reduce){.flow-el,.flow-el *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

/** What GET /api/public/elements.css serves, and what the Studio preview loads. */
export const elementsCss = (themeCss: string = DEFAULT_THEME_CSS): string => `${themeCss}\n${BASE_CSS}\n`;
