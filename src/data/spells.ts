/**
 * Summoner spell identity.
 *
 * The in-game API names spells by DISPLAY name ("Flash"), and every icon path
 * is keyed by internal id ("SummonerFlash"), so this is the join.
 *
 * ⚠️ Nothing Riot publishes locally gives REMAINING cooldown: /activeplayer,
 * /playersummonerspells and /activeplayerabilities carry no cooldown field
 * between them, and there is no cast event to derive one from — re-checked
 * against a live game, not assumed. So the overlay can say how long a spell's
 * cooldown IS, and never how long until it is back.
 *
 * The LENGTH, though, is exact: DDragon publishes it, and the two things that
 * shorten it are both detectable, so this reports the real number for THIS
 * player's build rather than a textbook one.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

type Entry = { id: string; cooldown: number; charges: number }
let byName: Map<string, Entry> | null = null
let patch = FALLBACK_PATCH

async function load(): Promise<Map<string, Entry>> {
  if (byName) return byName

  const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
  if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

  const res = await fetch(`${CDN}/${patch}/data/en_US/summoner.json`)
  if (!res.ok) throw new Error(`summoner data ${res.status}`)
  const json = (await res.json()) as {
    data: Record<string, { id: string; name: string; cooldown?: number[]; maxammo?: string }>
  }

  const map = new Map<string, Entry>()
  for (const s of Object.values(json.data)) {
    // Arena ships "_Jade" duplicates under the same display name. First wins,
    // which keeps the Summoner's Rift entry — the same trick the website's
    // badge map needed for exactly this reason.
    if (map.has(s.name)) continue
    const ammo = Number(s.maxammo ?? "-1")
    map.set(s.name, {
      id: s.id,
      cooldown: s.cooldown?.[0] ?? 0,
      charges: Number.isFinite(ammo) && ammo > 0 ? ammo : 1,
    })
  }
  byName = map
  return map
}

export type Spell = {
  name: string
  icon: string
  /** Cooldown in seconds for this player's build. NOT time remaining. */
  cooldown: number
  /** Charges, for the spells that have them (Smite). 1 for everything else. */
  charges: number
}

/**
 * Summoner spell haste, from the only two sources of it.
 *
 * Patch-dependent numbers, kept together on purpose — the same convention as
 * the objective timings. Both were read from Riot's own data rather than
 * recalled: item 3158 "Gain 10 Summoner Spell Haste", perk 8347 "+18 Summoner
 * Spell Haste".
 */
export const HASTE_SOURCES = [
  { kind: "rune", id: 8347, haste: 18, name: "Cosmic Insight" },
  { kind: "item", id: 3158, haste: 10, name: "Ionian Boots of Lucidity" },
] as const

export function summonerHaste(runeIds: number[], itemIds: number[]): number {
  let total = 0
  for (const src of HASTE_SOURCES) {
    const ids = src.kind === "rune" ? runeIds : itemIds
    if (ids.includes(src.id)) total += src.haste
  }
  return total
}

/** Haste is a reduction of RATE, not of time: 18 haste is 300s → 254s. */
export const applyHaste = (base: number, haste: number): number =>
  Math.round(base / (1 + haste / 100))

/** Null for a name we do not recognise, rather than a broken image. */
export async function spellByName(displayName: string, haste = 0): Promise<Spell | null> {
  if (!displayName) return null
  const e = (await load()).get(displayName)
  if (!e) return null
  return {
    name: displayName,
    icon: `${CDN}/${patch}/img/spell/${e.id}.png`,
    cooldown: applyHaste(e.cooldown, haste),
    charges: e.charges,
  }
}
