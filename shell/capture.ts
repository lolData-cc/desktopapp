/**
 * Recording games.
 *
 * ⚠️ Off unless the player turned it on, every time, with no default that
 * records anyone by accident. The overlay also SAYS it is recording at the
 * start of every game — not because anything forces us to, but because a
 * program that captures a screen without saying so is spyware regardless of
 * what it does with the file.
 *
 * ⚠️ And it records THE GAME'S WINDOW, never the display. See leagueWindow()
 * below: if that window cannot be found, nothing is recorded at all.
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
import { app, BrowserWindow, ipcMain, protocol, shell } from "electron"
import { createReadStream, createWriteStream, type WriteStream } from "node:fs"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { Readable } from "node:stream"
import { join } from "node:path"
import { captureFile } from "./paths"
import { CLIP_SCHEME } from "../src/data/clip"
import { planAudio, type AudioLayout, type AudioPlan } from "./audioSplit"

export type Highlight = {
  /** Milliseconds from the start of the recording. */
  at: number
  kind: "kill" | "death" | "assist" | "multi"
  /** Who it involved, when that is worth saying. */
  label: string
  /**
   * What they were playing - the ddragon slug, e.g. "LeeSin".
   *
   * ⚠️ OPTIONAL, and it has to stay that way. `readIndex` is a bare
   * `JSON.parse(...) as Recording[]` with no validation and no version, so
   * every recording already on disk loads with this simply absent. There is no
   * migration and there must not be one: a required field here would be a type
   * that lies about what is in the file.
   *
   * ⚠️ The SLUG, not the display name and not the numeric id. It is what the
   * CDN keys champion art on, and it is the one spelling that is stable - the
   * display name is localised by the game client, and "Lee Sin" is not a path.
   */
  champion?: string
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
  /**
   * ⚠️ What the capture ACTUALLY ran at, read back off the track — not what was
   * asked for. A machine can refuse a rate, and a library that printed the
   * request would be answering a question about the file with a setting.
   */
  fps: number
  /**
   * How the one audio track is laid out.
   *
   * `"split"` means LEFT is the game and RIGHT is Discord, each mono. Anything
   * else — including ABSENT, which every recording made before this existed is
   * — means one ordinary mixed track, and the player shows one volume slider
   * exactly as it always did.
   */
  audioLayout?: AudioLayout
  /**
   * The loudest either channel ever got, 0–1.
   *
   * ⚠️ The only defence against the silent-failure trap. A loopback capture
   * pointed at the wrong process yields a LIVE track of digital silence, with no
   * exception and nothing on the console — so "did this work" cannot be asked of
   * the API and has to be measured off the signal.
   */
  audioPeaks?: { game: number; voice: number }
}

/**
 * How much disk the automatic recordings may occupy, in bytes — or null for no
 * limit. Held here and set from the settings, because prune() also runs from
 * paths that have no settings in hand (keeping one, deleting one).
 */
let budget: number | null = 25 * 1024 ** 3

export function setCaptureBudget(gb: number | null): void {
  budget = gb === null ? null : Math.max(1, gb) * 1024 ** 3
}

const dir = () => join(app.getPath("userData"), "recordings")
const indexFile = () => join(dir(), "index.json")

let win: BrowserWindow | null = null
let ready = false
let out: WriteStream | null = null
let current: Recording | null = null
/** Event identities already on the timeline, so a repeated feed cannot mark
 *  the same moment twice. Cleared with each recording. */
let marked = new Set<string>()
/** What the recorder actually chose, which decides the file's name. */
let container: "mp4" | "webm" = "mp4"
let onChange: (() => void) | null = null

/** Warnings and failures, surfaced rather than swallowed: a recorder that
 *  silently stopped is worse than one that never started. */
let lastError: string | null = null

export const captureError = () => lastError
export const isRecording = () => current !== null

/**
 * The game's window — not the screen.
 *
 * ⚠️ This records LEAGUE, and only League. Capturing the display would put
 * everything else on the monitor into the file too: the second screen's worth
 * of Discord, a browser, whatever was open behind the game. Nobody asking for
 * their games to be recorded is asking for that, and the file is the thing
 * they might later hand to somebody else.
 *
 * ⚠️ And if the window cannot be found, NOTHING is recorded. Falling back to
 * the whole display would be quietly doing the thing this function exists to
 * avoid. A missing recording is a disappointment; a recording of everything
 * else on the machine is a breach of what the feature promised.
 */
async function leagueWindow(anyWindow = false): Promise<{ id: string; name: string } | null> {
  const { desktopCapturer } = await import("electron")
  const windows = await desktopCapturer.getSources({ types: ["window"] })

  const named = (needle: string) =>
    windows.find((w) => w.name.toLowerCase().includes(needle))

  /**
   * ⚠️ The GAME window, which is NOT the client window.
   *
   * They are two different processes and both are open during a match: the
   * client is the lobby, the shop, the post-game screen — titled "League of
   * Legends" — and the game is titled "League of Legends (TM) Client". Falling
   * back to the client would record a lobby for twenty minutes and call it a
   * game, so there is no fallback. If the game window is not there yet, the
   * caller asks again.
   */
  const source =
    named("(tm) client") ??
    (anyWindow ? named("loldata") ?? named("league of legends") : undefined)

  if (!source) {
    // Every candidate, so a title we have not met is one game away from being
    // matched rather than a mystery. And note that a MINIMISED window does not
    // appear here at all, which is why the caller keeps asking instead of
    // giving up on the first miss.
    console.log("[capture] no League window yet. Open windows: %s",
      windows.map((w) => JSON.stringify(w.name)).join(", ") || "(none)")
    lastError = "The League window was not found, so nothing was recorded. This app records the game's window only, never your whole screen."
    return null
  }

  console.log("[capture] source: %s", source.name)
  return source
}

/**
 * The process the NEXT getDisplayMedia call is allowed to capture.
 *
 * ⚠️ ONE AT A TIME, and armed only immediately before the call it answers. Not a
 * queue: two requests in flight would be answered in whatever order Chromium
 * asked, and the audio of a game would end up on the channel labelled Discord
 * with nothing anywhere reporting it. The renderer asks, waits for this to be
 * armed, then calls — strictly sequential.
 */
let pendingAsk: { pid: number; kind: string } | null = null
let handlerReady = false

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

  await win.loadFile(captureFile("recorder.html"))

  /**
   * ⚠️ Registered ONCE and gated HARD on the recorder's own frame. This handler
   * is session-wide: without the frame check, any page this app ever loads could
   * ask for a display-media stream and be handed one.
   */
  if (!handlerReady) {
    handlerReady = true
    const { session } = await import("electron")
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      if (!win || win.isDestroyed() || request.frame !== win.webContents.mainFrame) return callback({})
      const ask = pendingAsk
      pendingAsk = null
      if (!ask) return callback({})
      /**
       * ⚠️ UNDOCUMENTED, and verified rather than trusted. Electron's typings
       * admit only `'loopback' | 'loopbackWithMute' | WebFrameMain` for `audio`;
       * its own source calls this dictionary form an escape hatch not permitted
       * by the documentation. Measured working on 43.4.1, with a decisive
       * negative control: the same call aimed at a SILENT process returned a
       * peak of 0.0000, so the id is genuinely honoured and is not quietly
       * falling back to the system mix.
       */
      callback({ audio: { id: `applicationLoopback:${ask.pid}`, name: ask.kind } as unknown as never })
    })
  }

  return win
}

ipcMain.on("capture:ready", () => { ready = true })

/**
 * The renderer asking permission to capture one process.
 *
 * ⚠️ It names a CHANNEL, never a pid. The renderer is a web page; letting it
 * choose the process would mean building a device id out of something this
 * module did not verify, and a malformed one makes Chromium `CHECK`-fail while
 * parsing it. The pids come from the plan made when the recording started.
 */
ipcMain.handle("capture:want-audio", (_e, kind: "game" | "voice") => {
  const pid = kind === "game" ? plan?.gamePid : plan?.voicePid
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false
  pendingAsk = { pid, kind }
  return true
})

/** The audio plan for the recording in progress. */
let plan: AudioPlan | null = null

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
  settings: {
    capture: boolean
    captureAudio: "none" | "system" | "mic" | "both" | "split"
    captureBudgetGb?: number | null
    captureFps?: number
  },
  about: { championId: string | null; championName: string | null; queue: string | null },
  changed: () => void,
  /** Debug only: record our own window when there is no game, so the recorder
   *  can be exercised without playing one. */
  anyWindow = false
): Promise<boolean> {
  if (!settings.capture || current) return false

  lastError = null
  onChange = changed
  marked = new Set()
  if (settings.captureBudgetGb !== undefined) setCaptureBudget(settings.captureBudgetGb)

  const fps = settings.captureFps && settings.captureFps > 0 ? settings.captureFps : 30

  const source = await leagueWindow(anyWindow)
  if (!source) return false

  /**
   * ⚠️ Made BEFORE the recorder window is asked to start, because it decides
   * what to ask it for — and it costs about a second of PowerShell, which is a
   * second spent before the game rather than during it.
   */
  plan = await planAudio(settings.captureAudio === "split")

  const w = await ensureWindow()
  // The window may still be loading on the very first game.
  for (let i = 0; i < 40 && !ready; i++) await new Promise((r) => setTimeout(r, 100))
  if (!ready) {
    lastError = "the recorder did not start"
    return false
  }

  await mkdir(dir(), { recursive: true })
  const id = `${Date.now()}`
  /**
   * ⚠️ Written to `.part` and named at the end, once the recorder has said
   * which container it actually used.
   *
   * MP4 is preferred and MP4 is what every machine tested gives us — but the
   * fallback is real, and a file called .mp4 holding WebM is a file Windows
   * offers to open and then refuses to play. A crash also leaves an obviously
   * unfinished `.part` rather than a video that looks fine until you open it.
   */
  const file = join(dir(), `${id}.part`)
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
    fps: 0,
    audioLayout: plan.layout,
  }

  w.webContents.send("capture:start", {
    sourceId: source.id,
    audio: settings.captureAudio,
    // What the machine can actually do, which is not always what was asked
    // for: Windows 10, or Discord simply not running, both land on "stereo".
    layout: plan.layout,
    fps,
    /**
     * ⚠️ Scaled with the frame rate, not fixed.
     *
     * 6 Mbit is about 1.3 GB for a half-hour game at 30fps, and 8 Mbit is
     * visibly no better at that rate. But the same 6 Mbit spread over twice as
     * many frames is half the bits in each one — 60fps at a 30fps bitrate looks
     * WORSE than 30fps did, which is the opposite of what somebody choosing it
     * is asking for. The rate follows the frames.
     */
    bitrate: Math.round(6_000_000 * (fps / 30)),
  })

  return true
}

ipcMain.on("capture:started", (_e, info: { width: number; height: number; fps: number; audio: number; mimeType: string }) => {
  if (current) {
    /**
     * ⚠️ The clock starts HERE, not when we asked.
     *
     * Between the request and the first frame there is a screen to acquire, a
     * pipeline to build and an encoder to open — half a second or so. Every
     * kill is timestamped against this moment, so counting from the request
     * puts every jump the same half-second late, for the whole game.
     */
    current.startedAt = Date.now()
    current.width = info.width
    current.height = info.height
    current.fps = info.fps
    container = info.mimeType.startsWith("video/mp4") ? "mp4" : "webm"
  }
  console.log("[capture] recording %dx%d @%dfps, %d audio track(s), %s",
    info.width, info.height, info.fps, info.audio, info.mimeType)
  onChange?.()
})

/**
 * A moment worth jumping to later.
 *
 * ⚠️ `at` is WHERE IT HAPPENED in the recording, and `key` is what makes it
 * the same moment twice.
 *
 * Both were got wrong, and the failure was total: the position was stamped
 * with the clock at the moment of marking, while the caller re-reads Riot's
 * event feed — which hands back every event of the whole game — several times
 * a minute. So one kill became a fresh mark on every poll, each one further
 * along the timeline than the last. A nineteen-minute game came back with 961
 * marks, none of them where anything happened.
 *
 * The dedupe was no defence, because it compared the mark TIMES, and those
 * kept advancing. It has to be the event's own identity.
 */
export function mark(
  kind: Highlight["kind"],
  label: string,
  at: number,
  key: string,
  champion?: string | null
): void {
  if (!current || marked.has(key)) return
  marked.add(key)
  // Written only when it is known: an absent champion and an empty one mean the
  // same thing to every reader, and one of them does not sit in the file.
  current.highlights.push({
    at: Math.max(0, Math.round(at)),
    kind,
    label,
    ...(champion ? { champion } : {}),
  })
}

/** Milliseconds into the running recording, right now — or null if there is
 *  none. Callers convert their own clock against this. */
export const recordingClock = (): number | null =>
  current ? Date.now() - current.startedAt : null

/** The result, once the game says so. */
export function setResult(win: boolean): void {
  if (current) current.win = win
}

export async function endRecording(): Promise<void> {
  if (!current || !win || win.isDestroyed()) return
  win.webContents.send("capture:stop")
}

ipcMain.on("capture:stopped", (_e, info?: { peaks?: { game: number; voice: number } }) => {
  // ⚠️ Written before finish(), which is what persists the record. A peak of
  // zero on a "split" recording means that channel captured nothing - the wrong
  // process, or one that never made a sound - and the player needs to know it
  // before it offers a slider for it.
  if (current && info?.peaks) current.audioPeaks = info.peaks
  void finish()
})

async function finish(): Promise<void> {
  const rec = current
  const stream = out
  current = null
  out = null
  if (!rec || !stream) return

  await new Promise<void>((resolve) => stream.end(resolve))

  // Now, and only now, does the file get its real name — the recorder has
  // told us what is actually inside it.
  const named = rec.file.replace(/\.part$/, `.${container}`)
  try {
    await rename(rec.file, named)
    rec.file = named
  } catch {
    // Keep the .part path rather than lose the recording: a file with an
    // awkward name still plays, a forgotten one does not.
  }

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

  /**
   * ⚠️ The recorder's window goes too, and it is a whole renderer process.
   *
   * It used to be built on the first game and kept for the rest of the session
   * — a process holding a MediaRecorder that had nothing to record, for every
   * hour somebody left the app open. Rebuilding it costs about a third of a
   * second at the start of the next game, which is time the loading screen has
   * to spare.
   */
  destroyRecorder()

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
  const automatic = all.filter((r) => !r.kept).sort((a, b) => b.startedAt - a.startedAt)

  if (budget === null) return [...kept, ...automatic].sort((a, b) => b.startedAt - a.startedAt)

  /**
   * ⚠️ Newest first, and once one does not fit, everything older goes with it.
   *
   * Letting a smaller older recording slip into the gap left by a large one
   * would make the library a set of whatever happened to fit rather than the
   * games you last played — you would lose Tuesday and still have last month.
   */
  const live: Recording[] = []
  const doomed: Recording[] = []
  let used = 0
  let full = false

  for (const r of automatic) {
    /**
     * ⚠️ The newest survives whatever it costs. A fifty-minute game can be
     * larger than the whole budget, and deleting it the instant it finished —
     * the one recording somebody is certainly about to watch — is the worst
     * thing this function could do.
     */
    if (!full && (live.length === 0 || used + r.bytes <= budget)) {
      live.push(r)
      used += r.bytes
      continue
    }
    full = true
    doomed.push(r)
  }

  for (const r of doomed) {
    await rm(r.file, { force: true }).catch(() => undefined)
    console.log("[capture] dropped the oldest recording (%s, %s MB) — over the %s GB budget",
      r.championName ?? r.id, (r.bytes / 1048576).toFixed(0), (budget / 1024 ** 3).toFixed(0))
  }

  return [...kept, ...live].sort((a, b) => b.startedAt - a.startedAt)
}

/**
 * Where each recording lives, by id.
 *
 * Kept in memory because the player asks through the protocol below and a
 * single seek is a burst of range requests — re-reading and re-parsing a JSON
 * file for every one of them would put disk I/O on the path of dragging a
 * scrub bar.
 */
const located = new Map<string, string>()
const remember = (all: Recording[]) => {
  located.clear()
  for (const r of all) located.set(r.id, r.file)
}

export async function readIndex(): Promise<Recording[]> {
  try {
    const all = JSON.parse(await readFile(indexFile(), "utf8")) as Recording[]
    remember(all)
    return all
  } catch {
    return []
  }
}

async function writeIndex(all: Recording[]): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(indexFile(), JSON.stringify(all, null, 2), "utf8")
  remember(all)
}

/**
 * Apply the budget to what is already on disk.
 *
 * Called when the budget CHANGES. Lowering it is a request to reclaim space
 * now, and waiting until the next game would mean choosing 5 GB and watching
 * 20 GB sit there until you happened to play.
 */
export async function reprune(): Promise<Recording[]> {
  const pruned = await prune(await readIndex())
  await writeIndex(pruned)
  return pruned
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

/**
 * Files with no entry in the index, removed.
 *
 * A recording that was running when the machine went down leaves a `.part`
 * behind that nothing will ever open — and it is a gigabyte. Swept once at
 * startup rather than on a timer: this is tidying, not a background service.
 *
 * ⚠️ Only files the index does not know about. Anything listed is somebody's
 * game, kept or not.
 */
export async function tidyLibrary(): Promise<void> {
  try {
    const index = await readIndex()
    const known = new Set(index.map((r) => r.file.toLowerCase()))
    const files = (await readdir(dir())).filter((f) => !f.endsWith(".json"))
    const orphans = files.filter((f) => !known.has(join(dir(), f).toLowerCase()))

    /**
     * ⚠️ NEVER sweep on an empty or unreadable index. This deleted somebody's
     * games.
     *
     * readIndex() answers [] for a missing file, a half-written one, a locked
     * one — every failure looks exactly like "there are no recordings". Paired
     * with "delete everything the index does not mention", that turns one bad
     * read into the loss of the whole library, silently, at startup.
     *
     * An index that lists nothing while videos sit on the disk is not a tidy
     * job. It is a broken index, and the videos are the part worth keeping.
     */
    if (!index.length && files.length) {
      console.log(
        "[capture] %d recording(s) on disk and an index that lists none — leaving them alone",
        files.length
      )
      return
    }

    /**
     * ⚠️ And never a wholesale sweep. Anything that would take out most of the
     * library is a bug in here, not a mess out there — a real orphan is the
     * one `.part` a crash left behind.
     */
    if (orphans.length > 2 && orphans.length >= files.length) {
      console.log("[capture] %d file(s) look orphaned, which is too many to be right — leaving them alone",
        orphans.length)
      return
    }

    for (const f of orphans) {
      // ⚠️ Only ever an unfinished recording. A finished .mp4 that has fallen
      // out of the index is a video somebody played a game for; it stays, and
      // it can be deleted by hand.
      if (!f.endsWith(".part")) {
        console.log("[capture] %s is not in the index but is a finished recording — keeping it", f)
        continue
      }
      await rm(join(dir(), f), { force: true }).catch(() => undefined)
      console.log("[capture] swept an unfinished recording (%s)", f)
    }
  } catch {
    // No library yet, which is the normal state until the first game.
  }
}

/**
 * Throw the recordings away.
 *
 * ⚠️ KEPT ones survive unless explicitly included, and the caller has to ask
 * for that separately. "Keep" is a promise this app made — the size limit is
 * told not to count them — and an "empty" button that quietly broke it would
 * make the promise worthless everywhere else it appears.
 *
 * ⚠️ Refuses while a recording is running. Deleting the file that is being
 * written to would leave a live stream pointed at nothing.
 */
export async function emptyRecordings(includeKept: boolean): Promise<number> {
  if (current) return 0
  const all = await readIndex()
  const doomed = includeKept ? all : all.filter((r) => !r.kept)
  const survivors = includeKept ? [] : all.filter((r) => r.kept)

  let freed = 0
  for (const r of doomed) {
    freed += r.bytes
    await rm(r.file, { force: true }).catch(() => undefined)
  }
  await writeIndex(survivors)
  console.log("[capture] emptied %d recording(s), %s GB", doomed.length, (freed / 1024 ** 3).toFixed(2))
  return freed
}

/** What the library is costing, for a screen that should say so plainly. */
export async function librarySize(): Promise<number> {
  try {
    const files = await readdir(dir())
    let total = 0
    for (const f of files) {
      if (f.endsWith(".json")) continue
      total += (await stat(join(dir(), f))).size
    }
    return total
  } catch {
    return 0
  }
}

/* ── playing one back ───────────────────────────────────────────────────── */

/**
 * The scheme a recording is read through.
 *
 * ⚠️ It takes an ID, never a path. A handler that served whatever file the
 * renderer named would be an arbitrary-file-read primitive wearing a video
 * player's clothes — this one is handed a recording id, looks up where that
 * recording lives, and nothing outside the library is reachable however the URL
 * is spelled.
 *
 * ⚠️ Range requests are answered properly — 206, Content-Range, the lot. That
 * is not politeness: without ranges a <video> cannot seek at all, and jumping
 * to a kill is the entire reason any of this exists.
 */
// ⚠️ At import time, because Electron only accepts this BEFORE the app is
// ready — and the shell imports this module on its first line.
protocol.registerSchemesAsPrivileged([
  {
    scheme: CLIP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

/**
 * A slice of a file, as a body a Response can carry.
 *
 * ⚠️ Served WHOLE, however large the ask. Answering with less than was
 * requested — a polite-looking cap to bound memory — was measured here and it
 * does not work: Chromium takes the short answer as the end of the file and
 * never comes back for the rest, so a nine-second clip played as four and
 * reported itself that way. A recording that quietly loses its second half is
 * worse than one that fails to open. The read is streamed, so "whole" costs
 * one buffer, not one file.
 *
 * ⚠️ The error handler is not decoration. An unhandled `error` on a Node
 * stream takes the process down, and a read cancelled mid-seek — which is what
 * dragging a scrub bar does, repeatedly — arrives as exactly that.
 */
function bodyOf(file: string, range?: { start: number; end: number }): ReadableStream {
  const read = createReadStream(file, range)
  read.on("error", () => undefined)
  // Node's web stream and the DOM's are the same object at runtime and two
  // unrelated types to the compiler; Electron takes the one we have.
  return Readable.toWeb(read) as unknown as ReadableStream
}

export function serveClips(): void {
  protocol.handle(CLIP_SCHEME, async (request) => {
    const url = new URL(request.url)

    /**
     * ⚠️ The clipper's own page is served from this scheme too, and that is the
     * whole reason it exists here.
     *
     * The clipper draws a recording into a canvas, and a canvas that has been
     * drawn from another origin is TAINTED — captureStream() then throws at the
     * very last step, after the segment has already been played. The obvious
     * fix, crossOrigin plus the CORS headers, was tried and measured: the media
     * stack rejected the partial responses with "Format error" whatever was
     * exposed. Serving the page from the same origin as the video removes the
     * question rather than answering it.
     *
     * ⚠️ Under the SAME HOST as the recordings, on a path, not on a host of its
     * own. This scheme is registered as `standard`, so the host is part of the
     * origin — `//app/clipper.html` and `//recording/123` are two origins, and
     * the canvas was tainted exactly as before. Measured, after assuming
     * otherwise.
     */
    if (url.pathname.startsWith("/_page/")) {
      const name = url.pathname.slice("/_page/".length)
      if (!/^[\w.-]+$/.test(name)) return new Response("no", { status: 404 })
      try {
        const body = await readFile(captureFile(name))
        return new Response(body as unknown as BodyInit, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        })
      } catch {
        return new Response("no such page", { status: 404 })
      }
    }

    const id = url.pathname.replace(/^\//, "")
    // A miss means the index has not been read in this run yet; reading it
    // fills the map for every request after this one.
    if (!located.has(id)) await readIndex()
    const file = located.get(id)
    if (!file) return new Response("no such recording", { status: 404 })

    let size = 0
    try {
      size = (await stat(file)).size
    } catch {
      return new Response("the file is gone", { status: 404 })
    }

    const headers: Record<string, string> = {
      "Content-Type": file.endsWith(".mp4") ? "video/mp4" : "video/webm",
      "Accept-Ranges": "bytes",
      // Never cached: the ring buffer deletes these, and a cached copy would
      // outlive the recording it came from.
      "Cache-Control": "no-store",
      /**
       * ⚠️ Required by the clipper, not politeness.
       *
       * A recording is served from this scheme and the clipper's page is not
       * on it, so drawing the video into a canvas TAINTS that canvas and
       * captureStream() then throws — at the very last step, after the whole
       * segment has already been played. With this header and crossOrigin on
       * the element, the canvas stays clean.
       *
       * Safe here in a way it is not on a CDN: this handler answers every
       * request itself, so there is no cached copy without the header waiting
       * to be served instead.
       */
      "Access-Control-Allow-Origin": "*",
      /**
       * ⚠️ And the RANGE headers have to be allowed and exposed, or the media
       * stack rejects the partial response as a format error — measured, with
       * exactly that message and nothing about CORS in it.
       *
       * A cross-origin media load is served in pieces like any other, but with
       * CORS on, a header the response does not expose might as well not be
       * there: without Content-Range the player is handed a chunk of a file
       * with no way to know where in the file it came from.
       */
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    }

    // The preflight some cross-origin range requests send first.
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })

    const asked = /bytes=(\d*)-(\d*)/.exec(request.headers.get("Range") ?? "")
    if (!asked) {
      return new Response(bodyOf(file), {
        status: 200,
        headers: { ...headers, "Content-Length": String(size) },
      })
    }

    const start = asked[1] ? Number(asked[1]) : 0
    const end = asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1
    if (!(start >= 0 && start <= end && end < size)) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      })
    }

    return new Response(bodyOf(file, { start, end }), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    })
  })
}

export function destroyRecorder(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  ready = false
}
