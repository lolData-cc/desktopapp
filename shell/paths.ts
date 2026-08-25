/**
 * Where the shell's own files are, resolved at RUNTIME.
 *
 * ⚠️ This module exists because a bare `__dirname` does not survive bundling.
 * There is no `__dirname` in an ES module, so when shell/*.ts referenced one,
 * bun supplied it — as a STRING LITERAL of the directory the bundle was built
 * in. `shell/main.mjs` shipped with
 *
 *     var __dirname = "C:\\Users\\...\\loldata-desktop\\shell"
 *
 * baked into it. It worked on the machine that built it, and only there. A
 * release built by CI carries the runner's path, which exists on no user's
 * computer, so every file loaded relative to it silently failed to load:
 * the overlay, the recorder, the clipper and the splash screen.
 *
 * It was invisible for two reasons. shell/main.ts declares its own `__dirname`
 * from `import.meta.url`, which bundles correctly, so the main window always
 * loaded and the app looked fine. And a developer's own build bakes their own
 * path, so it works perfectly in exactly the place anyone would test it.
 *
 * `import.meta.url` is evaluated when the module runs, not when it is built,
 * which is the whole point — do not replace it with anything that can be
 * constant-folded.
 */
import { app } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** The directory holding main.mjs / preload.mjs, wherever it ended up. */
export const SHELL_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * The packaged app's root — the folder containing dist/, capture/ and build/.
 *
 * Inside an asar this is a virtual path, which Electron's own fs shims read
 * transparently. That is why `readFile` on capture/*.html keeps working
 * packaged, and why nothing here needs an `app.isPackaged` branch.
 */
export const APP_ROOT = app.getAppPath()

/** A file in the built renderer output. */
export const distFile = (...p: string[]) => join(APP_ROOT, "dist", ...p)

/** One of the hidden worker pages — the recorder, the clipper. */
export const captureFile = (name: string) => join(APP_ROOT, "capture", name)

/** Icons, the splash page: things authored by hand rather than built. */
export const buildFile = (name: string) => join(APP_ROOT, "build", name)

/** A sibling of main.mjs, i.e. preload.mjs. */
export const shellFile = (name: string) => join(SHELL_DIR, name)
