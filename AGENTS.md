# Flow CMS — agent guidelines

## UI rules

- **Never use native browser dialogs** — `window.alert`, `window.confirm` and
  `window.prompt` are banned everywhere in the studio, for all current and
  future code. Confirmations go through the app-wide ConfirmProvider
  (`confirm({...})`); alert-style messages use its `notice({...})` single-button
  mode. Both render the on-brand modal. The provider deliberately has no native
  fallback: an unmounted provider fails safe with "no" instead of showing a
  browser dialog.
