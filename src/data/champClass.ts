/**
 * Champion → the categories the Explorer's constraints are built from.
 *
 * ⚠️ This MIRRORS the backend's own champClass.ts, rule for rule, and must keep
 * doing so. The Explorer expands a category constraint server-side into a list
 * of champion names; if this side classified a champion differently, the query
 * would quietly select a different cohort than the one being asked about — a
 * wrong answer with no symptom.
 *
 * The two rules, copied from that file rather than reasoned about here:
 *
 *   damage:  attack >= magic + 2 → AD
 *            magic >= attack + 2 → AP
 *            otherwise            → Hybrid
 *   range:   attackrange >= 300  → Ranged, else Melee
 *
 * Hybrid is deliberately not a category on either side: it is too fuzzy to
 * filter on, so a hybrid champion counts toward neither AD nor AP. That is the
 * backend's decision and this follows it rather than improving on it.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

export type ChampCategory =
  | "Assassin" | "Fighter" | "Mage" | "Marksman" | "Support" | "Tank"
  | "AD" | "AP" | "Melee" | "Ranged"

export type ChampInfo = {
  /** DDragon id, which is what the participants table stores. */
  id: string
  name: string
  key: number
  categories: ChampCategory[]
}

type Raw = {
  id: string
  key: string
  name: string
  tags: string[]
  info?: { attack?: number; magic?: number }
  stats?: { attackrange?: number }
}

let byKey: Map<number, ChampInfo> | null = null
let loading: Promise<Map<number, ChampInfo>> | null = null

/** Same thresholds as the backend. Hybrid yields nothing rather than a guess. */
function damageOf(attack = 0, magic = 0): "AD" | "AP" | null {
  if (attack >= magic + 2) return "AD"
  if (magic >= attack + 2) return "AP"
  return null
}

/** Melee sits at ~125-225 and ranged at ~425-650; nothing real lands between,
 *  so 300 is a clean split — the backend's words. */
const rangeOf = (range = 0): "Melee" | "Ranged" => (range >= 300 ? "Ranged" : "Melee")

async function load(): Promise<Map<number, ChampInfo>> {
  if (byKey) return byKey
  if (loading) return loading

  loading = (async () => {
    let patch = FALLBACK_PATCH
    const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
    if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

    const res = await fetch(`${CDN}/${patch}/data/en_US/champion.json`)
    if (!res.ok) throw new Error(`champion data ${res.status}`)
    const json = (await res.json()) as { data: Record<string, Raw> }

    const map = new Map<number, ChampInfo>()
    for (const c of Object.values(json.data)) {
      const cats: ChampCategory[] = [...(c.tags ?? [])] as ChampCategory[]

      const dmg = damageOf(c.info?.attack, c.info?.magic)
      if (dmg) cats.push(dmg)
      cats.push(rangeOf(c.stats?.attackrange))

      map.set(Number(c.key), { id: c.id, name: c.name, key: Number(c.key), categories: cats })
    }
    byKey = map
    return map
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

/** Null for a champion we do not know — better a missing entry than a wrong
 *  category folded into a constraint. */
export async function classify(championKey: number): Promise<ChampInfo | null> {
  return (await load()).get(championKey) ?? null
}

export async function classifyAll(keys: number[]): Promise<ChampInfo[]> {
  const table = await load()
  return keys.map((k) => table.get(k)).filter((c): c is ChampInfo => !!c)
}

/**
 * Champions with hard, mostly unavoidable crowd control.
 *
 * Copied from the backend's champTags.ts, whose own comment sets the threshold:
 * three or more of these on a team is a genuinely CC-heavy comp, and tenacity
 * is usually worth buying into it. This is domain judgement that already
 * existed in this codebase — repeating it here keeps the app and the AI saying
 * the same thing about the same comp.
 */
const HEAVY_CC = new Set([
  "Amumu","Sejuani","Maokai","Zac","Skarner","Vi","JarvanIV","MonkeyKing","Hecarim","Gragas",
  "Nunu","Rammus","Warwick","Volibear","Sett","Ornn","Malphite","Sion","Galio","Poppy",
  "Gnar","Chogath","Trundle","Shen","Jax","Renekton","Pantheon","Riven","Camille","Diana",
  "Kennen","Fiddlesticks","Nocturne","Elise","Rell","KSante","Mordekaiser","Nautilus","Lillia",
  "Annie","Veigar","Syndra","Lissandra","Cassiopeia","TwistedFate","Taliyah","Ahri","Lux",
  "Neeko","Zoe","Orianna","Ryze","Anivia","Brand","Zyra","Swain","Seraphine",
  "Leona","Thresh","Blitzcrank","Pyke","Rakan","Alistar","Braum","Nami","Sona","Bard",
  "Renata","Zilean","Lulu","Morgana",
  "Ashe","Varus","Jhin","Senna",
].map((s) => s.toLowerCase()))

/** The backend's threshold, not a new one. */
export const CC_HEAVY_AT = 3

export const isHeavyCC = (championId: string): boolean => HEAVY_CC.has(championId.toLowerCase())

/** Which of these champions bring hard CC — the ones worth naming when
 *  explaining why tenacity is being suggested. */
export const ccCarriers = (champs: ChampInfo[]): ChampInfo[] =>
  champs.filter((c) => isHeavyCC(c.id))
