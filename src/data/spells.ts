/**
 * Summoner spell identity.
 *
 * The in-game API names spells by DISPLAY name ("Flash"), and every icon path
 * is keyed by internal id ("SummonerFlash"), so this is the join.
 *
 * ⚠️ It does NOT give cooldowns, and neither does anything else Riot publishes
 * locally: /activeplayer exposes abilities, stats, gold, runes and level, with
 * no cooldown field anywhere, and there is no summoner-spell cast event to
 * derive one from. Checked against a live game rather than assumed. So the
 * overlay can say WHICH spells you have and not how long until they are back.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

let byName: Map<string, string> | null = null
let patch = FALLBACK_PATCH

async function load(): Promise<Map<string, string>> {
  if (byName) return byName

  const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
  if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

  const res = await fetch(`${CDN}/${patch}/data/en_US/summoner.json`)
  if (!res.ok) throw new Error(`summoner data ${res.status}`)
  const json = (await res.json()) as { data: Record<string, { id: string; name: string }> }

  const map = new Map<string, string>()
  for (const s of Object.values(json.data)) {
    // Arena ships "_Jade" duplicates under the same display name. First wins,
    // which keeps the Summoner's Rift entry — the same trick the website's
    // badge map needed for exactly this reason.
    if (!map.has(s.name)) map.set(s.name, s.id)
  }
  byName = map
  return map
}

export type Spell = { name: string; icon: string }

/** Null for a name we do not recognise, rather than a broken image. */
export async function spellByName(displayName: string): Promise<Spell | null> {
  if (!displayName) return null
  const id = (await load()).get(displayName)
  if (!id) return null
  return { name: displayName, icon: `${CDN}/${patch}/img/spell/${id}.png` }
}
