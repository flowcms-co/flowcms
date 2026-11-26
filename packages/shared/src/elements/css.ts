/** Theme variables, one place. Slice 3 stores a per-workspace override and builds this from it. */
export const DEFAULT_THEME_CSS = `:root{--el-accent:#6C5CE7;--el-accent-hover:#5A4BD4;--el-text:#1A1A2E;--el-muted:#6A6A85;--el-border:#ECEAF5;--el-panel:#F5F3FF;--el-surface:#FFFFFF;--el-rule:#D4D4D8;--el-radius:12px;--el-font:inherit}`;

/** Base styles for every element: layout only, all colour comes from the --el-* variables. */
export const BASE_CSS = `.flow-el{container-type:inline-size;min-width:0;max-width:100%;margin:1.5rem 0;font-family:var(--el-font);color:var(--el-text);line-height:1.4;overflow-wrap:anywhere}
.flow-el *{box-sizing:border-box}
.flow-el .el-title{margin:0;font-family:var(--el-font);font-size:1.5rem;font-weight:800;line-height:1.2;color:var(--el-text)}
.flow-el .el-steps-card{padding:24px;border:1px solid var(--el-border);border-radius:var(--el-radius);background:var(--el-surface);box-shadow:0 1px 2px rgba(0,0,0,.05)}
.flow-el .el-steps-card .el-title{font-size:1.25rem;margin-bottom:24px}
.flow-el ol.el-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:24px}
.flow-el .el-steps li{position:relative;display:flex;gap:16px;flex:1;margin:0;padding:0}
.flow-el .el-n{position:relative;z-index:1;flex:none;width:40px;height:40px;border-radius:50%;background:var(--el-accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:1rem}
.flow-el .el-steps li:not(:last-child):after{content:"";position:absolute;background:color-mix(in srgb,var(--el-accent) 30%,transparent);left:19px;top:44px;width:2px;height:calc(100% - 20px)}
.flow-el .el-steps .l{font-weight:700;color:var(--el-text)}
.flow-el .el-steps .tm{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--el-accent)}
.flow-el .el-steps .el-tx{margin-top:4px;font-size:.875rem;color:var(--el-muted)}
@container (min-width:560px){
.flow-el ol.el-steps.h{flex-direction:row;gap:16px}
.flow-el .el-steps.h li{flex-direction:column;gap:12px}
.flow-el .el-steps.h li:not(:last-child):after{left:48px;top:19px;width:calc(100% - 32px + 16px - 8px);height:2px}
}
@container (max-width:399px){.flow-el .el-steps-card{padding:16px}.flow-el .el-title{font-size:1.25rem}}
@media (prefers-reduced-motion:reduce){.flow-el,.flow-el *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

/** What GET /api/public/elements.css serves, and what the Studio preview loads. */
export const elementsCss = (themeCss: string = DEFAULT_THEME_CSS): string => `${themeCss}\n${BASE_CSS}\n`;
