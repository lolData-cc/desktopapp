/**
 * When the next dragon is due.
 *
 * Derived, not observed: Riot publishes no "next spawn" field, so this is the
 * last kill plus the respawn interval, measured on the same game clock the
 * events carry.
 *
 * Timings as of the 2026 season: the first dragon spawns at 5:00, each
 * subsequent one 5 minutes after the previous is killed, and once a team has
 * taken four the Elder replaces it on a 6-minute timer (or at 35:00, whichever
 * comes first). These are patch-dependent numbers in one place on purpose —
 * when Riot moves them, this is the only file to touch.
 */
import type { GameEvent, PlayerSlot } from "../live/client"

export const FIRST_DRAGON_AT = 5 * 60
export const DRAGON_RESPAWN = 5 * 60
export const ELDER_RESPAWN = 6 * 60
export const ELDER_EARLIEST = 35 * 60
export const SOUL_AT = 4

/** The element names the live API uses in DragonKill.DragonType. */
export type DragonElement = "Fire" | "Earth" | "Water" | "Air" | "Hextech" | "Chemtech"

export type NextObjective = {
  kind: "dragon" | "elder"
  /** Seconds remaining. Negative means it is already up. */
  inSeconds: number
  /** How many dragons have been taken in total, both teams. */
  taken: number
  /**
   * The element of the dragon that is COMING, or null when it cannot be known.
   *
   * The first two dragons are random, and only after the second does the Rift
   * transform and fix the element of every later spawn.
   *
   * ⚠️ That transformation is NOT readable. gamestats.mapTerrain looked like the
   * answer and is not: observed still reading "Default" on a map that had
   * visibly turned, and it does not appear in the API's own OpenAPI schema at
   * all. The schema lists twelve liveclientdata endpoints and none carries the
   * Rift's element; a search of the whole payload finds "terrain" exactly once,
   * in that same field.
   *
   * So the element is only learned once a dragon of it has been KILLED — from
   * the third on. mapTerrain is still consulted first, costing nothing, in case
   * it is populated in real games where this was only tested in a practice one.
   *
   * Null therefore means "we genuinely do not know", and the caller must show a
   * plain dragon rather than pick one. Guessing here would be a specific,
   * confident, wrong icon two times out of three.
   */
  element: DragonElement | null
}

/**
 * DragonKill events say "Fire"/"Earth"/"Water"/"Air" — confirmed live. The
 * scoreboard and terrain vocabulary uses "Infernal"/"Mountain"/"Ocean"/"Cloud"
 * for the same six, so both spellings are accepted; an unrecognised value
 * yields null, never a wrong dragon.
 */
const ELEMENT_ALIASES: Record<string, DragonElement> = {
  fire: "Fire", infernal: "Fire",
  earth: "Earth", mountain: "Earth",
  water: "Water", ocean: "Water",
  air: "Air", cloud: "Air",
  hextech: "Hextech",
  chemtech: "Chemtech",
}

export function normaliseElement(raw: string | null | undefined): DragonElement | null {
  if (!raw) return null
  return ELEMENT_ALIASES[raw.trim().toLowerCase()] ?? null
}

/** The element every remaining dragon will be, once that is knowable. */
function lockedElement(kills: GameEvent[]): DragonElement | null {
  const elemental = kills.filter((k) => k.DragonType && k.DragonType !== "Elder")
  if (elemental.length < 3) return null
  return (elemental[elemental.length - 1]!.DragonType as DragonElement) ?? null
}

/**
 * Which team killed each dragon, resolved through the player list.
 *
 * The event only carries a killer NAME, so the team has to come from elsewhere,
 * and a dragon can be taken by anyone on the map. When a killer cannot be
 * matched — a name format we did not anticipate, an execute by a minion — the
 * kill still counts toward the total but toward no team's soul, which fails
 * toward showing a plain dragon timer rather than inventing an Elder.
 */
/**
 * Name → team, keyed every way Riot might spell it.
 *
 * The formats do NOT agree across endpoints, verified live: /playerlist gives
 * "yuumi45#EU1" for both riotId and summonerName, while a DragonKill event's
 * KillerName is the bare "yuumi45", tag stripped. Indexing only the full id
 * meant every kill failed to attribute — silently, since an unattributed kill
 * is dropped rather than raised.
 *
 * So both spellings go in. Bare game names are not globally unique, but within
 * the ten players of one match a collision needs two identical names on
 * opposite teams, and the alternative is attributing nothing at all.
 */
function teamIndex(players: PlayerSlot[]): Map<string, string> {
  const map = new Map<string, string>()
  const add = (name: string | undefined, team: string) => {
    if (!name) return
    map.set(name, team)
    const bare = name.split("#")[0]
    if (bare && bare !== name) map.set(bare, team)
  }
  for (const p of players) {
    add(p.riotId, p.team)
    add(p.summonerName, p.team)
  }
  return map
}

function soulTakenBy(events: GameEvent[], players: PlayerSlot[]): string | null {
  const teamOf = teamIndex(players)

  const count: Record<string, number> = {}
  for (const e of events) {
    if (e.EventName !== "DragonKill") continue
    const team = e.KillerName ? teamOf.get(e.KillerName) : undefined
    if (!team) continue
    count[team] = (count[team] ?? 0) + 1
    if (count[team] >= SOUL_AT) return team
  }
  return null
}

export type DragonTally = {
  /** Elements the player's own team has taken, oldest first. */
  ours: DragonElement[]
  /** And the other team's. */
  theirs: DragonElement[]
}

/**
 * Who has taken which dragons.
 *
 * The event carries a killer NAME and nothing else, so the team comes from the
 * player list, and the player's OWN team from their name — without which there
 * is no "ours" to speak of and both sides come back empty rather than
 * arbitrarily assigned.
 *
 * A kill that cannot be attributed is dropped, not guessed onto a side: putting
 * a dragon under the wrong team is worse than showing one fewer. Elder is
 * excluded too — it is not an elemental drake and does not count toward soul.
 */
export function dragonTally(
  events: GameEvent[],
  players: PlayerSlot[],
  myName: string | null
): DragonTally {
  const teamOf = teamIndex(players)
  const myTeam = myName ? teamOf.get(myName) : undefined
  const tally: DragonTally = { ours: [], theirs: [] }
  if (!myTeam) return tally

  for (const e of events) {
    if (e.EventName !== "DragonKill") continue
    const element = normaliseElement(e.DragonType)
    if (!element) continue
    const team = e.KillerName ? teamOf.get(e.KillerName) : undefined
    if (!team) continue
    ;(team === myTeam ? tally.ours : tally.theirs).push(element)
  }
  return tally
}

/**
 * Whether the NEXT drake ends the dragon game, and for whom.
 *
 * Worth calling out separately from the count, because it changes the decision
 * rather than describing the state: at three, a drake is no longer one of four,
 * it is the last one. Which side is on the brink decides whether that means
 * contest or concede, so the answer names a side rather than a boolean.
 *
 * Null once a soul has actually been taken — then the Elder is next and this is
 * no longer the question being asked.
 */
export type SoulPoint = "ours" | "theirs" | "both" | null

export function soulPoint(tally: DragonTally): SoulPoint {
  if (tally.ours.length >= SOUL_AT || tally.theirs.length >= SOUL_AT) return null
  const us = tally.ours.length === SOUL_AT - 1
  const them = tally.theirs.length === SOUL_AT - 1
  if (us && them) return "both"
  if (us) return "ours"
  if (them) return "theirs"
  return null
}

export function nextObjective(
  events: GameEvent[],
  gameTime: number,
  players: PlayerSlot[] = [],
  /** gamestats.mapTerrain. Undocumented and observed always "Default", even on
   *  a transformed map — kept as a cheap first guess, never relied upon. */
  mapTerrain?: string
): NextObjective | null {
  const kills = events
    .filter((e) => e.EventName === "DragonKill")
    .sort((a, b) => a.EventTime - b.EventTime)

  // Before the first one there is nothing to derive from — it is a fixed time.
  if (kills.length === 0) {
    // Nothing has transformed yet and nothing has died: the first is random.
    return { kind: "dragon", inSeconds: FIRST_DRAGON_AT - gameTime, taken: 0, element: null }
  }

  const last = kills[kills.length - 1]!
  const soul = soulTakenBy(events, players)

  if (soul) {
    // The Elder arrives on its own timer, or at 35:00 if that comes sooner.
    const due = Math.min(last.EventTime + ELDER_RESPAWN, Math.max(ELDER_EARLIEST, gameTime))
    // The Elder has its own art; the Rift's element does not apply to it.
    return { kind: "elder", inSeconds: due - gameTime, taken: kills.length, element: null }
  }

  return {
    kind: "dragon",
    inSeconds: last.EventTime + DRAGON_RESPAWN - gameTime,
    taken: kills.length,
    // The kill history is the source that actually works; the terrain is
    // tried first only because it would be better IF it were ever populated.
    element: normaliseElement(mapTerrain) ?? lockedElement(kills),
  }
}

/** m:ss, floored, never negative. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
