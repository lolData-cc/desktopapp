/**
 * The window you see while the app is starting.
 *
 * It exists because the main window is not worth showing half-built: it has a
 * client connection to make, a patch to look up and a session to restore, and
 * a frame that appears empty and then fills in reads as a stutter. So the main
 * window stays hidden and this stands in.
 *
 * Loaded from a single self-contained HTML file with the logo inlined — no
 * bundle, no font request, no disk read for an image. A splash that waits for
 * anything appears exactly when it is no longer needed.
 *
 * The window is transparent and stays that way: the page draws no panel, no
 * card and no shadow, because an opening animation with a background is a
 * rectangle floating on the desktop rather than a mark arriving. It is sized
 * generously for the same reason — the rings need room to pass THROUGH where a
 * container's edge would otherwise be.
 *
 * ⚠️ It is shown for a MINIMUM time as well as a maximum. If the app is ready
 * in 200ms the animation would be cut off mid-draw, which looks like a glitch
 * rather than a fast start — so a quick start still gets the full sequence, and
 * a slow one is never held hostage to it.
 */
import { BrowserWindow } from "electron"
import { buildFile } from "./paths"

/** Long enough for the sequence in splash.html to finish (~1.9s) plus its exit. */
const MIN_VISIBLE_MS = 2100
/** Past this we stop waiting: something is wrong and a stuck splash is worse
 *  than a main window that is not quite ready. */
const MAX_VISIBLE_MS = 6000

let splash: BrowserWindow | null = null
let shownAt = 0
let closing = false

export function createSplash(): BrowserWindow {
  splash = new BrowserWindow({
    width: 420,
    height: 340,
    // Transparent and frameless: the visible object is the panel drawn INSIDE
    // the page, so the window itself must contribute nothing.
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    center: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const file = buildFile("splash.html")
  splash.webContents.on("did-fail-load", (_e, code, desc) =>
    console.error("[splash] FAILED to load: %s %s", code, desc)
  )

  void splash.loadFile(file).catch((e) => console.error("[splash] loadFile threw:", e?.message))

  splash.once("ready-to-show", () => {
    shownAt = Date.now()
    splash?.showInactive()
  })
  splash.on("closed", () => { splash = null })

  return splash
}

/**
 * Close it, and reveal the main window at the same moment.
 *
 * The two are handed over together on purpose: closing the splash first leaves
 * a gap of empty desktop, and showing the main window first leaves two windows
 * stacked. Neither is long, and both are noticeable.
 */
export function dismissSplash(reveal: () => void): void {
  if (closing) return
  closing = true

  // Measured from when it was SHOWN, not from when the dismiss was asked: the
  // main window is regularly ready before the splash has appeared at all, and
  // counting from the request would cut the sequence short by however long the
  // splash took to arrive.
  const elapsed = shownAt ? Date.now() - shownAt : 0
  const wait = Math.max(0, Math.min(MIN_VISIBLE_MS - elapsed, MAX_VISIBLE_MS))

  setTimeout(() => {
    const done = () => {
      reveal()
      if (splash && !splash.isDestroyed()) splash.destroy()
      splash = null
    }

    if (!splash || splash.isDestroyed()) return done()

    // Let the page play its own exit, then hand over. If the renderer is gone
    // or wedged, the timeout still gets us there.
    splash.webContents
      .executeJavaScript("document.body.classList.add('leaving')")
      .catch(() => undefined)
    setTimeout(done, 260)
  }, wait)
}
