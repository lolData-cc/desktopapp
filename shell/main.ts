/**
 * The shell.
 *
 * It owns the window and the League connection, and pushes a single snapshot of
 * OUR state to the renderer. The renderer never touches the LCU, never sees a
 * client URI, and never holds a credential — which is what keeps the shell
 * swappable. If this becomes Tauri later, this file is what gets rewritten;
 * everything under src/renderer keeps working untouched.
 */
import { app, BrowserWindow, ipcMain, screen, shell } from "electron"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { LcuConnection, type Phase } from "../src/lcu/connection"
import { championById, currentPatch, type Champion } from "../src/data/champions"
import { createOverlay, showOverlay, hideOverlay, sendOverlay, destroyOverlay } from "./overlay"
import { liveGameStats, liveEvents, livePlayers, liveActivePlayerName, liveOwnSpells } from "../src/live/client"
import { spellByName, type Spell } from "../src/data/spells"
import { abilityBox, NO_NUDGE, type HudNudge } from "../src/data/hud"
import { readHudSettings } from "../src/live/hudConfig"
import { nextObjective } from "../src/data/objectives"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL

/** Everything the interface is allowed to know. Our words, not Riot's. */
export type AppState = {
  client: "waiting" | "attached"
  summoner: { name: string; tag: string; level: number } | null
  phase: Phase | null
  patch: string | null
  select: {
    champion: Champion | null
    role: string | null
    allies: { locked: number; total: number }
    enemies: { locked: number; total: number }
  } | null
  /** Raised for a few seconds when something is about to happen, then cleared.
   *  Null the rest of the time — the overlay is a notification now, not a
   *  panel that lives on screen for the whole match. */
  notice: {
    kind: "dragon" | "elder"
    /** Seconds remaining AT THE MOMENT it was raised; the renderer ticks down. */
    inSeconds: number
    raisedAt: number
    spells: Spell[]
  } | null
  /** Which ability the skill order says to level next, or null for none.
   *  Static advice: it is the order we already publish for this champion. */
  levelHint: "Q" | "W" | "E" | "R" | null
  /** Where the ability bar is, derived rather than hardcoded.
   *
   *  `scale` is the player's own HUD SCALE slider, read out of the game's
   *  config; the layout model turns it into pixels. `nudge` is a residual
   *  correction in box widths for what the model cannot see — an unusual aspect
   *  ratio, or an install whose config we failed to find. */
  hud: { scale: number; nudge: HudNudge; source: string | null }
}

let state: AppState = {
  client: "waiting",
  summoner: null,
  phase: null,
  patch: null,
  select: null,
  notice: null,
  levelHint: null,
  hud: { scale: 1, nudge: { ...NO_NUDGE }, source: null },
}

let win: BrowserWindow | null = null

function push(patch: Partial<AppState>): void {
  const before = state.phase
  state = { ...state, ...patch }
  win?.webContents.send("state", state)
  sendOverlay("state", state)

  // The overlay is only ever on screen during a match. Tying it to the phase
  // rather than to a toggle means there is no state where it is left hanging
  // over the client, which is the thing that makes overlays feel invasive.
  if (state.phase !== before) {
    // The overlay is no longer tied to the phase — only a notice puts it on
    // screen. The phase just decides whether we are watching for one.
    if (state.phase === "InProgress" || state.phase === "Reconnect") startGameClock()
    else stopGameClock()
  }
}

// ── the League connection ──────────────────────────────────────────────────

const lcu = new LcuConnection({
  onConnect: async () => {
    // Anything that throws in here used to vanish: the promise rejected, the
    // state stayed "waiting", and the window said "Open League" with the client
    // plainly running. A failure has to be visible, not silent.
    const [summoner, phase, patchVersion] = await Promise.all([
      lcu.currentSummoner().catch((e) => { console.error("[lcu] summoner:", e?.message); return null }),
      lcu.phase().catch((e) => { console.error("[lcu] phase:", e?.message); return null }),
      currentPatch().catch(() => null),
    ])
    push({ client: "attached", summoner, phase, patch: patchVersion })

    // Pull what is already true. LCU events only fire on CHANGES, so attaching
    // mid-select would otherwise leave the window blank until someone locked in.
    if (phase === "ChampSelect") await readSelect(await lcu.champSelect())
  },

  onDisconnect: () => push({ client: "waiting", summoner: null, phase: null, select: null }),

  onEvent: (e) => {
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      const phase = e.data as Phase
      push({ phase, ...(phase === "ChampSelect" ? {} : { select: null }) })
      return
    }
    if (e.uri === "/lol-champ-select/v1/session") void readSelect(e.data)
  },
})

async function readSelect(data: unknown): Promise<void> {
  const s = data as any
  if (!s?.myTeam) return push({ select: null })

  const me = s.myTeam.find((p: any) => p.cellId === s.localPlayerCellId)
  if (!me) return push({ select: null })

  const locked = (t: any[]) => t.filter((p) => p.championId > 0).length
  const theirTeam = s.theirTeam ?? []

  push({
    select: {
      champion: await championById(me.championId),
      // Empty in customs and blind pick — the client only fills it for queues
      // that assign roles, so the interface has to cope with not knowing.
      role: me.assignedPosition || null,
      allies: { locked: locked(s.myTeam), total: s.myTeam.length },
      enemies: { locked: locked(theirTeam), total: theirTeam.length },
    },
  })
}

// ── window ─────────────────────────────────────────────────────────────────

/* ── the in-game clock ─────────────────────────────────────────────────────
   The 2999 API has no event stream, so this polls — but only while a match is
   running, and it stops the moment one ends.

   The overlay is raised for a few seconds and then dropped. An overlay that
   sits on screen for forty minutes stops being read after the first two, and
   is in the way for the other thirty-eight. */
const NOTIFY_LEAD = 90        // seconds before the spawn — the "1:30" mark
const NOTICE_MS = 9_000       // how long it stays up
const POLL_MS = 2_000

/** TEMPORARY, for working on the overlay's design.
 *
 *  With this on, a notice never expires and one is raised as soon as a match
 *  starts, so the card can be looked at and adjusted without waiting for a
 *  dragon and then losing it nine seconds later.
 *
 *  Set it back to false before this ships: an overlay that never leaves is the
 *  exact thing the notification shape was chosen to avoid. */
const PIN_OVERLAY = true

let tick: ReturnType<typeof setInterval> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
/** The spawn we have already announced, on the game clock, so one dragon
 *  produces one notice rather than one per poll. */
let announced: number | null = null
let ownSpells: Spell[] = []

async function readOwnSpells(): Promise<void> {
  if (ownSpells.length) return
  const name = await liveActivePlayerName()
  if (!name) return
  const pair = await liveOwnSpells(name)
  if (!pair) return
  const resolved = await Promise.all(pair.map((n) => spellByName(n).catch(() => null)))
  ownSpells = resolved.filter((x): x is Spell => x !== null)
}

function dropNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = null
  push({ notice: null })
  hideOverlay()
}

function raiseNotice(kind: "dragon" | "elder", inSeconds: number): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  push({ notice: { kind, inSeconds, raisedAt: Date.now(), spells: ownSpells } })
  showOverlay()
  if (!PIN_OVERLAY) noticeTimer = setTimeout(dropNotice, NOTICE_MS)
}

async function readObjective(): Promise<void> {
  const stats = await liveGameStats()
  if (!stats) return

  void readOwnSpells()

  const [events, players] = await Promise.all([liveEvents(), livePlayers()])
  const next = nextObjective(events, stats.gameTime, players ?? [])
  if (!next) return

  // Absolute spawn time on the game clock — stable across polls, unlike the
  // remaining seconds, so it identifies THIS spawn and not a moment.
  const spawnAt = Math.round(stats.gameTime + next.inSeconds)

  if (PIN_OVERLAY) {
    // Keep it on screen and keep the number honest — it still shows the real
    // time to the real next objective, just without ever going away.
    raiseNotice(next.kind, next.inSeconds)
    return
  }

  if (
    next.inSeconds <= NOTIFY_LEAD &&
    next.inSeconds > 0 &&
    announced !== spawnAt
  ) {
    announced = spawnAt
    raiseNotice(next.kind, next.inSeconds)
  }
}

function startGameClock(): void {
  if (tick) return
  announced = null
  ownSpells = []
  void readObjective()
  tick = setInterval(() => void readObjective(), POLL_MS)
}

function stopGameClock(): void {
  if (tick) clearInterval(tick)
  tick = null
  announced = null
  ownSpells = []
  dropNotice()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 980,
    height: 620,
    minWidth: 760,
    minHeight: 520,
    show: false,
    // Frameless with our own title bar: a native chrome bar on a dark HUD reads
    // like two applications stacked on each other.
    frame: false,
    backgroundColor: "#040A0C",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once("ready-to-show", () => win?.show())

  // External links open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, "../dist/index.html"))
}

// ── ipc ────────────────────────────────────────────────────────────────────

ipcMain.handle("state:get", () => state)
ipcMain.on("win:minimise", () => win?.minimize())
ipcMain.on("win:close", () => win?.close())
// Development affordance: seeing the overlay should not require a live match.
// Development affordance: raise a notice on demand, because waiting for a real
// dragon every time the layout changes is not a workable loop.
ipcMain.on("hud:calibrate", (_e, patch: Partial<HudNudge>) => {
  const nudge = { ...state.hud.nudge, ...patch }
  push({ hud: { ...state.hud, nudge } })
  // Logged so an alignment done by eye on the real screen can be read back and
  // folded into the model as a new default, instead of living on one machine.
  console.log("[hud] nudge x=%s y=%s size=%s", nudge.x.toFixed(2), nudge.y.toFixed(2), nudge.size.toFixed(2))
})
ipcMain.on("hud:hint", (_e, ability: "Q" | "W" | "E" | "R" | null) => {
  push({ levelHint: ability })
  // The outline lives in the overlay window, so that window has to be on screen
  // for it to be visible at all.
  if (ability) showOverlay()
})

ipcMain.on("overlay:report", (_e, info: { w: number; h: number; dpr: number }) => {
  const d = screen.getPrimaryDisplay()
  console.log(
    "[hud] overlay viewport %dx%d dpr=%s | display bounds %dx%d at (%d,%d) scale=%s | physical %dx%d",
    info.w, info.h, info.dpr,
    d.bounds.width, d.bounds.height, d.bounds.x, d.bounds.y, d.scaleFactor,
    Math.round(d.bounds.width * d.scaleFactor), Math.round(d.bounds.height * d.scaleFactor)
  )
  const box = abilityBox("Q", { width: info.w, height: info.h }, state.hud)
  console.log(
    "[hud] scale=%s → Q drawn at css (%d,%d) %dpx → physical (%d,%d) %dpx",
    state.hud.scale,
    Math.round(box.left), Math.round(box.top), Math.round(box.size),
    Math.round(box.left * info.dpr), Math.round(box.top * info.dpr), Math.round(box.size * info.dpr)
  )
})

ipcMain.on("overlay:preview", (_e, on: boolean) => {
  if (on) raiseNotice("dragon", NOTIFY_LEAD)
  else dropNotice()
})

app.whenReady().then(async () => {
  createWindow()
  createOverlay(join(__dirname, "preload.mjs"))

  // Read the player's own HUD scale before anything is drawn over the game, so
  // the first frame is already in the right place rather than being corrected
  // afterwards. A missing config is not fatal — the default stands.
  const hud = await readHudSettings()
  push({ hud: { ...state.hud, scale: hud.globalScale, source: hud.source } })

  await lcu.start()
})

app.on("before-quit", () => { stopGameClock(); destroyOverlay() })

app.on("window-all-closed", () => {
  lcu.stop()
  destroyOverlay()
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
