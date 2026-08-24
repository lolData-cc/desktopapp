/**
 * Recording games.
 *
 * ⚠️ Off unless the player turned it on, every time, with no default that
 * records anyone by accident. The overlay also SAYS it is recording at the
 * start of every game — not because anything forces us to, but because a
 * program that captures a screen without saying so is spyware regardless of
 * what it does with the file.
 *
 * The library keeps the last N games and drops the oldest. That is the whole
 * storage policy: a game is ~1GB, nobody prunes a folder by hand, and a
 * recorder that quietly fills a disk gets uninstalled. A recording the player
 * has explicitly KEPT is exempt — the cap is for the automatic ones.
 *
 * Verified on this machine before any of it was written: desktop video comes
 * back at 1920x1080@30, loopback audio gives one track, and H264 is available
 * in both containers. H264 matters more than it looks — it is the codec with
 * hardware encoding everywhere, and a software-encoded recording competes with
 * the game it is recording.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron"
import { createWriteStream, type WriteStream } from "node:fs"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type Highlight = {
  /** Milliseconds from the start of the recording. */
  at: number
  kind: "kill" | "death" | "assist" | "multi"
  /** Who it involved, when that is worth saying. */
  label: string
}

export type Recording = {
  id: string
  file: string
  startedAt: number
  durationMs: number
  bytes: number
  championId: string | null
  championName: string | null
  queue: string | null
  /** Result, once the game is over and known. */
  win: boolean | null
  highlights: Highlight[]
  /** Exempt from the ring buffer, because the player asked to keep it. */
  kept: boolean
  width: number
  height: number
}

const MAX_AUTOMATIC = 10

const dir = () => join(app.getPath("userData"), "recordings")
const indexFile = () => join(dir(), "index.json")

let win: BrowserWindow | null = null
let ready = false
let out: WriteStream | null = null
let current: Recording | null = null
let onChange: (() => void) | null = null

/** Warnings and failures, surfaced rather than swallowed: a recorder that
 *  silently stopped is worse than one that never started. */
let lastError: string | null = null

export const captureError = () => lastError
export const isRecording = () => current !== null

/**
 * The invisible window that owns MediaRecorder.
 *
 * ⚠️ Its own window on purpose. MediaRecorder is a DOM API so this must be a
 * renderer, and putting it in the main window would tie a twenty-minute
 * recording to whatever that window happens to be doing — a section change, a
 * WebGL scene, a React error. None of those can reach a recording that has its
 * own process.
 */
async function ensureWindow(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win

  ready = false
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      // The recorder needs `require("electron")` for ipcRenderer, and it loads
      // exactly one local file that we wrote. Nothing remote is ever loaded
      // here, which is the condition that makes this safe.
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  })

  await win.loadFile(join(__dirname, "..", "capture", "recorder.html"))
  return win
}

ipcMain.on("capture:ready", () => { ready = true })

ipcMain.on("capture:warn", (_e, message: string) => {
  console.log("[capture] %s", message)
})

ipcMain.on("capture:chunk", (_e, chunk: ArrayBuffer) => {
  // Appended as it arrives. Holding a game in memory would be a gigabyte of
  // Blobs for something that belongs on disk, and would lose everything if the
  // app died; at one chunk a second, a crash costs a second.
  out?.write(Buffer.from(chunk))
})

ipcMain.on("capture:failed", (_e, message: string) => {
  lastError = message
  console.log("[capture] FAILED: %s", message)
  void finish()
})

/**
 * Start recording, if the settings allow it.
 *
 * Returns what it actually did, so the caller can tell "recording" from
 * "declined" without inspecting settings a second time.
 */
export async function beginRecording(
  settings: { capture: boolean; captureAudio: "none" | "system" | "mic" | "both" },
  about: { championId: string | null; championName: string | null; queue: string | null },
  changed: () => void
): Promise<boolean> {
  if (!settings.capture || current) return false

  lastError = null
  onChange = changed

  const { desktopCapturer, screen } = await import("electron")
  const sources = await desktopCapturer.getSources({ types: ["screen"] })
  // The screen the game is on is the primary one in every case that matters;
  // picking by id keeps this honest if that ever stops being true.
  const primary = screen.getPrimaryDisplay()
  const source =
    sources.find((s) => String(s.display_id) === String(primary.id)) ?? sources[0]
  if (!source) {
    lastError = "no screen to record"
    return false
  }

  const w = await ensureWindow()
  // The window may still be loading on the very first game.
  for (let i = 0; i < 40 && !ready; i++) await new Promise((r) => setTimeout(r, 100))
  if (!ready) {
    lastError = "the recorder did not start"
    return false
  }

  await mkdir(dir(), { recursive: true })
  const id = `${Date.now()}`
  const file = join(dir(), `${id}.webm`)
  out = createWriteStream(file)

  current = {
    id,
    file,
    startedAt: Date.now(),
    durationMs: 0,
    bytes: 0,
    championId: about.championId,
    championName: about.championName,
    queue: about.queue,
    win: null,
    highlights: [],
    kept: false,
    width: 0,
    height: 0,
  }

  w.webContents.send("capture:start", {
    sourceId: source.id,
    audio: settings.captureAudio,
    fps: 30,
    // 8 Mbit is the point where 1080p gameplay stops showing compression on
    // fast camera movement. Higher costs disk for something nobody can see.
    bitrate: 8_000_000,
  })

  return true
}

ipcMain.on("capture:started", (_e, info: { width: number; height: number; audio: number; mimeType: string }) => {
  if (current) {
    current.width = info.width
    current.height = info.height
  }
  console.log("[capture] recording %dx%d, %d audio track(s), %s",
    info.width, info.height, info.audio, info.mimeType)
  onChange?.()
})

/** A moment worth jumping to later, timestamped against the recording. */
export function mark(kind: Highlight["kind"], label: string): void {
  if (!current) return
  const at = Date.now() - current.startedAt
  // Riot's event feed repeats; a second mark on the same moment is the same
  // moment.
  if (current.highlights.some((h) => h.kind === kind && Math.abs(h.at - at) < 1500)) return
  current.highlights.push({ at, kind, label })
}

/** The result, once the game says so. */
export function setResult(win: boolean): void {
  if (current) current.win = win
}

export async function endRecording(): Promise<void> {
  if (!current || !win || win.isDestroyed()) return
  win.webContents.send("capture:stop")
}

ipcMain.on("capture:stopped", () => { void finish() })

async function finish(): Promise<void> {
  const rec = current
  const stream = out
  current = null
  out = null
  if (!rec || !stream) return

  await new Promise<void>((resolve) => stream.end(resolve))

  rec.durationMs = Date.now() - rec.startedAt
  try {
    rec.bytes = (await stat(rec.file)).size
  } catch {
    rec.bytes = 0
  }

  // A recording with nothing in it is a failed one, and a library full of
  // empty files teaches the player not to trust the feature.
  if (rec.bytes < 128 * 1024) {
    console.log("[capture] discarded an empty recording (%d bytes)", rec.bytes)
    await rm(rec.file, { force: true })
    onChange?.()
    return
  }

  const all = await readIndex()
  all.unshift(rec)
  await writeIndex(await prune(all))
  console.log("[capture] saved %s — %ds, %s MB, %d highlight(s)",
    rec.championName ?? "game",
    Math.round(rec.durationMs / 1000),
    (rec.bytes / 1048576).toFixed(0),
    rec.highlights.length)
  onChange?.()
}

/**
 * The ring buffer.
 *
 * ⚠️ Only the AUTOMATIC recordings are counted. One the player kept is theirs;
 * silently deleting it to make room for a game they have not watched yet would
 * be the single worst thing this feature could do.
 */
async function prune(all: Recording[]): Promise<Recording[]> {
  const kept = all.filter((r) => r.kept)
  const automatic = all.filter((r) => !r.kept)

  const doomed = automatic.slice(MAX_AUTOMATIC)
  for (const r of doomed) {
    await rm(r.file, { force: true }).catch(() => undefined)
    console.log("[capture] dropped the oldest recording (%s)", r.championName ?? r.id)
  }

  return [...kept, ...automatic.slice(0, MAX_AUTOMATIC)].sort((a, b) => b.startedAt - a.startedAt)
}

export async function readIndex(): Promise<Recording[]> {
  try {
    return JSON.parse(await readFile(indexFile(), "utf8")) as Recording[]
  } catch {
    return []
  }
}

async function writeIndex(all: Recording[]): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(indexFile(), JSON.stringify(all, null, 2), "utf8")
}

/** Keep it, so the ring buffer stops counting it. */
export async function keepRecording(id: string, keep: boolean): Promise<Recording[]> {
  const all = await readIndex()
  const found = all.find((r) => r.id === id)
  if (found) found.kept = keep
  const pruned = await prune(all)
  await writeIndex(pruned)
  return pruned
}

export async function deleteRecording(id: string): Promise<Recording[]> {
  const all = await readIndex()
  const found = all.find((r) => r.id === id)
  if (found) await rm(found.file, { force: true }).catch(() => undefined)
  const rest = all.filter((r) => r.id !== id)
  await writeIndex(rest)
  return rest
}

/** Show the file, rather than copying it somewhere of our choosing. */
export async function revealRecording(id: string): Promise<void> {
  const all = await readIndex()
  const found = all.find((r) => r.id === id)
  if (found) shell.showItemInFolder(found.file)
}

/** What the library is costing, for a screen that should say so plainly. */
export async function librarySize(): Promise<number> {
  try {
    const files = await readdir(dir())
    let total = 0
    for (const f of files) {
      if (!f.endsWith(".webm")) continue
      total += (await stat(join(dir(), f))).size
    }
    return total
  } catch {
    return 0
  }
}

export function destroyRecorder(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  ready = false
}
