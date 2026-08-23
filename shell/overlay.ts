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

export function createOverlay(preloadPath: string): BrowserWindow {
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
      preload: preloadPath,
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

  overlay.on("closed", () => { overlay = null })
  return overlay
}

export function showOverlay(): void {
  if (!overlay || overlay.isDestroyed()) return
  if (!overlay.isVisible()) overlay.showInactive() // show WITHOUT focusing the game away
  overlay.setAlwaysOnTop(true, "screen-saver")
}

export function hideOverlay(): void {
  if (!overlay || overlay.isDestroyed()) return
  if (overlay.isVisible()) overlay.hide()
}

export function sendOverlay(channel: string, payload: unknown): void {
  if (!overlay || overlay.isDestroyed()) return
  overlay.webContents.send(channel, payload)
}

export function destroyOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.destroy()
  overlay = null
}
