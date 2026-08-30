/**
 * What the player last chose, per champion.
 *
 * Without this the two surfaces contradict each other: the site offers five
 * variants and you pick Off-Meta, then champ select comes round, the app's
 * button says IMPORT, and it quietly puts the most played page back. Whichever
 * you pressed last wins, which is not a choice — it is a race.
 *
 * The choice is stored as the PERK SIGNATURE rather than an index. Variant
 * ordering is a popularity ranking and it moves between patches, so "the fourth
 * one" means something different next week; the actual runes do not.
 *
 * A missing or corrupt file is not an error. It means no preference yet, and
 * the most played page is the right default for someone who has never chosen.
 */
import { app } from "electron"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { PageSignature } from "../src/lcu/runes"

export { signatureOf, type PageSignature } from "../src/lcu/runes"

/**
 * A signed-in session.
 *
 * The token is a bearer credential and is treated like one: never logged, never
 * put in a URL, never sent anywhere but our own API over https. It IS written
 * to disk in the clear, which is what a desktop app has to do to stay signed in
 * — the file sits in the per-user app data directory, readable only by that
 * user, and signing out deletes it.
 */
export type Session = { token: string; email: string | null; tier: string | null }

/**
 * A saved build for one champion: the runes and the item order, together.
 *
 * Kept per champion rather than per champion-and-comp. The comp changes every
 * game and the advice is recomputed live from it; what a player wants to KEEP
 * is "this is how I build Lillia", which is a decision, not a query result.
 *
 * `enabled` is what decides whether the shop notices fire. Off by default would
 * mean saving a build and wondering why nothing happens, so a saved build is an
 * active one until it is turned off.
 */
export type BuildProfile = {
  /** DDragon champion id, e.g. "Lillia" — what everything else keys on. */
  championId: string
  championName: string
  championKey: number
  role: string | null
  /** Item ids in build order. */
  items: number[]
  /** The rune page signature, when one was saved with it. */
  runes?: PageSignature | null
  enabled: boolean
  /** Re-ask the data when the actual build stops matching the plan. Off by
   *  default: it costs a query per inventory change, and a plan followed to the
   *  letter needs no second opinion. */
  smart?: boolean
  /** Where it came from, so the interface can say. */
  source: "champ-select" | "site"
  savedAt: number
  patch: string | null
}

/**
 * Everything the Settings page owns.
 *
 * Deliberately a flat record of booleans with defaults applied on READ rather
 * than on write: a settings file written by an older version is missing keys a
 * newer one knows about, and treating "absent" as "off" would silently turn
 * features off on upgrade.
 */
export type AppSettings = {
  /** Start with Windows. */
  launchAtLogin: boolean
  /**
   * Re-ask the data when the actual build departs from the plan. Global rather
   * than per champion: it describes how you want to be ADVISED, which does not
   * change from Lillia to Darius.
   */
  smartBuild: boolean
  /** The gold lead in the game's top-right strip. */
  goldReadout: boolean
  /** Ranks over the ten cards on the loading screen. */
  loadingBoard: boolean

  /**
   * Record the screen while a game is running.
   *
   * ⚠️ Off by default and it must stay that way. Recording someone's screen is
   * not a feature you enable for them, whatever the default would be worth.
   */
  capture: boolean

  /**
   * What audio goes into the recording.
   *
   * ⚠️ "system" is EVERYTHING the machine plays — game, Discord, music, all
   * mixed into one track. Per-application audio is not separable here: the
   * loopback Chromium exposes is a single mix, and splitting it needs Windows'
   * process-loopback through native code. Offering "game only" or "Discord
   * only" would be a switch that quietly did something else.
   */
  captureAudio: "none" | "system" | "mic" | "both" | "split"
  /**
   * How much disk the automatic recordings may use, in gigabytes — or null for
   * no limit at all.
   *
   * ⚠️ This REPLACED a count of ten games, and it had to: "unlimited" beside a
   * rule that still threw away the eleventh would be a lie printed on the
   * screen. A size is also the honest unit — nobody runs out of games, they run
   * out of disk, and a twelve-minute remake and a fifty-minute marathon are not
   * the same amount of anything except "one".
   *
   * Recordings marked KEPT sit outside this budget entirely. It governs what
   * gets discarded, and a kept recording is by definition the thing that does
   * not.
   */
  captureBudgetGb: number | null
  /**
   * Frames per second to record at.
   *
   * ⚠️ Costs disk in direct proportion, and asks proportionally more of the
   * GPU's encoder — which is the one budget this feature promised not to spend,
   * since the whole point of hardware H264 was that recording must not cost the
   * game any frames.
   */
  captureFps: number
  /** Dragon and Baron warnings. */
  objectiveNotices: boolean
  /** "X is purchasable", boots advice, the opening build. */
  buildNotices: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  smartBuild: false,
  goldReadout: true,
  loadingBoard: true,
  capture: false,
  captureAudio: "system",
  // ~19 games at 1080p — close to what the old ten-game rule cost, with room.
  captureBudgetGb: 25,
  captureFps: 30,
  objectiveNotices: true,
  buildNotices: true,
}

type Stored = {
  chosen: Record<string, PageSignature>
  session?: Session | null
  builds?: Record<string, BuildProfile>
  /** Champions whose pre-existing rune choice has already been turned into a
   *  profile — by NAME, as `chosen` keys them.
   *
   *  Per champion rather than one boolean: a single flag cannot say WHICH were
   *  done, so one failure or one lost write took a champion out of reach
   *  permanently. It still stops a profile the player deleted from coming
   *  back, which is the reason a marker exists at all. */
  runesBackfilled?: string[]
  settings?: Partial<AppSettings>
}

/**
 * ⚠️ Deliberately NOT cached.
 *
 * This used to keep the parsed file in memory and write that snapshot back on
 * every change. Whole-file last-writer-wins: a second process that had loaded
 * earlier would silently erase anything written since — which is exactly how a
 * saved build disappeared, with the store left claiming its backfill was done
 * so it never came back.
 *
 * Every write is therefore a read-modify-write of the file as it is NOW. It is
 * a few KB, read on user actions rather than in a loop, and correctness here is
 * worth far more than the read.
 */
const file = () => join(app.getPath("userData"), "preferences.json")

async function load(): Promise<Stored> {
  let cache: Stored
  try {
    const raw = await readFile(file(), "utf8")
    const parsed = JSON.parse(raw) as Stored
    cache = {
      chosen: parsed?.chosen ?? {},
      session: parsed?.session ?? null,
      builds: parsed?.builds ?? {},
      runesBackfilled: migrateMarker(parsed, parsed?.builds ?? {}),
      settings: parsed?.settings ?? {},
    }
  } catch {
    cache = { chosen: {}, session: null, builds: {}, runesBackfilled: [], settings: {} }
  }
  return cache
}

/** The signature this player last imported for a champion, if any. */
export async function chosenFor(champion: string): Promise<PageSignature | null> {
  return (await load()).chosen[champion.toLowerCase()] ?? null
}

/**
 * Records a choice — including one made on the website, which is the whole
 * point: a deep link is the player choosing, and champ select should not
 * then overrule it.
 */
export async function rememberChoice(champion: string, signature: PageSignature): Promise<void> {
  const store = await load()
  store.chosen[champion.toLowerCase()] = signature
  await persist(store)
}

/** Every remembered choice, keyed by the champion's DISPLAY NAME lowercased —
 *  which is what the import knew. Not the ddragon id. */
export async function chosenAll(): Promise<Record<string, PageSignature>> {
  return { ...(await load()).chosen }
}

/**
 * The old boolean, read as the set it was standing in for.
 *
 * `true` meant "the pass ran", so the champions it actually produced are the
 * ones with a build. Anything it claimed to have done but left nothing behind
 * was not really done, and is offered again — which is the honest reading, and
 * restores a profile a lost write erased.
 */
function migrateMarker(parsed: Stored, builds: Record<string, BuildProfile>): string[] {
  const marker = parsed?.runesBackfilled
  if (Array.isArray(marker)) return marker
  if (marker !== true) return []

  const have = new Set(Object.values(builds).map((b) => b.championName.toLowerCase()))
  return Object.keys(parsed?.chosen ?? {}).filter((name) => have.has(name))
}

export async function runesBackfilledFor(champion: string): Promise<boolean> {
  return (await load()).runesBackfilled?.includes(champion.toLowerCase()) === true
}

export async function markRunesBackfilled(champion: string): Promise<void> {
  const store = await load()
  const key = champion.toLowerCase()
  store.runesBackfilled = store.runesBackfilled ?? []
  if (!store.runesBackfilled.includes(key)) store.runesBackfilled.push(key)
  await persist(store)
}

/** Defaults filled in on read, so a file from an older version does not read
 *  as "every new feature off". */
export async function readSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...((await load()).settings ?? {}) }
}

export async function writeSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const store = await load()
  store.settings = { ...(store.settings ?? {}), ...patch }
  await persist(store)
  return { ...DEFAULT_SETTINGS, ...store.settings }
}

export async function readSession(): Promise<Session | null> {
  return (await load()).session ?? null
}

/** Null clears it — which is what signing out means, on disk as well. */
export async function writeSession(session: Session | null): Promise<void> {
  const store = await load()
  store.session = session
  await persist(store)
}

/** Every saved build, newest first. */
export async function listBuilds(): Promise<BuildProfile[]> {
  const store = await load()
  return Object.values(store.builds ?? {}).sort((a, b) => b.savedAt - a.savedAt)
}

export async function buildFor(championId: string): Promise<BuildProfile | null> {
  const store = await load()
  return store.builds?.[championId.toLowerCase()] ?? null
}

/** Saving replaces whatever was there for that champion — one build per
 *  champion is the whole point, and keeping a history nobody asked for turns a
 *  decision into a list to manage. */
export async function saveBuild(profile: BuildProfile): Promise<void> {
  const store = await load()
  store.builds = store.builds ?? {}
  store.builds[profile.championId.toLowerCase()] = profile
  await persist(store)
}

export async function setBuildEnabled(championId: string, enabled: boolean): Promise<void> {
  const store = await load()
  const b = store.builds?.[championId.toLowerCase()]
  if (!b) return
  b.enabled = enabled
  await persist(store)
}

export async function deleteBuild(championId: string): Promise<void> {
  const store = await load()
  if (store.builds) delete store.builds[championId.toLowerCase()]
  await persist(store)
}

/** The one place this file is written. Failing to persist never interrupts an
 *  operation that otherwise worked — the change simply does not survive a
 *  restart, which is better than losing an import that DID reach the client. */
async function persist(store: Stored): Promise<void> {
  try {
    await mkdir(dirname(file()), { recursive: true })
    await writeFile(file(), JSON.stringify(store, null, 2), "utf8")
  } catch {
    // deliberately silent, see above
  }
}
