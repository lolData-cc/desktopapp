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
import { dirname, join, resolve } from "node:path"
import { LcuConnection, type Phase } from "../src/lcu/connection"
import { championById, currentPatch, type Champion } from "../src/data/champions"
import { createOverlay, showOverlay, hideOverlay, sendOverlay, destroyOverlay } from "./overlay"
import { ensureProtocol } from "./protocol"
import { createSplash, dismissSplash } from "./splash"
import { canUpdate, checkForUpdate, downloadUpdate, initUpdater, installUpdate, type UpdateState } from "./updater"
import { importPage, pageName, type BuildPage } from "../src/lcu/runes"
import { championRunes, type RuneVariant } from "../src/data/runeSource"
import { chosenFor, rememberChoice, signatureOf, readSession, writeSession, type Session } from "./prefs"
import { askAi, type ChatMessage } from "../src/data/ai"
import { recentMatches, rankedSummary, type Match, type RankedSummary } from "../src/lcu/history"
import { linkFromArgv, linkKind, parseAuthLink, parseRuneLink, PROTOCOL } from "../src/lcu/deepLink"
import { liveGameStats, liveEvents, livePlayers, liveActivePlayerName } from "../src/live/client"
import { abilityBox, NO_NUDGE, type HudNudge } from "../src/data/hud"
import { readHudSettings } from "../src/live/hudConfig"
import { dragonTally, nextObjective, type DragonElement, type DragonTally } from "../src/data/objectives"
import { teamGold, type TeamGold } from "../src/data/teamGold"
import { warmItemCosts } from "../src/data/itemCost"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL

/** Everything the interface is allowed to know. Our words, not Riot's. */
export type AppState = {
  client: "waiting" | "attached"
  summoner: { name: string; tag: string; level: number; puuid: string; iconId: number } | null
  /** Solo queue standing, or the client's highest entry when there is no solo
   *  rank. Null for an unranked account, which is a state and not a failure. */
  ranked: RankedSummary | null
  /** Recent games, read from the client rather than from our own API: local,
   *  instant, and needing no account. */
  matches: Match[] | null
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
    /** Which dragon is coming, when that is knowable at all. */
    element: DragonElement | null
    /** Who has taken which drakes so far. */
    tally: DragonTally
  } | null
  /** What each side is carrying, summed from the inventories the scoreboard
   *  shows. Null outside a game. */
  gold: TeamGold | null
  /** Which ability the skill order says to level next, or null for none.
   *  Static advice: it is the order we already publish for this champion. */
  levelHint: "Q" | "W" | "E" | "R" | null
  /** Every page loldata publishes for the picked champion — the same five the
   *  site offers — and which one is selected. Null until a champion is locked
   *  in. */
  runes: {
    variants: RuneVariant[]
    /** Defaults to the most played, unless this player already chose another
     *  for this champion, here or on the website. */
    chosen: number
    /** True when `chosen` came from a previous choice rather than the default,
     *  so the interface can say so instead of looking arbitrary. */
    remembered: boolean
    pageName: string
  } | null
  /** What happened the last time the player asked to import it. */
  runeImport:
    | { state: "idle" }
    | { state: "working" }
    | { state: "done"; name: string; replaced: boolean }
    | { state: "no-room"; pages: { id: number; name: string }[] }
    | { state: "error"; message: string }
  /** The signed-in lolData account, WITHOUT its token — the renderer never
   *  needs the credential and therefore never gets it. */
  account: { email: string | null; tier: string | null } | null
  /** Version, and whether a newer one is waiting. Nothing downloads or
   *  restarts without the player pressing something. */
  update: UpdateState
  /** False in development, where there is no packaged app to replace. */
  canUpdate: boolean
  /** Debug only: hold the overlay on screen instead of letting it expire.
   *  Runtime rather than a build constant, so the notification behaviour can be
   *  inspected without a rebuild — and so it can never be left on by accident
   *  in a shipped binary. */
  pinned: boolean
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
  ranked: null,
  matches: null,
  phase: null,
  patch: null,
  select: null,
  notice: null,
  gold: null,
  levelHint: null,
  runes: null,
  runeImport: { state: "idle" },
  account: null,
  update: { state: "idle", version: app.getVersion() },
  canUpdate: false,
  pinned: false,
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
    else {
      stopGameClock()
      // Coming out of a game is exactly when the history has changed.
      if (before === "InProgress" || before === "PreEndOfGame" || before === "EndOfGame") {
        void readProfile()
      }
    }
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

    // The profile and history are not needed to attach, so they load after —
    // the window should show something the moment the client is there.
    void readProfile()

    // Pull what is already true. LCU events only fire on CHANGES, so attaching
    // mid-select would otherwise leave the window blank until someone locked in.
    if (phase === "ChampSelect") await readSelect(await lcu.champSelect())
  },

  onDisconnect: () =>
    push({ client: "waiting", summoner: null, ranked: null, matches: null, phase: null, select: null }),

  onEvent: (e) => {
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      const phase = e.data as Phase
      push({ phase, ...(phase === "ChampSelect" ? {} : { select: null }) })
      return
    }
    if (e.uri === "/lol-champ-select/v1/session") void readSelect(e.data)
  },
})

/** Cancels a fetch still in flight when the pick changes again. */
let runeFetch: AbortController | null = null

async function readRunes(champion: Champion | null, role: string | null): Promise<void> {
  runeFetch?.abort()
  if (!champion) return push({ runes: null, runeImport: { state: "idle" } })

  const ctl = new AbortController()
  runeFetch = ctl
  const suggestion = await championRunes(champion.key, champion.name, role, ctl.signal).catch(() => null)
  if (ctl.signal.aborted) return
  if (!suggestion) return push({ runes: null, runeImport: { state: "idle" } })

  // Matched by the runes themselves, not by position: variant order is a
  // popularity ranking and it moves between patches, so a stored index would
  // silently start pointing at a different page.
  const want = await chosenFor(champion.name)
  const found = want ? suggestion.variants.findIndex((v) => signatureOf(v.page) === want) : -1

  push({
    runes: {
      variants: suggestion.variants,
      chosen: found >= 0 ? found : 0,
      remembered: found >= 0,
      pageName: pageName(champion.name, state.patch ?? ""),
    },
    runeImport: { state: "idle" },
  })
}

/**
 * Rank and recent games.
 *
 * Both are read from the client, and both are allowed to fail quietly: a fresh
 * account has no rank and no history, which is a state to display rather than
 * an error to raise.
 */
async function readProfile(): Promise<void> {
  const summoner = state.summoner
  if (!summoner?.puuid) return

  const [ranked, matches] = await Promise.all([
    rankedSummary(lcu).catch(() => null),
    recentMatches(lcu, summoner.puuid, 20).catch(() => []),
  ])
  push({ ranked, matches })
}

async function readSelect(data: unknown): Promise<void> {
  const s = data as any
  if (!s?.myTeam) return push({ select: null })

  const me = s.myTeam.find((p: any) => p.cellId === s.localPlayerCellId)
  if (!me) return push({ select: null })

  const locked = (t: any[]) => t.filter((p) => p.championId > 0).length
  const theirTeam = s.theirTeam ?? []

  const champion = await championById(me.championId)
  const role = me.assignedPosition || null
  // Only refetch when the pick actually changed — champ select emits a session
  // update on every hover, timer tick and summoner swap.
  if (champion?.key !== state.select?.champion?.key) void readRunes(champion, role)

  push({
    select: {
      champion,
      // Empty in customs and blind pick — the client only fills it for queues
      // that assign roles, so the interface has to cope with not knowing.
      role,
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

/** How long the debug button holds a demo notice up. Shorter than a real one
 *  on purpose — it is for checking the animation, not for reading. */
const DEMO_MS = 5_000

/** Must outlast .ds-out in index.css (600ms) plus a frame or two.
 *
 *  The window is what actually disappears, and hiding it the moment the notice
 *  clears cut the exit animation off at frame one — the card was animating out
 *  on a window nobody could see, so it simply vanished. The two are coupled:
 *  if that CSS duration changes, this changes with it. */
const EXIT_MS = 660

let tick: ReturnType<typeof setInterval> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
/** The spawn we have already announced, on the game clock, so one dragon
 *  produces one notice rather than one per poll. */
let announced: number | null = null

let hideTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Whether the overlay window should be on screen at all.
 *
 * Driven by CONTENT rather than by one feature. It used to be raised and
 * dropped by the dragon notice alone, so anything else drawn in that window —
 * the gold bar, the ability outline — could only appear during a notification,
 * which is not when they are wanted.
 */
function overlayWanted(): boolean {
  return state.notice !== null || state.gold !== null || state.levelHint !== null
}

function syncOverlay(): void {
  if (overlayWanted()) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    showOverlay()
  } else if (!hideTimer) {
    // Delayed, so a notice's exit animation has somewhere to play.
    hideTimer = setTimeout(() => { hideTimer = null; hideOverlay() }, EXIT_MS)
  }
}

function dropNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = null
  push({ notice: null })

  // Clearing the notice only STARTS the exit, and the window may still be
  // wanted for the gold bar — so this asks what should be on screen rather
  // than assuming nothing is.
  syncOverlay()
}

function raiseNotice(
  kind: "dragon" | "elder",
  inSeconds: number,
  element: DragonElement | null,
  tally: DragonTally,
  ms: number = NOTICE_MS
): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  push({ notice: { kind, inSeconds, raisedAt: Date.now(), element, tally } })

  // A notice arriving during another's exit cancels the pending hide, so the
  // window does not disappear out from under the new one.
  syncOverlay()
  if (!state.pinned) noticeTimer = setTimeout(dropNotice, ms)
}

async function readObjective(): Promise<void> {
  const stats = await liveGameStats()
  if (!stats) return

  const [events, players, me] = await Promise.all([
    liveEvents(),
    livePlayers(),
    liveActivePlayerName().catch(() => null),
  ])
  const next = nextObjective(events, stats.gameTime, players ?? [], stats.mapTerrain)
  if (!next) return

  const tally = dragonTally(events, players ?? [], me)

  // Same read, no extra request: /playerlist already carries every inventory.
  const myTeam = (players ?? []).find((p) => p.riotId === me || p.summonerName === me)?.team ?? null
  const gold = await teamGold(players ?? [], myTeam).catch(() => null)
  if (gold) {
    push({ gold })
    syncOverlay()
  }

  // Absolute spawn time on the game clock — stable across polls, unlike the
  // remaining seconds, so it identifies THIS spawn and not a moment.
  const spawnAt = Math.round(stats.gameTime + next.inSeconds)

  if (state.pinned) {
    // Held open for inspection, but the number stays honest: it is still the
    // real time to the real next objective, just without going away.
    raiseNotice(next.kind, next.inSeconds, next.element, tally)
    return
  }

  if (
    next.inSeconds <= NOTIFY_LEAD &&
    next.inSeconds > 0 &&
    announced !== spawnAt
  ) {
    announced = spawnAt
    raiseNotice(next.kind, next.inSeconds, next.element, tally)
  }
}

function startGameClock(): void {
  if (tick) return
  // The price table is 1MB and only needed once; fetch it as the game starts
  // rather than in the middle of the first scoreboard read.
  warmItemCosts()
  announced = null
  void readObjective()
  tick = setInterval(() => void readObjective(), POLL_MS)
}

function stopGameClock(): void {
  if (tick) clearInterval(tick)
  tick = null
  push({ gold: null })
  syncOverlay()
  announced = null
  dropNotice()
}

function createWindow(): void {
  win = new BrowserWindow({
    // Room for a nav rail and a list of matches beside it. The old 980x620 was
    // sized for a single panel and left the section layout cramped.
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 700,
    icon: join(__dirname, "../build/icon.png"),
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

  // Deliberately NOT shown here. The splash decides when, so the two are
  // handed over in the same moment instead of one appearing over the other.
  win.once("ready-to-show", () =>
    dismissSplash(() => {
      win?.show()
      win?.focus()
    })
  )

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
  syncOverlay()
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

/** Debug: hold the overlay open, or let it behave like a notification again. */
async function applyPage(champion: string, patch: string, page: BuildPage): Promise<void> {
  push({ runeImport: { state: "working" } })
  try {
    const result = await importPage(lcu, champion, patch, page)
    console.log("[runes] %s → %s", champion, result.ok ? "imported" : result.reason)
    if (result.ok) {
      // Remember what was actually written, whether the button was here or on
      // the website. This is the whole point: champ select must not then put
      // the most played page back over a deliberate choice.
      await rememberChoice(champion, signatureOf(page))
      push({ runeImport: { state: "done", name: pageName(champion, patch), replaced: result.replaced } })
    } else if (result.reason === "no-room") {
      push({ runeImport: { state: "no-room", pages: result.pages } })
    } else {
      push({ runeImport: { state: "error", message: result.message } })
    }
  } catch (e) {
    push({ runeImport: { state: "error", message: (e as Error)?.message ?? "import failed" } })
  }
}

ipcMain.handle("profile:refresh", async () => { await readProfile() })

// ── updates ────────────────────────────────────────────────────────────────

ipcMain.handle("update:check", async () => { await checkForUpdate() })
ipcMain.handle("update:download", async () => { await downloadUpdate() })
ipcMain.on("update:install", () => installUpdate())

/** Restart the app itself. Distinct from installing an update: nothing is
 *  replaced, the process simply comes back — which is how the boot animation
 *  gets watched without reinstalling anything.
 *
 *  quit() rather than exit(): before-quit is what stops the game clock and
 *  destroys the overlay, and skipping it would leave a click-through window
 *  over the game with nothing behind it. */
/**
 * Debug: put the gold bar on screen without a game.
 *
 * Cycles rather than toggles — the bar has four readings worth seeing (ahead,
 * behind, level, and a scoreboard that came back short) and a single fixed
 * pair of numbers would only ever prove one of them draws.
 *
 * A real poll overwrites this the moment a game is running, which is correct:
 * fake numbers must never survive next to true ones.
 */
const GOLD_DEMOS: (TeamGold | null)[] = [
  { ours: 15250, theirs: 7700, oursCounted: 5, theirsCounted: 5 },   // well ahead
  { ours: 21400, theirs: 23900, oursCounted: 5, theirsCounted: 5 },  // behind
  { ours: 12050, theirs: 12050, oursCounted: 5, theirsCounted: 5 },  // level
  { ours: 3400, theirs: 5100, oursCounted: 4, theirsCounted: 5 },    // short read
  null,                                                              // off
]
let goldDemo = -1

ipcMain.on("gold:demo", () => {
  goldDemo = (goldDemo + 1) % GOLD_DEMOS.length
  push({ gold: GOLD_DEMOS[goldDemo] ?? null })
  syncOverlay()
})

ipcMain.on("app:relaunch", () => {
  app.relaunch()
  app.quit()
})

// ── account ────────────────────────────────────────────────────────────────

/** Signing in happens in the BROWSER, never here. This app must never see a
 *  password; the site hands back a session over loldata://auth instead. */
ipcMain.on("account:signin", () => {
  void shell.openExternal(`${SITE}/login?desktop=1`)
})

ipcMain.handle("account:signout", async () => { await setSession(null) })

ipcMain.handle("ai:ask", async (_e, messages: ChatMessage[]) => {
  return askAi(session?.token ?? null, messages)
})

ipcMain.on("shell:open", (_e, url: string) => {
  // Only ever http(s), and only ever outward: this is reachable from the
  // renderer, and a bare shell.openExternal would happily run a local file.
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
})

ipcMain.on("runes:choose", (_e, index: number) => {
  const r = state.runes
  if (!r || index < 0 || index >= r.variants.length) return
  // Picking is not choosing yet — the choice is what gets imported, so this
  // does not overwrite a remembered preference until the player commits.
  push({ runes: { ...r, chosen: index }, runeImport: { state: "idle" } })
})

ipcMain.handle("runes:import", async () => {
  const r = state.runes
  const champ = state.select?.champion
  if (!r || !champ) return
  await applyPage(champ.name, state.patch ?? "", r.variants[r.chosen]!.page)
})

/** Held in the main process only. The renderer gets the ACCOUNT, never this. */
let session: Session | null = null

const SITE = "https://loldata.cc"

async function setSession(next: Session | null): Promise<void> {
  session = next
  await writeSession(next)
  push({ account: next ? { email: next.email, tier: next.tier } : null })
}

/**
 * A loldata:// link from the website.
 *
 * The window comes forward first, and deliberately: this was started somewhere
 * else, so the result has to be visible where it lands. An import that happens
 * silently in a background window is indistinguishable from one that failed.
 */
async function handleLink(raw: string | null): Promise<void> {
  if (!raw) return

  if (linkKind(raw) === "auth") {
    const auth = parseAuthLink(raw)
    // Deliberately says only whether it parsed. The token must not reach a log.
    console.log("[link] auth received, valid=%s", !!auth)
    if (auth) {
      await setSession(auth)
      if (win) { win.show(); win.focus() }
    }
    return
  }

  const link = parseRuneLink(raw)
  console.log("[link] received, valid=%s champion=%s", !!link, link?.champion ?? "-")
  if (!link) {
    push({ runeImport: { state: "error", message: "that link was not a valid rune page" } })
    return
  }

  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  // The site knows the patch it was showing; ours is the fallback so the page
  // is never named with an empty one.
  await applyPage(link.champion, link.patch ?? state.patch ?? "", link.page)
}

ipcMain.on("overlay:pin", (_e, on: boolean) => {
  push({ pinned: on })
  if (on) void readObjective()
  else if (state.notice) noticeTimer = setTimeout(dropNotice, NOTICE_MS)
})

/** Debug: raise one for a few seconds. Uses the REAL objective and tally when a
 *  match is running, so what gets checked is the actual card and not a mockup;
 *  falls back to a representative one when there is no game to read. */
ipcMain.on("overlay:demo", async () => {
  const stats = await liveGameStats()
  if (stats) {
    const [events, players, me] = await Promise.all([
      liveEvents(),
      livePlayers(),
      liveActivePlayerName().catch(() => null),
    ])
    const next = nextObjective(events, stats.gameTime, players ?? [], stats.mapTerrain)
    if (next) {
      raiseNotice(next.kind, next.inSeconds, next.element, dragonTally(events, players ?? [], me), DEMO_MS)
      return
    }
  }
  raiseNotice("dragon", NOTIFY_LEAD, "Fire", { ours: ["Water", "Air", "Fire"], theirs: ["Earth"] }, DEMO_MS)
})

/**
 * Windows hands a loldata:// link to a NEW process. Without the single-instance
 * lock that means a second app every time the website's button is pressed, each
 * with its own client connection — so the second one forwards the link to the
 * first and exits.
 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Quit, and do NOTHING else. app.quit() does not stop whenReady from firing
  // first, so a second instance launched by a link used to run its own startup
  // on the way out — reading the same URL from its own argv and importing it a
  // second time, concurrently with the instance it had just forwarded to. Two
  // delete-and-create cycles racing over one rune page.
  app.quit()
} else {
  app.on("second-instance", (_e, argv) => {
    console.log("[link] second-instance argv=%s", JSON.stringify(argv))
    void handleLink(linkFromArgv(argv))
  })
  // macOS delivers it as an event instead of an argument.
  app.on("open-url", (e, url) => {
    e.preventDefault()
    void handleLink(url)
  })

  app.whenReady().then(async () => {
    // First, and before anything that can be slow: the window that says the app
    // is starting has to be the first thing on screen, not the last. Everything
    // below it — the protocol claim, the HUD read, the client connection — is
    // work the user should be watching an animation through, not a blank
    // desktop.
    createSplash()

    // Claim loldata:// so the website's button has something to reach. In dev the
    // executable is Electron itself, so the script path has to travel with it or
    // the link would launch a bare Electron with nothing loaded.
    // Development runs Electron with the app directory as an argument, so that
    // has to travel with the association or the link would launch a bare Electron
    // with nothing loaded.
    const dev = process.defaultApp && process.argv.length >= 2
    const launch = dev
      ? { exe: process.execPath, args: [resolve(process.argv[1]!)] }
      : { exe: process.execPath, args: [] }

    const claimed = dev
      ? app.setAsDefaultProtocolClient(PROTOCOL, launch.exe, launch.args)
      : app.setAsDefaultProtocolClient(PROTOCOL)

    const result = await ensureProtocol(PROTOCOL, claimed, launch)
    console.log(
      "[link] %s:// ok=%s via=%s%s",
      PROTOCOL, result.ok, result.via, result.command ? ` cmd=${result.command}` : ""
    )

    createWindow()
    createOverlay(join(__dirname, "preload.mjs"))

    // Read the player's own HUD scale before anything is drawn over the game, so
    // the first frame is already in the right place rather than being corrected
    // afterwards. A missing config is not fatal — the default stands.
    const hud = await readHudSettings()
    push({ hud: { ...state.hud, scale: hud.globalScale, source: hud.source } })

    // A session from a previous run, so signing in survives a restart.
    const saved = await readSession()
    if (saved) await setSession(saved)

    // One check at startup, then only when asked. Nothing downloads by itself.
    const initial = initUpdater((update) => push({ update }))
    push({ update: initial, canUpdate: canUpdate() })
    void checkForUpdate()

    await lcu.start()

    // Launched BY a link rather than sent one: the URL is already in our argv.
    console.log("[link] own argv=%s", JSON.stringify(process.argv))
    void handleLink(linkFromArgv(process.argv))
  })
}


app.on("before-quit", () => { stopGameClock(); destroyOverlay() })

app.on("window-all-closed", () => {
  lcu.stop()
  destroyOverlay()
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
