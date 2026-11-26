import { DEFAULT_THEME, themeCss } from "./theme";

/** The default theme as CSS. A workspace theme replaces it through `themeCss`. */
export const DEFAULT_THEME_CSS = themeCss(DEFAULT_THEME);

/** Layout every style shares: the element shell, steps, cost and table. All colour comes from the --el-* variables. */
const HEAD = `.flow-el{container-type:inline-size;min-width:0;max-width:100%;margin:1.5rem 0;font-family:var(--el-font);color:var(--el-text);line-height:1.4;overflow-wrap:anywhere}
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
`;

/** The calculator controls as shipped in v2.3.2 (the Classic style). */
const CALC_CLASSIC = `.flow-el .el-calc .el-card{padding:24px}
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
`;

/** The modern calculator controls: lighter outlines and a custom dropdown. */
const CALC_MODERN = `.flow-el .el-calc{--bd:color-mix(in srgb,var(--el-border) 75%,var(--el-surface));--bd-h:color-mix(in srgb,var(--el-border) 70%,var(--el-text));--ac-bd:color-mix(in srgb,var(--el-accent) 38%,var(--el-surface));--ac-tx:color-mix(in srgb,var(--el-accent) 70%,var(--el-text));--ring:0 0 0 3px color-mix(in srgb,var(--el-accent) 16%,transparent)}
.flow-el .el-calc .el-card{padding:24px;overflow:visible}
.flow-el .el-calc .el-title{font-size:1.25em;margin-bottom:20px}
.flow-el .el-cf{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.flow-el .el-cf label{display:block;position:relative;font-size:.875em;font-weight:600;color:var(--el-text)}
.flow-el .el-cf input:not([type=checkbox]),.flow-el .el-cf select{display:block;min-height:48px;margin-top:6px;width:100%;border:1px solid var(--bd);border-radius:calc(var(--el-radius) * .75);background:var(--el-surface);padding:10px 14px;font:inherit;font-size:calc(1em / .875);font-weight:500;color:var(--el-text);outline:0;transition:border-color .15s,box-shadow .15s,background-color .15s}
.flow-el .el-cf input:not([type=checkbox]):hover,.flow-el .el-cf select:hover{border-color:var(--bd-h)}
.flow-el .el-cf input:not([type=checkbox]):focus-visible,.flow-el .el-cf select:focus-visible{border-color:var(--ac-bd);box-shadow:var(--ring)}
.flow-el .el-cf select{appearance:none;-webkit-appearance:none;padding-right:44px;cursor:pointer;text-overflow:ellipsis}
.flow-el .el-cf select:disabled,.flow-el .el-cf input:disabled{cursor:not-allowed;opacity:.55;background:var(--el-panel)}
.flow-el .el-cf [data-t=s] label:after{content:"";position:absolute;right:16px;bottom:16px;width:16px;height:16px;pointer-events:none;background:var(--el-muted);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 6l4.5 4.5L12.5 6'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 6l4.5 4.5L12.5 6'/%3E%3C/svg%3E") center/contain no-repeat}
.flow-el .el-cf [data-t=s].el-js label:after{display:none}
.flow-el .el-cf [data-t=s].el-js select{position:absolute;width:1px;height:1px;min-height:0;margin:0;padding:0;border:0;opacity:0;pointer-events:none;overflow:hidden}
.flow-el .el-dd{position:relative;margin-top:6px}
.flow-el .el-dd-b{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:48px;padding:8px 14px 8px 18px;border:1px solid var(--ac-bd);border-radius:999px;background:color-mix(in srgb,var(--el-accent) 8%,var(--el-surface));font:inherit;font-size:calc(1em / .875);font-weight:500;line-height:1.3;text-align:left;color:var(--ac-tx);cursor:pointer;transition:border-color .15s,box-shadow .15s,background-color .15s}
.flow-el .el-dd-b:hover{background:color-mix(in srgb,var(--el-accent) 12%,var(--el-surface))}
.flow-el .el-dd-b:focus-visible{outline:0;box-shadow:var(--ring)}
.flow-el .el-dd-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flow-el .el-dd-b:after,.flow-el .el-dd-opt:after{content:"";flex:none;width:16px;height:16px;background:currentColor;-webkit-mask:var(--ic) center/contain no-repeat;mask:var(--ic) center/contain no-repeat}
.flow-el .el-dd-b:after{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 6l4.5 4.5L12.5 6'/%3E%3C/svg%3E");transition:transform .2s}
.flow-el .el-dd-b[aria-expanded=true]:after{transform:rotate(180deg)}
.flow-el .el-dd-l{position:absolute;z-index:30;top:calc(100% + 6px);left:0;min-width:100%;width:max-content;max-width:min(32em,calc(100cqi - 32px));margin:0;padding:6px;border:1px solid var(--bd);border-radius:calc(var(--el-radius) * 1.1);background:var(--el-surface);box-shadow:0 12px 32px color-mix(in srgb,var(--el-text) 14%,transparent),0 2px 6px color-mix(in srgb,var(--el-text) 6%,transparent);max-height:18em;overflow-y:auto;list-style:none}
.flow-el .el-dd-opt{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:8px 12px;border-radius:calc(var(--el-radius) * .6);font-size:calc(1em / .875 * .9375);font-weight:400;color:var(--el-text);cursor:pointer;transition:background-color .1s}
.flow-el .el-dd-opt:after{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 8.5l3.2 3.2L13 4.8'/%3E%3C/svg%3E");color:var(--el-accent);opacity:0}
.flow-el .el-dd-opt[aria-selected=true]{font-weight:700;color:var(--ac-tx);background:color-mix(in srgb,var(--el-accent) 8%,var(--el-surface))}
.flow-el .el-dd-opt[aria-selected=true]:after{opacity:1}
.flow-el .el-dd-opt:hover,.flow-el .el-dd-opt.act{background:color-mix(in srgb,var(--el-accent) 6%,var(--el-surface))}
.flow-el .el-dd-opt[aria-selected=true]:hover,.flow-el .el-dd-opt[aria-selected=true].act{background:color-mix(in srgb,var(--el-accent) 12%,var(--el-surface))}
.flow-el .el-cf input[type=number]{appearance:textfield;-moz-appearance:textfield}
.flow-el .el-cf input[type=number]::-webkit-outer-spin-button,.flow-el .el-cf input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.flow-el .el-res{margin-top:24px;border:1px solid var(--bd);border-radius:var(--el-radius);background:var(--el-panel);padding:20px 24px}
.flow-el .el-res .v{margin-top:6px;font-size:clamp(1.75em,9cqi,2.5em);font-weight:800;line-height:1.1;letter-spacing:-.01em;color:var(--el-accent)}
.flow-el .el-res .el-note{margin:8px 0 0;font-size:.875em;line-height:1.5;color:var(--el-muted)}
.flow-el .el-res .v+.el-note{margin-top:12px}
.flow-el .el-intro{margin:-12px 0 20px;color:var(--el-muted)}
.flow-el [hidden]{display:none!important}
.flow-el .el-un{font-weight:400;color:var(--el-muted)}
.flow-el .el-lb{display:block;font-size:.875em;font-weight:600;color:var(--el-text)}
.flow-el .el-opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.flow-el .el-opts button{min-height:44px;max-width:100%;padding:8px 18px;border:1px solid var(--bd);border-radius:calc(var(--el-radius) * .75);background:var(--el-surface);font:inherit;font-size:.875em;font-weight:600;line-height:1.3;color:var(--el-text);cursor:pointer;transition:border-color .15s,background-color .15s,color .15s,box-shadow .15s}
.flow-el .el-opts button:hover{border-color:var(--ac-bd);background:color-mix(in srgb,var(--el-accent) 4%,var(--el-surface))}
.flow-el .el-opts button[aria-pressed="true"]{border-color:var(--ac-bd);background:color-mix(in srgb,var(--el-accent) 9%,var(--el-surface));color:var(--ac-tx)}
.flow-el .el-opts button:focus-visible,.flow-el .el-cf input[type=checkbox]:focus-visible{outline:0;box-shadow:var(--ring)}
.flow-el .el-cf .el-chk{display:flex;align-items:center;gap:12px;min-height:48px;padding:10px 14px;border:1px solid var(--bd);border-radius:calc(var(--el-radius) * .75);background:var(--el-surface);font-weight:500;line-height:1.35;cursor:pointer;transition:border-color .15s,background-color .15s}
.flow-el .el-cf .el-chk:hover{border-color:var(--ac-bd);background:color-mix(in srgb,var(--el-accent) 4%,var(--el-surface))}
.flow-el .el-cf .el-chk:has(input:checked){border-color:var(--ac-bd);background:color-mix(in srgb,var(--el-accent) 7%,var(--el-surface))}
.flow-el .el-cf .el-chk:has(input:focus-visible){box-shadow:var(--ring)}
.flow-el .el-cf .el-chk input{appearance:none;-webkit-appearance:none;flex:none;display:grid;place-content:center;width:22px;height:22px;min-height:0;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--el-text) 40%,var(--el-surface));border-radius:calc(var(--el-radius) * .4);background:var(--el-surface) center/14px no-repeat;box-shadow:none;cursor:pointer;transition:border-color .15s,background-color .15s}
.flow-el .el-cf .el-chk input:focus-visible{box-shadow:none}
.flow-el .el-cf .el-chk input:checked{border-color:var(--el-accent);background-color:var(--el-accent);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 7.5l3 3 6-6.5'/%3E%3C/svg%3E")}
.flow-el .el-cf .el-chk input:disabled{opacity:.5;cursor:not-allowed}
.flow-el .el-res .el-adv{padding:8px 12px;border-left:2px solid var(--ac-bd);border-radius:0 calc(var(--el-radius) * .4) calc(var(--el-radius) * .4) 0;background:color-mix(in srgb,var(--el-accent) 6%,transparent);font-weight:600;color:var(--el-text)}
.flow-el .el-res .el-det{margin-top:16px;padding-top:4px;border-top:1px solid var(--bd);font-size:.875em;color:var(--el-muted)}
.flow-el .el-res .el-det summary{display:flex;align-items:center;gap:8px;min-height:44px;list-style:none;text-decoration:none;font-weight:600;color:var(--el-text);cursor:pointer}
.flow-el .el-res .el-det summary::-webkit-details-marker{display:none}
.flow-el .el-res .el-det summary:before{content:"";flex:none;width:16px;height:16px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3.5l4.5 4.5L6 12.5'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3.5l4.5 4.5L6 12.5'/%3E%3C/svg%3E") center/contain no-repeat;transition:transform .15s}
.flow-el .el-res .el-det[open] summary:before{transform:rotate(90deg)}
.flow-el .el-res .el-det summary:hover{color:var(--el-accent-hover)}
.flow-el .el-res .el-det summary:focus-visible{outline:0;box-shadow:var(--ring);border-radius:4px}
.flow-el .el-bd{width:100%;margin:4px 0 0;border-collapse:collapse;font-size:1em}
.flow-el .el-bd td{padding:10px 0;border-bottom:1px solid var(--bd);vertical-align:top;color:var(--el-text)}
.flow-el .el-bd tr:last-child td{border-bottom:0}
.flow-el .el-bd td:last-child{text-align:right;white-space:nowrap;padding-left:16px;font-weight:600}
.flow-el .el-fine{margin:14px 0 0;font-size:.75em;color:var(--el-muted)}
@container (max-width:419px){.flow-el .el-dd-l{right:0;width:auto;max-width:none}}
@container (min-width:420px){.flow-el .el-cf{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-el .el-cf .full{grid-column:1/-1}}
`;

/** The wide and narrow container queries, then reduced motion. */
const TAIL = `@container (min-width:520px){.flow-el .el-grid{grid-template-columns:minmax(0,1fr) 11em}.flow-el .el-side{grid-template-columns:1fr;border-top:0;border-left:1px solid var(--el-border)}.flow-el .el-big{font-size:clamp(1.25em,5.2cqi,2.4em)}}
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

/** The Classic style: byte for byte the v2.3.2 sheet. */
export const CLASSIC_CSS = HEAD + CALC_CLASSIC + TAIL;

/** Modern cost, steps and table. */
const MODERN_ELEMENTS = `.flow-el{--bd:color-mix(in srgb,var(--el-border) 75%,var(--el-surface));--ac-bd:color-mix(in srgb,var(--el-accent) 38%,var(--el-surface));--ac-tx:color-mix(in srgb,var(--el-accent) 70%,var(--el-text));--ring:0 0 0 3px color-mix(in srgb,var(--el-accent) 16%,transparent)}
.flow-el--cost .el-card{border-color:var(--bd);box-shadow:none}
.flow-el--cost .el-head{padding:20px 24px;border-bottom:1px solid var(--bd)}
.flow-el--cost .el-title{font-size:1.25em}
.flow-el--cost .el-cap{letter-spacing:.06em}
.flow-el--cost .el-big{margin-top:6px;font-size:clamp(1.75em,9cqi,2.5em);line-height:1.1;letter-spacing:-.01em}
.flow-el--cost .el-side{border-color:var(--bd)}
.flow-el--cost .el-side b{font-size:1.125em;font-weight:700;font-variant-numeric:tabular-nums}
.flow-el--cost .el-track{height:6px;background:color-mix(in srgb,var(--el-accent) 12%,var(--el-surface))}
.flow-el--cost .el-fill{background:color-mix(in srgb,var(--el-accent) 75%,var(--el-surface))}
.flow-el--cost .el-dot{width:14px;height:14px;border-width:2px}
.flow-el--cost .el-avg{color:var(--ac-tx);font-weight:600}
.flow-el--cost .el-det{margin-top:16px;padding-top:4px;border-top:1px solid var(--bd)}
.flow-el--cost .el-det summary{gap:8px;list-style:none;text-decoration:none;font-weight:600;color:var(--el-text)}
.flow-el--cost .el-det summary::-webkit-details-marker{display:none}
.flow-el--cost .el-det summary:before{content:"";flex:none;width:16px;height:16px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3.5l4.5 4.5L6 12.5'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3.5l4.5 4.5L6 12.5'/%3E%3C/svg%3E") center/contain no-repeat;transition:transform .15s}
.flow-el--cost .el-det[open] summary:before{transform:rotate(90deg)}
.flow-el--cost .el-det summary:focus-visible{outline:0;box-shadow:var(--ring);border-radius:4px}
.flow-el--cost .el-det p{line-height:1.5}
.flow-el--steps .el-steps-card{border-color:var(--bd);box-shadow:none}
.flow-el--steps .el-n{background:color-mix(in srgb,var(--el-accent) 10%,var(--el-surface));border:1px solid var(--ac-bd);color:var(--ac-tx);font-weight:600}
.flow-el--steps .el-steps li:not(:last-child):after{background:color-mix(in srgb,var(--el-accent) 22%,var(--el-surface));left:19.5px;width:1px}
.flow-el--steps .el-steps .l{font-weight:600}
.flow-el--steps .el-steps .tm{color:var(--ac-tx);font-weight:600}
.flow-el--steps .el-steps .el-tx{line-height:1.5}
.flow-el--table .el-tw{border-color:var(--bd);border-radius:var(--el-radius)}
.flow-el--table .el-table{font-variant-numeric:tabular-nums}
.flow-el--table .el-table th{background:color-mix(in srgb,var(--el-accent) 5%,var(--el-surface));padding:12px 20px;font-size:.8125em;font-weight:600;letter-spacing:.02em;color:var(--el-muted);border-bottom:1px solid var(--bd)}
.flow-el .el-table tbody tr:nth-child(odd) td,.flow-el .el-table tbody tr:nth-child(even) td{background:var(--el-surface)}
.flow-el .el-table td{padding:14px 20px;border-bottom:1px solid var(--bd)}
.flow-el .el-table tbody tr:last-child td{border-bottom:0}
.flow-el .el-table tbody tr:hover td{background:color-mix(in srgb,var(--el-accent) 4%,var(--el-surface))}
.flow-el--table .el-table caption{padding:14px 20px;font-weight:600;color:var(--el-text)}
`;

/** Modern table on narrow containers; after TAIL so it wins over the stacked rules. */
const MODERN_NARROW = `@container (max-width:419px){
.flow-el .el-table tr{border-bottom:1px solid var(--bd);padding:4px 0}
.flow-el .el-table tbody tr:last-child{border-bottom:0}
.flow-el .el-table td,.flow-el .el-table tbody tr:last-child td{border-bottom:0;padding:8px 20px}
.flow-el .el-table td:before{font-weight:600;font-size:.8125em}
}`;

/** The Modern style. */
export const MODERN_CSS = HEAD + CALC_MODERN + "\n" + MODERN_ELEMENTS + TAIL + "\n" + MODERN_NARROW;

/** Kept for existing imports: the current default style. */
export const BASE_CSS = MODERN_CSS;

/** Classic, after a live switch from Modern: hide a dropdown the script already added. */
const CLASSIC_EXTRA = ".flow-el .el-dd{display:none}";

/** What GET /api/public/elements.css serves, and what the Studio preview loads. */
export const elementsCss = (themeCss: string = DEFAULT_THEME_CSS): string =>
    /--el-style:classic/.test(themeCss) ? `${themeCss}\n${CLASSIC_CSS}\n${CLASSIC_EXTRA}\n` : `${themeCss}\n${MODERN_CSS}\n`;
