/**
 * The in-game overlay window.
 *
 * A transparent, always-on-top, click-through window over the primary display.
 * It is a WINDOW, not an injection: nothing is hooked into the game process,
 * which is both the only approach Riot tolerates and the only one that survives
 * Vanguard.
 *
 * Two things it deliberately does NOT do, because the policy forbids them:
 * react to live game state, and show anything the player did not already know
 * before the game began. What it displays is the same static build we publish on
 * the website, pinned to the screen so it does not need alt-tabbing.
 *
 * Known limitation, and it applies to every overlay of this kind: EXCLUSIVE
 * fullscreen hides it. The game has to be in borderless. There is no way around
 * that short of injecting, which we will not do.
 */
import { BrowserWindow, screen } from "electron"
import { join } from "node:path"

const DEV_URL = process.env.VITE_DEV_SERVER_URL

let overlay: BrowserWindow | null = null
let preload = ""
let idle: ReturnType<typeof setTimeout> | null = null

/**
 * How long a hidden overlay is kept before it is thrown away.
 *
 * ⚠️ A grace period, not a policy. The real boundary is leaving the game, and
 * the shell calls releaseOverlay() there. This exists so that gaps BETWEEN
 * notices inside a game — a minute between a dragon warning and a build
 * notice — do not tear the window down and build it again, which would make
 * every second notice arrive late.
 */
const IDLE_MS = 90_000

/**
 * What has been pushed at it, so a window built later can be caught up.
 *
 * ⚠️ Required by the lazy creation below, not an optimisation. The shell pushes
 * state as it changes and forgets it; a window that did not exist at the time
 * would miss everything said before it opened and draw an empty screen.
 */
const said = new Map<string, unknown>()

/** Remember where the preload lives. The window itself is built on demand. */
export function configureOverlay(preloadPath: string): void {
  preload = preloadPath
}

/**
 * ⚠️ Built when first needed and destroyed when the game ends, rather than
 * living for the whole session.
 *
 * A hidden BrowserWindow is not free: it is a renderer PROCESS, and this one
 * was measured at ~90 MB sitting behind a client that was not even running.
 * The overlay is useful for the twenty-five minutes somebody is in a game and
 * useless for the hours they are not, so it now exists for the twenty-five.
 */
function build(): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()

  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    // Created resizable ON PURPOSE. Windows clamps a new window to the WORK
    // AREA, so asking for a full-screen overlay silently yields one that stops
    // above the taskbar — and a non-resizable window cannot be corrected
    // afterwards. It is locked down again below, once the size has taken.
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    // Never take focus. An overlay that can be focused will eventually steal a
    // keypress mid-fight, which is the fastest way to get uninstalled.
    focusable: false,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // it must keep painting while unfocused
    },
  })

  // Take the full display, taskbar included, and verify it — the renderer
  // anchors to the bottom edge, so a surface 48px short would put everything it
  // draws 48px too high. Silent clamping was exactly that bug.
  overlay.setBounds(bounds)
  const got = overlay.getBounds()
  if (got.height !== bounds.height || got.width !== bounds.width) {
    console.warn(
      "[overlay] wanted %dx%d, got %dx%d — bottom-anchored drawing will be off",
      bounds.width, bounds.height, got.width, got.height
    )
  }
  overlay.setResizable(false)
  overlay.setMovable(false)

  // "screen-saver" is the level that actually sits above a borderless game;
  // plain alwaysOnTop loses to it.
  overlay.setAlwaysOnTop(true, "screen-saver")
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Click-through: the pointer belongs to the game. `forward: true` still lets
  // the window see move events, so hover states remain possible later without
  // ever taking a click.
  overlay.setIgnoreMouseEvents(true, { forward: true })

  const url = DEV_URL ? `${DEV_URL}?overlay=1` : `file://${join(__dirname, "../dist/index.html")}?overlay=1`
  void overlay.loadURL(url)

  // Everything the shell said while this window did not exist.
  overlay.webContents.on("did-finish-load", () => {
    for (const [channel, payload] of said) {
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
    }
  })

  overlay.on("closed", () => { overlay = null })
  return overlay
}

export function showOverlay(): void {
  if (idle) { clearTimeout(idle); idle = null }
  if (!overlay || overlay.isDestroyed()) build()
  if (!overlay) return
  if (!overlay.isVisible()) overlay.showInactive() // show WITHOUT focusing the game away
  overlay.setAlwaysOnTop(true, "screen-saver")
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.hide()
  // Kept briefly in case another notice is a few seconds behind this one.
  if (idle) clearTimeout(idle)
  idle = setTimeout(() => { idle = null; destroyOverlay() }, IDLE_MS)
}

/** The game is over: the window has nothing left to draw for a while. */
export function releaseOverlay(): void {
  destroyOverlay()
}

export function sendOverlay(channel: string, payload: unknown): void {
  // ⚠️ Recorded whether or not there is a window. This IS the catch-up.
  said.set(channel, payload)
  if (!overlay || overlay.isDestroyed()) return
  overlay.webContents.send(channel, payload)
}

export function destroyOverlay(): void {
  if (idle) { clearTimeout(idle); idle = null }
  if (overlay && !overlay.isDestroyed()) overlay.destroy()
  overlay = null
}
