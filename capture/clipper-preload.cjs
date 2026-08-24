/**
 * The clipper's bridge.
 *
 * ⚠️ A preload rather than nodeIntegration, because the page it belongs to is
 * loaded from a CUSTOM SCHEME — see clips.ts — and whether node integration
 * applies to a non-file origin is not something worth depending on. A preload
 * runs with node access whatever the page's origin is.
 *
 * ⚠️ .cjs, and it must stay .cjs. This package is `"type": "module"`, so a
 * preload named .js is loaded as an ES module and `require` is simply not
 * defined in it — which fails at the first line, leaves window.__ipc undefined,
 * and surfaces thirty seconds later as "the clipper did not start".
 */
const { ipcRenderer } = require("electron")
window.__ipc = ipcRenderer
