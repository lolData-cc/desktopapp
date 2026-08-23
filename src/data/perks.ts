/**
 * Perk ids into names and icons.
 *
 * DDragon's runesReforged.json is the tree structure — styles, slots, runes —
 * and it does NOT include the stat shards, which are the three small ones at
 * the bottom of a page. Those are drawn from a fixed table, since Riot
 * publishes no data file for them and the set changes about once a year.
 *
 * Icon paths in that file are relative and unversioned: they live under
 * /img on the CDN, not under the patch directory. Getting that wrong yields a
 * 404 for every rune at once, which at least fails loudly.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

export type Perk = { id: number; name: string; icon: string }
export type Style = { id: number; name: string; icon: string }

let cache: { perks: Map<number, Perk>; styles: Map<number, Style> } | null = null
let patch = FALLBACK_PATCH

/** The stat shards, which runesReforged.json does not carry. */
const SHARDS: Record<number, { name: string; icon: string }> = {
  5001: { name: "Health", icon: "perk-images/StatMods/StatModsHealthScalingIcon.png" },
  5002: { name: "Armour", icon: "perk-images/StatMods/StatModsArmorIcon.png" },
  5003: { name: "Magic Resist", icon: "perk-images/StatMods/StatModsMagicResIcon.MagicResist.png" },
  5005: { name: "Attack Speed", icon: "perk-images/StatMods/StatModsAttackSpeedIcon.png" },
  5007: { name: "Ability Haste", icon: "perk-images/StatMods/StatModsCDRScalingIcon.png" },
  5008: { name: "Adaptive Force", icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png" },
  5010: { name: "Move Speed", icon: "perk-images/StatMods/StatModsMovementSpeedIcon.png" },
  5011: { name: "Health Scaling", icon: "perk-images/StatMods/StatModsHealthPlusIcon.png" },
  5013: { name: "Tenacity", icon: "perk-images/StatMods/StatModsTenacityIcon.png" },
}

type Tree = {
  id: number
  name: string
  icon: string
  slots: { runes: { id: number; name: string; icon: string }[] }[]
}

async function load() {
  if (cache) return cache

  const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
  if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

  const res = await fetch(`${CDN}/${patch}/data/en_US/runesReforged.json`)
  if (!res.ok) throw new Error(`rune data ${res.status}`)
  const trees = (await res.json()) as Tree[]

  const perks = new Map<number, Perk>()
  const styles = new Map<number, Style>()
  for (const tree of trees) {
    styles.set(tree.id, { id: tree.id, name: tree.name, icon: `${CDN}/img/${tree.icon}` })
    for (const slot of tree.slots) {
      for (const r of slot.runes) {
        perks.set(r.id, { id: r.id, name: r.name, icon: `${CDN}/img/${r.icon}` })
      }
    }
  }
  for (const [id, s] of Object.entries(SHARDS)) {
    perks.set(Number(id), { id: Number(id), name: s.name, icon: `${CDN}/img/${s.icon}` })
  }

  cache = { perks, styles }
  return cache
}

/** Null for an id we do not know, so the caller can leave a gap rather than
 *  render a broken image. */
export async function perkById(id: number): Promise<Perk | null> {
  return (await load()).perks.get(id) ?? null
}

export async function styleById(id: number): Promise<Style | null> {
  return (await load()).styles.get(id) ?? null
}

/** Everything needed to draw one page, resolved in a single pass. */
export async function resolvePage(ids: number[], primaryStyle: number, subStyle: number) {
  const { perks, styles } = await load()
  return {
    perks: ids.map((id) => perks.get(id) ?? null),
    primary: styles.get(primaryStyle) ?? null,
    secondary: styles.get(subStyle) ?? null,
  }
}
