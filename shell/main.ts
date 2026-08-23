/**
 * The shell.
 *
 * It owns the window and the League connection, and pushes a single snapshot of
 * OUR state to the renderer. The renderer never touches the LCU, never sees a
 * client URI, and never holds a credential — which is what keeps the shell
 * swappable. If this becomes Tauri later, this file is what gets rewritten;
 * everything under src/renderer keeps working untouched.
 */
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from "electron"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { LcuConnection, type Phase } from "../src/lcu/connection"
import { championById, championByName, currentPatch, type Champion } from "../src/data/champions"
import { createOverlay, showOverlay, hideOverlay, sendOverlay, destroyOverlay } from "./overlay"
import { ensureProtocol } from "./protocol"
import { createSplash, dismissSplash } from "./splash"
import { canUpdate, checkForUpdate, downloadUpdate, initUpdater, installUpdate, type UpdateState } from "./updater"
import { importPage, pageName, type BuildPage } from "../src/lcu/runes"
import { championRunes, type RuneVariant } from "../src/data/runeSource"
import { chosenFor, rememberChoice, signatureOf, readSession, writeSession, type Session,
         listBuilds, buildFor, saveBuild, setBuildEnabled, deleteBuild, type BuildProfile,
         chosenAll, runesBackfilledFor, markRunesBackfilled,
         readSettings, writeSettings, DEFAULT_SETTINGS, type AppSettings } from "./prefs"
import { askAi, type ChatMessage } from "../src/data/ai"
import { recentMatches, rankedSummary, type Match, type RankedSummary } from "../src/lcu/history"
import { linkFromArgv, linkKind, parseAuthLink, parseBuildLink, parseRuneLink, PROTOCOL } from "../src/lcu/deepLink"
import { liveGameStats, liveEvents, livePlayers, liveActivePlayerName, liveOwnPurse,
         type GameEvent, type PlayerSlot } from "../src/live/client"
import { abilityBox, NO_NUDGE, type HudNudge } from "../src/data/hud"
import { readHudSettings } from "../src/live/hudConfig"
import { dragonTally, nextObjective, type DragonElement, type DragonTally } from "../src/data/objectives"
import { teamGold, type TeamGold } from "../src/data/teamGold"
import { warmItemCosts, inventoryValue } from "../src/data/itemCost"
import { costToComplete, warmItemTree } from "../src/data/affordability"
import { classifyAll, ccCarriers, CC_HEAVY_AT, type ChampInfo } from "../src/data/champClass"
import { bootsIds, allItems } from "../src/data/itemCatalog"
import { nextBest, inventoryKey, type NextBest } from "../src/data/smartBuild"
import { buildForComp, compShapes, describeShapes, type BuildSlot, type CompShape } from "../src/data/compAdvice"

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
    kind: "dragon" | "elder" | "item" | "boots" | "build"
    /** Seconds remaining AT THE MOMENT it was raised; the renderer ticks down. */
    inSeconds: number
    raisedAt: number
    /** Which dragon is coming, when that is knowable at all. */
    element: DragonElement | null
    /** Who has taken which drakes so far. Empty for an item notice. */
    tally: DragonTally
    /** Set only on an item notice: what just became affordable. */
    item?: {
      id: number; name: string; cost: number; index: number; total: number
      /** Worked out live from the inventory rather than read off the plan. */
      smart?: boolean
      /** How specific that answer was, when it was a live one. */
      cohort?: number
      lift?: number
    }
    boots?: { item: number; name: string; reason: string; keys: number[] }
    build?: {
      items: number[]; shapeLabel: string; cohortGames: number
      /** The plan was set aside mid-game because the actual build diverged. */
      recalibrated?: boolean
      /** What that decision was read from, in the player's own items. */
      note?: string
    }
  } | null
  /** What to build against the team you are actually facing, worked out in
   *  champion select — where the comp is known and there is still time to act
   *  on it. Null until the enemy side has locked in. */
  matchup: {
    slots: BuildSlot[]
    cohortGames: number
    /** The comp shapes the advice was actually narrowed by. */
    applied: CompShape[]
    shapeLabel: string
    /** Enemy champions bringing hard CC, and whether that reaches the
     *  threshold at which tenacity is usually worth it. */
    ccNames: string[]
    /** Champion keys, so the interface can show their faces. */
    ccKeys: number[]
    ccHeavy: boolean
    patch: string
  } | null
  /** Saved builds, one per champion. The enabled ones drive the shop notices. */
  builds: BuildProfile[]
  /** True while the query is running — it takes seconds, and champion select
   *  does not wait. */
  matchupLoading: boolean
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
    | { state: "build-saved"; champion: string; items: number }
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
  hud: { scale: number; nudge: HudNudge; topRight?: HudNudge; source: string | null }
  /** Whether the wide Alt+O bar is being asked for. Sent as a flag so the
   *  top-right readout can use the same gold without being toggled by it. */
  goldBar?: boolean
  settings: AppSettings
  /**
   * The champion we last played, taken from the live game rather than from
   * match history.
   *
   * ⚠️ History is written by the client at its own pace and is only read when
   * the app attaches, so at the moment a game ends `matches[0]` is still the
   * PREVIOUS game. The recap opened on the wrong champion because of exactly
   * that. The board we were just watching knows the right answer with no
   * waiting and no guessing.
   */
  lastPlayed: { championId: string; championKey: number } | null
  /** Everyone in the running game, ours first. Null outside a game. */
  scoreboard: {
    gameTime: number
    ours: LivePlayer[]
    theirs: LivePlayer[]
  } | null
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
  matchup: null,
  matchupLoading: false,
  builds: [],
  gold: null,
  levelHint: null,
  runes: null,
  runeImport: { state: "idle" },
  account: null,
  update: { state: "idle", version: app.getVersion() },
  canUpdate: false,
  pinned: false,
  hud: { scale: 1, nudge: { ...NO_NUDGE }, topRight: { ...NO_NUDGE }, source: null },
  settings: { ...DEFAULT_SETTINGS },
  lastPlayed: null,
  scoreboard: null,
}

let win: BrowserWindow | null = null

function push(patch: Partial<AppState>): void {
  const before = state.phase
  state = { ...state, ...patch }
  win?.webContents.send("state", state)
  // The overlay is told what to DRAW: hiding the bar is a content decision, so
  // the window does not have to be torn down and rebuilt to honour a keypress.
  // The FLAG travels, not a censored copy of the state: the top-right readout
  // wants the same numbers and is not toggled. Withholding data to control
  // presentation is what made the shop notices unreachable earlier.
  sendOverlay("state", {
    ...state,
    goldBar: goldVisible,
    // Withheld here rather than in the overlay, so "off" also means the window
    // is not kept alive for something nobody asked to see.
    gold: state.settings.goldReadout || goldVisible ? state.gold : null,
  })

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

  onDisconnect: () => {
    lastEnemyKey = ""
    push({ client: "waiting", summoner: null, ranked: null, matches: null, phase: null, select: null })
  },

  onEvent: (e) => {
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      const phase = e.data as Phase
      push({
        phase,
        ...(phase === "ChampSelect" ? {} : { select: null }),
        // A scoreboard from the last game is worse than none: it looks live.
        ...(phase === "InProgress" || phase === "Reconnect" ? {} : { scoreboard: null }),
      })
      // The client writes the finished game to history on its own schedule, so
      // one read at the end is a coin toss. Polled until the match we actually
      // played shows up, then stopped.
      if (POST_GAME_PHASES.has(phase)) awaitMatch()
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
const POST_GAME_PHASES = new Set(["WaitingForStats", "PreEndOfGame", "EndOfGame"])

/**
 * Read history until the game just played appears in it.
 *
 * Bounded: eight tries over about half a minute. If the client has not written
 * it by then it is not going to, and the recap shows the champion without the
 * numbers rather than spinning forever.
 */
let awaiting: ReturnType<typeof setTimeout> | null = null

function awaitMatch(tries = 8): void {
  if (awaiting) clearTimeout(awaiting)
  const want = state.lastPlayed?.championKey ?? 0

  const attempt = async (left: number) => {
    await readProfile()
    const got = state.matches?.[0]?.championId ?? -1
    if (!want || got === want || left <= 0) return
    awaiting = setTimeout(() => void attempt(left - 1), 4000)
  }

  void attempt(tries)
}

async function readProfile(): Promise<void> {
  const summoner = state.summoner
  if (!summoner?.puuid) return

  const [ranked, matches] = await Promise.all([
    rankedSummary(lcu).catch(() => null),
    recentMatches(lcu, summoner.puuid, 20).catch(() => []),
  ])
  push({ ranked, matches })
}

/**
 * The build for the team you are about to face, worked out in champion select.
 *
 * Here rather than in game, and deliberately: the comp is already known, there
 * is still time to act on it, and the query takes seconds — which champion
 * select has and a teamfight does not.
 *
 * Recomputed only when the ENEMY side changes. The session fires on every
 * hover, timer tick and summoner swap, and each run is a multi-second query
 * against millions of games.
 */
let matchupFetch: AbortController | null = null
let lastEnemyKey = ""

async function readMatchup(champion: Champion | null, role: string | null, enemyIds: number[]): Promise<void> {
  const key = `${champion?.key ?? 0}:${role ?? ""}:${[...enemyIds].sort().join(",")}`
  if (key === lastEnemyKey) return
  lastEnemyKey = key

  matchupFetch?.abort()
  if (!champion || enemyIds.length < 3) return push({ matchup: null, matchupLoading: false })

  const ctl = new AbortController()
  matchupFetch = ctl
  push({ matchupLoading: true })

  const enemies = await classifyAll(enemyIds).catch(() => [])
  const shapes = compShapes(enemies.map((e) => e.categories))
  const cc = ccCarriers(enemies)

  const advice = await buildForComp(champion.name, role, shapes, ctl.signal).catch(() => null)
  if (ctl.signal.aborted) return

  push({
    matchupLoading: false,
    matchup: advice
      ? {
          slots: advice.slots,
          cohortGames: advice.cohortGames,
          applied: advice.applied,
          shapeLabel: describeShapes(advice.applied),
          ccNames: cc.map((c) => c.name),
          ccKeys: cc.map((c) => c.key),
          // The backend's own threshold, not a new one invented here.
          ccHeavy: cc.length >= CC_HEAVY_AT,
          patch: advice.patch,
        }
      : null,
  })
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

  // Locked-in enemies only: a hovered pick is not a commitment, and querying on
  // every hover would mean a multi-second job per twitch of someone's mouse.
  const enemyIds = theirTeam
    .map((p: any) => Number(p.championId))
    .filter((id: number) => Number.isFinite(id) && id > 0)
  void readMatchup(champion, role, enemyIds)

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
/** The opening build is a LIST, not an alert — six icons need reading time. */
const OPENING_MS = 14_000
/** A recalibration is a change of plan, so it is held like the opening one. */
const RECAL_MS = 11_000
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
/**
 * The gold bar's toggle.
 *
 * ⚠️ Alt+O, not a bare O. globalShortcut takes EXCLUSIVE ownership of whatever
 * it registers, system-wide — a bare letter would mean the key stops reaching
 * every other application, so registering "O" would stop the letter o being
 * typeable anywhere on the machine.
 *
 * Tab, which is what this stands in for, cannot be used at all: registering it
 * would take the scoreboard away from the game, and detecting it WITHOUT
 * registering means polling another process's keyboard state — a keylogger
 * primitive, and precisely the behaviour Vanguard watches for while League is
 * running. The risk there is the player's account, not our API key.
 */
const GOLD_HOTKEY = "Alt+O"
// OFF until asked for. It used to start on, which made Alt+O a key that turned
// the bar OFF first — the opposite of a toggle you reach for to summon it.
let goldVisible = false

function overlayWanted(): boolean {
  // Gold alone is enough now: the top-right readout is permanent during a game,
  // and only the wide Tab bar answers to the hotkey.
  const wantsGold = state.gold !== null && (state.settings.goldReadout || goldVisible)
  return state.notice !== null || wantsGold || state.levelHint !== null
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

/** One gate for every notice, so a switch that is off means SILENCE rather
 *  than "off in most of the places that raise one". */
function noticesAllowed(kind: "dragon" | "elder" | "item" | "boots" | "build"): boolean {
  return kind === "dragon" || kind === "elder"
    ? state.settings.objectiveNotices
    : state.settings.buildNotices
}

function raiseNotice(
  kind: "dragon" | "elder" | "item" | "boots" | "build",
  inSeconds: number,
  element: DragonElement | null,
  tally: DragonTally,
  ms: number = NOTICE_MS,
  item?: {
    id: number; name: string; cost: number; index: number; total: number
    smart?: boolean; cohort?: number; lift?: number
  },
  boots?: { item: number; name: string; reason: string; keys: number[] },
  build?: {
    items: number[]; shapeLabel: string; cohortGames: number
    recalibrated?: boolean; note?: string
  }
): void {
  if (!noticesAllowed(kind)) return
  if (noticeTimer) clearTimeout(noticeTimer)
  push({ notice: { kind, inSeconds, raisedAt: Date.now(), element, tally, item, boots, build } })

  // A notice arriving during another's exit cancels the pending hide, so the
  // window does not disappear out from under the new one.
  syncOverlay()
  if (!state.pinned) noticeTimer = setTimeout(dropNotice, ms)
}

/**
 * The item the active build says to buy next, once it can be bought.
 *
 * Fires ONCE per item. A notification that repeats every two seconds while you
 * stand on the fountain deciding is not a reminder, it is nagging — and the
 * moment worth marking is the crossing, not the state.
 *
 * Owning the item is what advances the build, so buying it silently arms the
 * next one rather than needing anything to be dismissed.
 */
let announcedItems = new Set<number>()
let announcedBoots = false
let announcedOpening = false

/** Tier-2 boots, and the two the enemy comp actually decides between. */
const MERCURYS = 3111
const STEELCAPS = 3047

/**
 * Which boots this comp argues for, once boots have been bought.
 *
 * Tenacity when the enemy brings hard CC — the threshold and the champion list
 * are the backend's own, from champTags.ts, so the app and the AI say the same
 * thing about the same team. Armour when the damage is overwhelmingly physical.
 *
 * Null when neither is true, and that is the common case. A recommendation
 * every game would be a recommendation about nothing.
 */
/**
 * ⚠️ Reads the comp from the LIVE enemy team, not from state.matchup.
 *
 * matchup is worked out during champion select, so it is missing whenever the
 * app was started after the game began — and the boots question is asked
 * exactly once, so a missing comp meant the one chance was spent on silence.
 * The players are on screen; there is no reason to depend on having watched
 * them being picked.
 */
function bootsAdvice(enemies: ChampInfo[]): { item: number; reason: string; keys: number[] } | null {
  const cc = ccCarriers(enemies)
  if (cc.length >= CC_HEAVY_AT) {
    return {
      item: MERCURYS,
      reason: `${cc.length} enemies bring hard CC`,
      keys: cc.map((c) => c.key),
    }
  }

  // Four or more AD is the point at which armour beats everything else; below
  // that the choice is a preference, not a read.
  const ad = enemies.filter((c) => c.categories.includes("AD")).length
  if (ad >= 4) {
    return { item: STEELCAPS, reason: `${ad} enemies deal physical damage`, keys: [] }
  }

  return null
}

async function readBoots(
  inventory: { itemID: number }[],
  enemies: ChampInfo[]
): Promise<void> {
  if (announcedBoots) return

  const boots = await bootsIds().catch(() => new Set<number>())
  const wearing = inventory.find((i) => boots.has(i.itemID))
  if (!wearing) return

  // Nothing to say yet if we cannot see the enemy team — asking once and
  // answering from nothing would burn the single chance this gets.
  if (!enemies.length) return shopLog("boots: worn, but enemy team not readable yet")

  announcedBoots = true          // asked once, whatever the answer

  const advice = bootsAdvice(enemies)
  if (!advice) return shopLog("boots: comp argues for neither tenacity nor armour")
  if (advice.item === wearing.itemID) return shopLog("boots: already wearing the recommendation")

  shopLog("boots: recommending %d because %s", advice.item, advice.reason)

  const cost = await costToComplete(advice.item, inventory, 0).catch(() => null)
  raiseNotice("boots", 0, null, { ours: [], theirs: [] }, NOTICE_MS, undefined, {
    item: advice.item,
    name: cost?.name ?? "Boots",
    reason: advice.reason,
    keys: advice.keys,
  })
}

/**
 * The build for this game, once at the start.
 *
 * Champion select worked it out; this is where it gets said, because the loading
 * screen is when a plan is still a plan. Held for longer than a dragon warning —
 * it is a list to read, not a moment to react to.
 */
function readOpening(): void {
  if (announcedOpening) return
  const m = state.matchup
  if (!m?.slots.length) return

  announcedOpening = true
  raiseNotice("build", 0, null, { ours: [], theirs: [] }, OPENING_MS, undefined, undefined, {
    items: m.slots.map((s) => s.item),
    shapeLabel: m.shapeLabel,
    cohortGames: m.cohortGames,
  })
}

/**
 * Which champion we are actually playing, from the game rather than from champ
 * select.
 *
 * ⚠️ `state.select` is CLEARED the moment the phase leaves ChampSelect, so in a
 * running game it is null — reading the profile from it meant the profile was
 * never consulted in the only place it matters, and the notices silently fell
 * back to the live calculation. The live player list is the source that still
 * exists once the game has started.
 */
async function playingChampion(
  players: { riotId?: string; summonerName?: string; championName?: string }[],
  me: string | null
): Promise<string | null> {
  if (!me) return null
  const mine = players.find((p) => p.riotId === me || p.summonerName === me)
  if (!mine?.championName) return null
  const champ = await championByName(mine.championName).catch(() => null)
  return champ?.slug ?? null
}

/**
 * The live answer, when the plan has been departed from.
 *
 * Null while the player is still following their build — which is the common
 * case and must stay free. The query is asked once per INVENTORY, not once per
 * poll: the answer cannot change until something is bought, and a request every
 * two seconds for the whole game would be indefensible.
 */
let smartCache: { key: string; value: NextBest | null } | null = null
let smartPending = ""
/** The recommendation whose recalibration has already been announced, and when
 *  — so the "purchasable" notice does not immediately paint over the notice
 *  that just explained why the plan changed. */
let recalibrated: { item: number; at: number } | null = null

/** "off Liandry's, Steelcaps and Rylai's" — the items the answer was read from,
 *  so a recalibration says what it noticed rather than just asserting. */
function describeOwned(items: number[]): string {
  if (!items.length) return "your build so far"
  return `${items.length} item${items.length === 1 ? "" : "s"} you have built`
}

async function smartPick(
  profile: BuildProfile,
  inventory: { itemID: number }[]
): Promise<NextBest | null> {
  const finals = new Set((await allItems()).map((i) => i.id))
  const owned = inventory.map((i) => i.itemID).filter((id) => finals.has(id))

  // Following the plan is not a deviation, and needs no second opinion.
  const plan = new Set(profile.items)
  if (!owned.some((id) => !plan.has(id))) return null

  const key = inventoryKey(profile.championId, owned)
  if (smartCache?.key === key) return smartCache.value

  // One request in flight per inventory; the poll would otherwise start a
  // second before the first came back.
  if (smartPending === key) return null
  smartPending = key

  const value = await nextBest(profile.championName, profile.role, owned).catch(() => null)
  smartCache = { key, value }
  smartPending = ""
  return value
}

/** Only when it CHANGES: this runs every poll, and a line a second would bury
 *  everything else in the log. */
let lastShopLog = ""
function shopLog(format: string, ...args: unknown[]): void {
  const line = format + JSON.stringify(args)
  if (line === lastShopLog) return
  lastShopLog = line
  console.log("[shop] " + format, ...args)
}

/**
 * The enemy five, classified, from the running game.
 *
 * Works whether or not we watched champion select, which is the point: an app
 * started at minute ten can still see who it is playing against.
 */
async function enemyChampions(players: PlayerSlot[], myTeam: string | null): Promise<ChampInfo[]> {
  if (!myTeam) return []
  const names = players.filter((p) => p.team !== myTeam).map((p) => p.championName).filter((n): n is string => !!n)
  const keys: number[] = []
  for (const name of names) {
    const champ = await championByName(name).catch(() => null)
    if (champ) keys.push(champ.key)
  }
  return classifyAll(keys).catch(() => [])
}

async function readShop(
  riotId: string | null,
  championId: string | null,
  enemies: ChampInfo[]
): Promise<void> {
  // A saved profile wins over the live calculation: it is a decision the player
  // made, and a query result should not quietly overrule one. Disabled profiles
  // fall through to nothing rather than to the live build — turning a build off
  // means silence, not a different build.
  const saved = championId ? await buildFor(championId).catch(() => null) : null
  if (saved && !saved.enabled) return

  const build = saved?.items.map((item) => ({ item })) ?? state.matchup?.slots
  if (!riotId || !build?.length) return shopLog("no build for %s", championId ?? "unknown champion")

  const purse = await liveOwnPurse(riotId).catch(() => null)
  if (!purse) return shopLog("no purse for %s", riotId)

  // Before every later return. This used to sit after the "already announced"
  // check, so once an item had been announced the boots question stopped being
  // asked at all — two unrelated things sharing one exit.
  void readBoots(purse.items, enemies)

  const owned = new Set(purse.items.map((i) => i.itemID))
  const nextIndex = build.findIndex((s) => !owned.has(s.item))
  if (nextIndex < 0) return shopLog("build finished")

  // ── SMART BUILD ────────────────────────────────────────────────────────
  // A plan the player has stopped following is answering a question nobody is
  // asking. When they have bought something that is not in it, the plan is set
  // aside and the data is asked about the inventory they ACTUALLY have.
  if (saved && state.settings.smartBuild) {
    const smart = await smartPick(saved, purse.items).catch(() => null)
    if (smart) {
      // Said ONCE per change of answer: the plan you saved is no longer what
      // you are being told, and that is worth a sentence rather than a silent
      // substitution.
      if (recalibrated?.item !== smart.item) {
        recalibrated = { item: smart.item, at: Date.now() }
        shopLog("recalibrated to %s (%d games)", smart.name, smart.cohort)
        raiseNotice("build", 0, null, { ours: [], theirs: [] }, RECAL_MS, undefined, undefined, {
          items: [smart.item],
          shapeLabel: describeOwned(smart.applied),
          cohortGames: smart.cohort,
          recalibrated: true,
          note: smart.lift >= 0 ? `+${smart.lift.toFixed(1)}pp` : `${smart.lift.toFixed(1)}pp`,
        })
        return
      }

      // Let the recalibration finish being read before replacing it.
      if (Date.now() - (recalibrated?.at ?? 0) < RECAL_MS) return

      if (announcedItems.has(smart.item)) return
      const smartCost = await costToComplete(smart.item, purse.items, purse.gold).catch(() => null)
      if (!smartCost) return shopLog("no price for smart item %d", smart.item)

      shopLog("smart: %s needs %dg, have %dg (from %d games)%s",
        smart.name, smartCost.remaining, purse.gold, smart.cohort,
        smartCost.affordable ? " → NOTIFY" : "")
      if (!smartCost.affordable) return

      announcedItems.add(smart.item)
      raiseNotice("item", 0, null, { ours: [], theirs: [] }, NOTICE_MS, {
        id: smart.item,
        name: smartCost.name,
        cost: smartCost.remaining,
        index: 0,
        total: 0,
        smart: true,
        cohort: smart.cohort,
        lift: smart.lift,
      })
      return
    }
  }

  const next = build[nextIndex]!
  if (announcedItems.has(next.item)) return

  const cost = await costToComplete(next.item, purse.items, purse.gold).catch(() => null)
  if (!cost) return shopLog("no price for item %d", next.item)

  shopLog("%s slot %d/%d: %s needs %dg, have %dg%s",
    saved ? "profile" : "live build", nextIndex + 1, build.length,
    cost.name, cost.remaining, purse.gold, cost.affordable ? " → NOTIFY" : "")

  if (!cost.affordable) return

  announcedItems.add(next.item)
  raiseNotice("item", 0, null, { ours: [], theirs: [] }, NOTICE_MS, {
    id: next.item,
    name: cost.name,
    cost: cost.remaining,
    index: nextIndex + 1,
    total: build.length,
  })
}

/**
 * One player, as a scoreboard row.
 *
 * Assembled in the shell rather than in the interface because the gold figure
 * needs the item price table, and doing that lookup ten times per poll inside
 * React would be ten times the work for the same answer.
 */
export type LivePlayer = {
  name: string
  champion: string
  /** DDragon id, which is what the portrait URL needs. */
  championId: string | null
  level: number
  position: string | null
  dead: boolean
  respawnIn: number
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  wards: number
  /** What they are CARRYING, in gold — not what they have earned. */
  worth: number
  items: number[]
  keystone: number | null
  isMe: boolean
}

/**
 * One poll of the running game.
 *
 * ⚠️ The three things this drives are INDEPENDENT and must stay that way. They
 * used to share the objective's early return, so a game with no objective due —
 * which is most of the first ten minutes, and any time a drake has just died —
 * silently stopped checking the shop and stopped updating the gold bar. The
 * symptom was a build notice that never arrived, with nothing to suggest the
 * check was not running at all.
 */
async function readGame(): Promise<void> {
  const stats = await liveGameStats()
  if (!stats) return

  const [events, players, me] = await Promise.all([
    liveEvents(),
    livePlayers(),
    liveActivePlayerName().catch(() => null),
  ])

  // Same read, no extra request: /playerlist already carries every inventory.
  const myTeam = (players ?? []).find((p) => p.riotId === me || p.summonerName === me)?.team ?? null

  const championId = await playingChampion(players ?? [], me)
  const enemies = await enemyChampions(players ?? [], myTeam)
  void readShop(me, championId, enemies)

  const gold = await teamGold(players ?? [], myTeam).catch(() => null)
  if (gold) {
    push({ gold })
    syncOverlay()
  }

  readObjective(stats.gameTime, events, players ?? [], me, stats.mapTerrain)

  void readScoreboard(players ?? [], me, myTeam, stats.gameTime)
}

/**
 * The ten rows, split by side.
 *
 * ⚠️ Rebuilt every poll, which is two seconds — cheap because the only real
 * work is pricing inventories, and the price table is loaded once per patch.
 * Anything heavier than that belongs behind a change check.
 */
/** Champion key by NAME, from the same table everything else uses. Cached by
 *  that module, so this is a map lookup after the first call. */
let keyCache = new Map<string, number>()
const keyOf = (name: string): number => keyCache.get(name) ?? 0

async function readScoreboard(
  players: PlayerSlot[],
  me: string | null,
  myTeam: string | null,
  gameTime: number
): Promise<void> {
  if (!players.length) return push({ scoreboard: null })

  const minutes = Math.max(1, gameTime / 60)
  const rows: { row: LivePlayer; team: string }[] = []

  for (const p of players) {
    const champ = p.championName ? await championByName(p.championName).catch(() => null) : null
    if (champ && p.championName) keyCache.set(p.championName, champ.key)
    const items = (p.items ?? []).map((i) => i.itemID)
    rows.push({
      team: p.team,
      row: {
        // riotIdGameName is the name without the tag, which is what a
        // scoreboard shows; the others are fallbacks for older payloads.
        name: p.riotIdGameName ?? p.summonerName ?? p.riotId ?? "—",
        champion: p.championName ?? "—",
        championId: champ?.slug ?? null,
        level: p.level ?? 0,
        position: p.position && p.position.length ? p.position : null,
        dead: p.isDead === true,
        respawnIn: Math.max(0, Math.round(p.respawnTimer ?? 0)),
        kills: p.scores?.kills ?? 0,
        deaths: p.scores?.deaths ?? 0,
        assists: p.scores?.assists ?? 0,
        cs: p.scores?.creepScore ?? 0,
        csPerMin: (p.scores?.creepScore ?? 0) / minutes,
        wards: p.scores?.wardScore ?? 0,
        worth: await inventoryValue(p.items ?? []).catch(() => 0),
        items,
        keystone: p.runes?.keystone?.id ?? null,
        isMe: p.riotId === me || p.summonerName === me,
      },
    })
  }

  // Ours first, and only when we know which side that is — labelling a team
  // "yours" on a guess is worse than not labelling it.
  const ours = myTeam ? rows.filter((r) => r.team === myTeam) : rows
  const theirs = myTeam ? rows.filter((r) => r.team !== myTeam) : []

  // Remembered for the recap, which runs after this board is gone.
  const mine = rows.find((r) => r.row.isMe)?.row
  const lastPlayed =
    mine?.championId && mine.championId !== state.lastPlayed?.championId
      ? { championId: mine.championId, championKey: keyOf(mine.champion) }
      : state.lastPlayed

  push({
    lastPlayed,
    scoreboard: {
      gameTime,
      ours: ours.map((r) => r.row),
      theirs: theirs.map((r) => r.row),
    },
  })
}

function readObjective(
  gameTime: number,
  events: GameEvent[],
  players: PlayerSlot[],
  me: string | null,
  mapTerrain: string | undefined
): void {
  const next = nextObjective(events, gameTime, players, mapTerrain)
  if (!next) return

  const tally = dragonTally(events, players, me)

  // Absolute spawn time on the game clock — stable across polls, unlike the
  // remaining seconds, so it identifies THIS spawn and not a moment.
  const spawnAt = Math.round(gameTime + next.inSeconds)

  if (state.pinned) {
    // Held open for inspection, but the number stays honest: it is still the
    // real time to the real next objective, just without going away.
    raiseNotice(next.kind, next.inSeconds, next.element, tally)
    return
  }

  if (next.inSeconds <= NOTIFY_LEAD && next.inSeconds > 0 && announced !== spawnAt) {
    announced = spawnAt
    raiseNotice(next.kind, next.inSeconds, next.element, tally)
  }
}

function startGameClock(): void {
  if (tick) return
  // The price table is 1MB and only needed once; fetch it as the game starts
  // rather than in the middle of the first scoreboard read.
  warmItemCosts()
  warmItemTree()
  announcedItems = new Set()
  smartCache = null
  smartPending = ""
  recalibrated = null
  announcedBoots = false
  announcedOpening = false
  readOpening()
  announced = null
  void readGame()
  tick = setInterval(() => void readGame(), POLL_MS)
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
/** Separate from the ability nudge on purpose: they align different things on
 *  different edges of the screen, and one control for both would mean fixing
 *  one by breaking the other. */
ipcMain.on("hud:calibrate-topright", (_e, patch: Partial<HudNudge>) => {
  const topRight = { ...(state.hud.topRight ?? NO_NUDGE), ...patch }
  push({ hud: { ...state.hud, topRight } })
  console.log("[hud] top-right nudge x=%s y=%s size=%s",
    topRight.x.toFixed(4), topRight.y.toFixed(4), topRight.size.toFixed(2))
})

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
      // …and make it a PROFILE, so it appears in Builds. Importing runes for a
      // champion is a decision about that champion, and it used to leave no
      // trace anywhere the player could see — the section stayed empty and the
      // import looked like it had done nothing.
      await profileFromRunes(champion, patch, signatureOf(page))
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

/**
 * A champion's 3D model, cached on disk.
 *
 * ⚠️ These are NOT Riot's files and not ours: they are Khada's conversion work
 * (modelviewer.lol), served from their CDN, which they pay for with Ko-fi,
 * Patreon and ads on their own site. Caching to disk is the difference between
 * one fetch per champion per user and one per view — the reason this is
 * defensible at all. Do not make it fetch again for something a file already
 * answers.
 *
 * The URL ends in .wasm and is not wasm: it is a binary glTF with meshopt
 * compression and KTX2 textures. The extension is theirs, presumably to
 * discourage exactly this, which is a further reason to be light about it.
 *
 * Fetched here rather than in the interface because it belongs on disk, and
 * because a 16MB download has no business being redone by a component that
 * re-renders.
 */
const MODEL_DIR = () => join(app.getPath("userData"), "models")

ipcMain.handle("model:get", async (_e, championId: string, key: number) => {
  if (!/^[A-Za-z0-9]{1,32}$/.test(championId)) return null
  if (!Number.isInteger(key) || key < 1 || key > 100000) return null

  // Base skin only, for now: the recap is about the champion, and a per-skin
  // fetch would multiply the traffic by however many skins a player owns.
  const id = `${key}000`
  const file = join(MODEL_DIR(), `${championId}-${id}.glb`)

  try {
    const cached = await readFile(file)
    return cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength)
  } catch {
    // Not cached yet — fall through and fetch it once.
  }

  try {
    const url = `https://cdn.modelviewer.lol/lol/models/${championId.toLowerCase()}/${id}/model-compressed.wasm?c=1`
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const buf = Buffer.from(await res.arrayBuffer())

    // A glTF or nothing: an error page written to the cache would be served
    // forever as if it were a model.
    if (buf.length < 20 || buf.subarray(0, 4).toString() !== "glTF") {
      throw new Error("not a glTF")
    }

    await mkdir(MODEL_DIR(), { recursive: true })
    await writeFile(file, buf)
    console.log("[model] %s cached, %s MB", championId, (buf.length / 1048576).toFixed(1))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  } catch (e) {
    console.log("[model] %s failed: %s", championId, (e as Error)?.message)
    return null
  }
})

ipcMain.handle("settings:set", async (_e, patch: Partial<AppSettings>) => {
  const settings = await writeSettings(patch)

  if ("launchAtLogin" in patch) {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ["--hidden"] })
    } catch (e) {
      console.log("[settings] login item failed: %s", (e as Error)?.message)
    }
  }

  push({ settings })
  // A notice already on screen should not outlive the switch that turned its
  // kind off.
  if (!settings.objectiveNotices || !settings.buildNotices) syncOverlay()
  return settings
})

/** Where the preferences file lives, for a "show me" button that does not make
 *  the user hunt through AppData. */
ipcMain.handle("settings:reveal", () => {
  shell.showItemInFolder(join(app.getPath("userData"), "preferences.json"))
})

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

/**
 * Turn an imported rune page into a saved profile.
 *
 * Keeps any items already saved for that champion: a rune import is about the
 * runes, and quietly clearing a build the player had kept would be losing their
 * work to do them a favour. A profile with runes and no items yet is a valid
 * one — it fills in the first time champion select works a build out.
 *
 * The champion is resolved by NAME because that is all an import carries, and
 * the ddragon id it needs is not always the same string: "Lee Sin" is "LeeSin".
 */
async function profileFromRunes(championName: string, patch: string, runes: string): Promise<void> {
  const champ = await championByName(championName).catch(() => null)
  if (!champ) return

  const existing = await buildFor(champ.slug).catch(() => null)
  await saveBuild({
    championId: champ.slug,
    championName: champ.name,
    championKey: champ.key,
    role: existing?.role ?? null,
    items: existing?.items ?? [],
    runes,
    // An existing profile keeps whatever the player set it to.
    enabled: existing?.enabled ?? true,
    source: existing?.source ?? "site",
    savedAt: Date.now(),
    patch: patch || existing?.patch || null,
  })
  await pushBuilds()
}

/**
 * Turn rune imports made BEFORE profiles existed into profiles.
 *
 * Every import already recorded its choice, so the information was never lost
 * — it just had nowhere to show. This reads those records once and gives each
 * one a profile, so a player who imported runes last week opens Builds and
 * finds them there instead of an empty section.
 *
 * Marked PER CHAMPION, so each one is offered exactly once: without a marker
 * a profile the player deleted would come back on the next start, and with a
 * single shared one a champion that failed to resolve — or whose write was
 * lost — was written off permanently. Both of those happened here.
 */
async function backfillRuneProfiles(): Promise<void> {
  const choices = await chosenAll().catch((): Record<string, string> => ({}))
  const names = Object.keys(choices)
  console.log("[builds] backfill: %d remembered import(s): %s", names.length, names.join(", ") || "none")
  if (!names.length) return

  let made = 0
  for (const name of names) {
    if (await runesBackfilledFor(name).catch(() => true)) {
      console.log("[builds] backfill: %s already offered, skipping", name)
      continue
    }

    const champ = await championByName(name).catch(() => null)
    // Left unmarked, so a slow CDN fetch costs a retry rather than the champion.
    if (!champ) {
      console.log("[builds] backfill: %s did not resolve, will retry next start", name)
      continue
    }

    // Anything already saved is the player's own, and outranks this.
    if (await buildFor(champ.slug).catch(() => null)) {
      console.log("[builds] backfill: %s already has a profile", name)
      await markRunesBackfilled(name)
      continue
    }

    await saveBuild({
      championId: champ.slug,
      championName: champ.name,
      championKey: champ.key,
      role: null,
      items: [],
      runes: choices[name]!,
      enabled: true,
      source: "site",
      savedAt: Date.now(),
      patch: null,
    })
    await markRunesBackfilled(name)
    made++
  }

  if (made) console.log("[builds] recovered %d rune import(s) into profiles", made)
  await pushBuilds()
}

/**
 * A build sent from the website, saved as this champion's profile.
 *
 * This does NOT touch the League client. A build is a plan for a game that has
 * not started, where a rune page is something the client can hold right now —
 * writing items nowhere and runes somewhere would make one button do two
 * unrelated things.
 *
 * An existing profile keeps its enabled setting, so importing a build for a
 * champion whose notices you turned off does not turn them back on behind you.
 */
async function importBuild(raw: string): Promise<void> {
  const link = parseBuildLink(raw)
  console.log("[link] build valid=%s champion=%s items=%d",
    !!link, link?.champion ?? "-", link?.items.length ?? 0)

  if (!link) {
    push({ runeImport: { state: "error", message: "that link was not a valid build" } })
    return
  }

  const champ = await championByName(link.champion).catch(() => null)
  if (!champ) {
    push({ runeImport: { state: "error", message: `${link.champion} is not a champion we know` } })
    return
  }

  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const existing = await buildFor(champ.slug).catch(() => null)
  await saveBuild({
    championId: champ.slug,
    championName: champ.name,
    championKey: champ.key,
    role: existing?.role ?? null,
    items: link.items,
    // A build link without runes must not erase a page already saved.
    runes: link.page ? signatureOf(link.page) : existing?.runes ?? null,
    enabled: existing?.enabled ?? true,
    source: "site",
    savedAt: Date.now(),
    patch: link.patch ?? existing?.patch ?? null,
  })
  await pushBuilds()

  push({ runeImport: { state: "build-saved", champion: champ.name, items: link.items.length } })
}

async function pushBuilds(): Promise<void> {
  const builds = await listBuilds().catch(() => [])
  console.log("[builds] %d profile(s): %s", builds.length,
    builds.map((b) => b.championName).join(", ") || "none")
  push({ builds })
}

/** Save what champion select worked out, so it survives the game it came from. */
ipcMain.handle("builds:save", async () => {
  const m = state.matchup
  const champ = state.select?.champion
  if (!m || !champ || !m.slots.length) return

  const profile: BuildProfile = {
    championId: champ.slug,
    championName: champ.name,
    championKey: champ.key,
    role: state.select?.role ?? null,
    items: m.slots.map((s) => s.item),
    runes: state.runes ? signatureOf(state.runes.variants[state.runes.chosen]!.page) : null,
    enabled: true,
    source: "champ-select",
    savedAt: Date.now(),
    patch: m.patch,
  }
  await saveBuild(profile)
  await pushBuilds()
})

/**
 * Save an edited profile.
 *
 * Only the two things the editor owns are written — the item order and the
 * rune page. Everything else is left as it was, so editing a build cannot
 * silently change which champion it is for, where it came from, or whether it
 * is enabled.
 *
 * Validated here rather than trusted from the renderer: it is our own window,
 * but a build that reaches the notifier with a hole in it produces a notice
 * about nothing, and the cost of checking is a line.
 */
ipcMain.handle("builds:update", async (_e, championId: string, items: number[], runes: string | null) => {
  const existing = await buildFor(championId).catch(() => null)
  if (!existing) return

  const clean = (Array.isArray(items) ? items : [])
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 6)

  await saveBuild({
    ...existing,
    items: clean,
    runes: typeof runes === "string" && runes.length ? runes : existing.runes ?? null,
    savedAt: Date.now(),
  })
  await pushBuilds()
})

ipcMain.handle("builds:toggle", async (_e, championId: string, enabled: boolean) => {
  await setBuildEnabled(championId, enabled)
  await pushBuilds()
})

ipcMain.handle("builds:delete", async (_e, championId: string) => {
  await deleteBuild(championId)
  await pushBuilds()
})

ipcMain.on("gold:demo", () => {
  goldDemo = (goldDemo + 1) % GOLD_DEMOS.length
  // Asking to see it IS asking for it to be visible. Now that the bar starts
  // off, the preview would otherwise be a button that does nothing.
  goldVisible = GOLD_DEMOS[goldDemo] != null
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

  if (linkKind(raw) === "build") {
    await importBuild(raw)
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
  // A full poll rather than half of one: pinning must show the CURRENT
  // objective, and the data it needs is exactly what a tick gathers.
  if (on) void readGame()
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
 * Preview a recalibration without a game.
 *
 * Deliberately a separate button: it is the notice with the least chance of
 * appearing by accident, since it needs a smart profile AND a game where you
 * departed from it, and "I cannot see the thing I just built" is a bad way to
 * work on it.
 */
ipcMain.on("overlay:demo-recal", () => {
  raiseNotice("build", 0, null, { ours: [], theirs: [] }, DEMO_MS, undefined, undefined, {
    items: [4633],
    shapeLabel: "3 items you have built",
    cohortGames: 531,
    recalibrated: true,
    note: "+2.6pp",
  })
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
    // The label is what Windows puts in "How do you want to open this link?".
    // Without it the prompt names the EXECUTABLE, which in development is
    // electron.exe — so the player was being asked to trust "Electron" with no
    // way to tell what that was or whether they had installed it.
    const launch = {
      exe: process.execPath,
      args: dev ? [resolve(process.argv[1]!)] : [],
      label: "LolData",
      // Ours in a packaged build; in development the source icon, since
      // electron.exe's own would be the Electron atom.
      icon: dev ? join(__dirname, "..", "build", "icon.ico") : process.execPath,
    }

    const claimed = dev
      ? app.setAsDefaultProtocolClient(PROTOCOL, launch.exe, launch.args)
      : app.setAsDefaultProtocolClient(PROTOCOL)

    const result = await ensureProtocol(PROTOCOL, claimed, launch)
    console.log(
      "[link] %s:// ok=%s via=%s named=%s%s",
      PROTOCOL, result.ok, result.via, result.named ?? false,
      result.command ? ` cmd=${result.command}` : ""
    )

    createWindow()
    createOverlay(join(__dirname, "preload.mjs"))

    // Read the player's own HUD scale before anything is drawn over the game, so
    // the first frame is already in the right place rather than being corrected
    // afterwards. A missing config is not fatal — the default stands.
    // Registered once and released on quit. A shortcut left behind outlives the
    // process that owns it and the key stops working until the next reboot.
    const registered = globalShortcut.register(GOLD_HOTKEY, () => {
      goldVisible = !goldVisible
      push({})            // re-send state so the overlay redraws without the bar
      syncOverlay()
    })
    console.log("[hotkey] %s registered=%s", GOLD_HOTKEY, registered)

    const hud = await readHudSettings()
    push({ hud: { ...state.hud, scale: hud.globalScale, source: hud.source } })

    // A session from a previous run, so signing in survives a restart.
    const saved = await readSession()
    if (saved) await setSession(saved)

    const settings = await readSettings().catch(() => ({ ...DEFAULT_SETTINGS }))
    push({ settings })
    // The OS is the authority on this one, so it is told again at every start:
    // a preferences file restored onto another machine would otherwise claim a
    // login item that does not exist there.
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ["--hidden"] })
    } catch { /* not fatal — the switch simply will not stick */ }

    await backfillRuneProfiles()
    await pushBuilds()

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


app.on("before-quit", () => {
  stopGameClock()
  destroyOverlay()
  globalShortcut.unregisterAll()
})

app.on("window-all-closed", () => {
  lcu.stop()
  destroyOverlay()
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
