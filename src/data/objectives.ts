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
const SOUL_AT = 4

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
   * transform and fix the element of every later spawn. That transformation IS
   * readable, via gamestats.mapTerrain, so from the third dragon on this is the
   * real element and not a guess.
   *
   * Null therefore means "we genuinely do not know", and the caller must show a
   * plain dragon rather than pick one. Guessing here would be a specific,
   * confident, wrong icon two times out of three.
   */
  element: DragonElement | null
}

/**
 * Riot names the same element two different ways: DragonKill events say
 * "Fire"/"Earth"/"Water"/"Air", while the map's terrain is expected to say
 * "Infernal"/"Mountain"/"Ocean"/"Cloud". Only "Default" could be observed on a
 * live untransformed map, so BOTH spellings are accepted rather than betting on
 * which one appears — an unrecognised value yields null, never a wrong dragon.
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
function soulTakenBy(events: GameEvent[], players: PlayerSlot[]): string | null {
  const teamOf = new Map<string, string>()
  for (const p of players) {
    if (p.riotId) teamOf.set(p.riotId, p.team)
    if (p.summonerName) teamOf.set(p.summonerName, p.team)
  }

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

export function nextObjective(
  events: GameEvent[],
  gameTime: number,
  players: PlayerSlot[] = [],
  /** gamestats.mapTerrain — the transformation, when it has happened. */
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
    // The map is the better source: it transforms as soon as the SECOND
    // dragon dies, so the third is known before anyone has killed one of it.
    // The kill history stays as a fallback for when the terrain is unreadable.
    element: normaliseElement(mapTerrain) ?? lockedElement(kills),
  }
}

/** m:ss, floored, never negative. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
