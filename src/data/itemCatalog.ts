/**
 * The items a build can actually END on.
 *
 * A build slot holds a finished item, so the picker must not offer components:
 * a list containing both Sheen and Trinity Force makes the wrong one one pixel
 * away from the right one, and "Sheen is purchasable" is not advice.
 *
 * Terminal is read from the data rather than from a price threshold: an item is
 * offered when NOTHING builds out of it (`into` is empty). That keeps boots and
 * cheap finished items like Mejai's in, and keeps every component out, without
 * a magic number that goes stale the patch a price changes.
 *
 * ⚠️ BOOTS are the exception to that rule. Since tier-3 boots exist, a pair of
 * Mercury's Treads builds INTO Chainlaced Crushers and would be filtered out as
 * a component — but Mercury's is a slot people genuinely end on, and it is what
 * the comp advice names when the enemy team is full of crowd control. Anything
 * tagged Boots above the 300g starter is offered.
 *
 * ⚠️ Ornn's upgrades are excluded. They are real items with real ids that the
 * shop will never sell you — putting one in a build produces a slot that can
 * never be bought and a notification that can never fire.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

export type CatalogItem = {
  id: number
  name: string
  cost: number
  icon: string
  /** DDragon's own tags, for grouping the picker. */
  tags: string[]
  boots: boolean
}

type Raw = {
  name: string
  gold?: { total?: number; purchasable?: boolean }
  into?: string[]
  maps?: Record<string, boolean>
  tags?: string[]
  inStore?: boolean
  hideFromAll?: boolean
  requiredAlly?: string
  requiredChampion?: string
}

let cache: CatalogItem[] | null = null
let loading: Promise<CatalogItem[]> | null = null

async function load(): Promise<CatalogItem[]> {
  if (cache) return cache
  if (loading) return loading

  loading = (async () => {
    let patch = FALLBACK_PATCH
    const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
    if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

    const res = await fetch(`${CDN}/${patch}/data/en_US/item.json`)
    if (!res.ok) throw new Error(`item data ${res.status}`)
    const json = (await res.json()) as { data: Record<string, Raw> }

    const out: CatalogItem[] = []
    for (const [id, it] of Object.entries(json.data)) {
      const cost = it.gold?.total ?? 0
      if (!it.gold?.purchasable) continue
      if (it.maps && it.maps["11"] === false) continue
      if (it.inStore === false || it.hideFromAll) continue
      if (it.requiredAlly || it.requiredChampion) continue
      const tags = it.tags ?? []
      // Tier-2 boots build into tier-3 and are still a slot people end on.
      const boots = tags.includes("Boots") && cost >= 900
      if (it.into?.length && !boots) continue // a component, not a build slot
      if (cost < 500) continue                // trinkets, potions, control wards
      out.push({
        id: Number(id),
        name: it.name,
        cost,
        icon: `${CDN}/${patch}/img/item/${id}.png`,
        tags,
        boots,
      })
    }

    // Boots first — they are the one slot everyone fills early and hunts for —
    // then by price, which is roughly how the shop itself is read.
    out.sort((a, b) => Number(b.boots) - Number(a.boots) || a.cost - b.cost || a.name.localeCompare(b.name))
    cache = out
    return out
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

export const allItems = (): Promise<CatalogItem[]> => load()

export async function itemById(id: number): Promise<CatalogItem | null> {
  return (await load()).find((i) => i.id === id) ?? null
}

/**
 * Name search, prefix matches first.
 *
 * "in" should reach Infinity Edge before Guinsoo's, so a word that STARTS a
 * name outranks one buried in it. Typing three letters and getting the right
 * item first is the whole job of this function.
 */
export async function searchItems(query: string): Promise<CatalogItem[]> {
  const items = await load()
  const q = query.trim().toLowerCase()
  if (!q) return items

  const scored: { item: CatalogItem; rank: number }[] = []
  for (const item of items) {
    const name = item.name.toLowerCase()
    const at = name.indexOf(q)
    if (at < 0) continue
    // 0 = the name starts with it, 1 = a word inside it does, 2 = anywhere.
    const rank = at === 0 ? 0 : name[at - 1] === " " || name[at - 1] === "'" ? 1 : 2
    scored.push({ item, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.item.name.length - b.item.name.length)
  return scored.map((s) => s.item)
}

export const warmItemCatalog = (): void => void load().catch(() => undefined)
