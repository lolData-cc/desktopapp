/**
 * Sharing a moment.
 *
 * ⚠️ A MOMENT, not a match. A recorded game is about 1.3 GB and there is no
 * consumer channel that will carry it — Discord takes 10 MB, WhatsApp 16,
 * email 25 — so "share your replay" can only ever mean the twenty seconds
 * somebody actually wants to show. Which is also what they want: nobody sends
 * a friend twenty-six minutes, they send the kill.
 *
 * Twenty seconds at 720p lands around 8 MB, which passes everywhere.
 *
 * Nothing is uploaded. The clip is a file on the player's disk that they send
 * however they already send things — which needs no account, no storage bill,
 * and no moderation policy for video somebody else hosts.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron"
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { captureFile } from "./paths"
import { CLIP_SCHEME, clipUrl } from "../src/data/clip"

export type ClipRequest = {
  recordingId: string
  /** Milliseconds into the recording. */
  fromMs: number
  toMs: number
  /** For the file's name — the champion and what happened. */
  label: string
}

export type ClipResult =
  | { ok: true; file: string; bytes: number; seconds: number }
  | { ok: false; message: string }

/** Where the clips go. Beside the recordings, but their own folder: these are
 *  the ones somebody chose to make, and they are never swept by the budget. */
const dir = () => join(app.getPath("userData"), "clips")

let win: BrowserWindow | null = null
let ready = false

/**
 * ⚠️ 720p, not the recording's own size. The whole point is a file small
 * enough to send, and 1080p at a shareable bitrate looks worse than 720p at
 * the same one — there are more pixels dividing the same bits.
 */
const WIDTH = 1280
const HEIGHT = 720
const FPS = 30
const BITRATE = 3_000_000

async function ensureWindow(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win
  ready = false
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      // A preload rather than nodeIntegration: the page is loaded from the clip
      // scheme (see below), and a preload works whatever the origin is.
      preload: captureFile("clipper-preload.cjs"),
      contextIsolation: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  /**
   * A window that fails to load is otherwise a silent timeout thirty seconds
   * later, saying only "the clipper did not start" — which names the symptom
   * and hides every cause.
   */
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.log("[clip] page failed to load: %s %s (%s)", code, desc, url))
  win.webContents.on("preload-error", (_e, path, err) =>
    console.log("[clip] preload failed: %s — %s", path, (err as Error)?.message))
  win.webContents.on("console-message", (_e, _level, message) =>
    console.log("[clip] page says: %s", message))

  /**
   * ⚠️ Loaded from the CLIP SCHEME, not from disk.
   *
   * Same origin as the recordings it reads, which is what keeps the canvas
   * clean. Loaded from file:// it was a different origin, the canvas was
   * tainted, and captureStream() threw after the whole segment had played.
   *
   * ⚠️ Same HOST, on a path — not a host of its own. The scheme is registered
   * as `standard`, so the host is part of the origin and `//app/...` was just
   * as cross-origin as file:// had been.
   */
  await win.loadURL(`${CLIP_SCHEME}://recording/_page/clipper.html`)
  return win
}

ipcMain.on("clip:ready", () => { ready = true })
ipcMain.on("clip:warn", (_e, m: string) => console.log("[clip] %s", m))

let onProgress: ((fraction: number) => void) | null = null
ipcMain.on("clip:progress", (_e, fraction: number) => onProgress?.(fraction))

/**
 * Cut a clip and write it to disk.
 *
 * Takes roughly as long as the clip itself: the segment is played and
 * re-encoded, which is the price of not shipping a container parser or an
 * 80 MB copy of ffmpeg.
 */
export async function makeClip(
  req: ClipRequest,
  progress: (fraction: number) => void
): Promise<ClipResult> {
  const seconds = Math.max(1, Math.round((req.toMs - req.fromMs) / 1000))
  const w = await ensureWindow()
  for (let i = 0; i < 60 && !ready; i++) await new Promise((r) => setTimeout(r, 100))
  if (!ready) return { ok: false, message: "the clipper did not start" }

  onProgress = progress

  const result = await new Promise<{ buffer: ArrayBuffer; mimeType: string } | string>((resolve) => {
    const done = (_e: unknown, out: { buffer: ArrayBuffer; mimeType: string }) => {
      ipcMain.off("clip:failed", failed)
      resolve(out)
    }
    const failed = (_e: unknown, message: string) => {
      ipcMain.off("clip:done", done)
      resolve(message)
    }
    ipcMain.once("clip:done", done)
    ipcMain.once("clip:failed", failed)

    w.webContents.send("clip:cut", {
      src: clipUrl(req.recordingId),
      fromMs: req.fromMs,
      toMs: req.toMs,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      bitrate: BITRATE,
    })
  })

  onProgress = null
  // ⚠️ Torn down after each clip. It is a renderer process, and one held open
  // for the next time somebody might share something is the exact waste the
  // recorder's window was.
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  ready = false

  if (typeof result === "string") return { ok: false, message: result }

  const ext = result.mimeType.startsWith("video/mp4") ? "mp4" : "webm"
  const safe = req.label.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "clip"
  const file = join(dir(), `${safe}-${Date.now()}.${ext}`)

  await mkdir(dir(), { recursive: true })
  const bytes = Buffer.from(result.buffer)
  await writeFile(file, bytes)

  console.log("[clip] %s — %ds, %s MB", file, seconds, (bytes.byteLength / 1048576).toFixed(1))
  return { ok: true, file, bytes: bytes.byteLength, seconds }
}

/** What the shared clips are costing, and how many there are. */
export async function clipsOnDisk(): Promise<{ bytes: number; count: number }> {
  try {
    const files = await readdir(dir())
    let bytes = 0
    let count = 0
    for (const f of files) {
      bytes += (await stat(join(dir(), f))).size
      count++
    }
    return { bytes, count }
  } catch {
    return { bytes: 0, count: 0 }
  }
}

/** Throw the shared clips away. They are cuts of recordings that still exist,
 *  so this loses nothing that cannot be cut again. */
export async function emptyClips(): Promise<number> {
  const { bytes } = await clipsOnDisk()
  try {
    for (const f of await readdir(dir())) await rm(join(dir(), f), { force: true }).catch(() => undefined)
  } catch {
    return 0
  }
  console.log("[clip] emptied the clips, %s MB", (bytes / 1048576).toFixed(0))
  return bytes
}

export function revealClip(file: string): void {
  shell.showItemInFolder(file)
}

/** Where the clips live, for a "show me" button that does not make anybody
 *  hunt through AppData. */
export function revealClipFolder(): void {
  void mkdir(dir(), { recursive: true }).then(() => shell.openPath(dir()))
}

export function destroyClipper(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  ready = false
}
