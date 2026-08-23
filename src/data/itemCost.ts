/**
 * What an item costs.
 *
 * DDragon's `gold.total` — the full build cost, not the combine cost, which is
 * the number people mean when they say what an item is worth. Static data,
 * published per patch, and the only reason a team's gold can be totalled at all
 * without asking the game for something it does not give.
 *
 * Loaded once and kept. The file is ~1MB and changes per patch, so fetching it
 * repeatedly during a match would be the single most wasteful thing this app
 * does.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

let costs: Map<number, number> | null = null
let loading: Promise<Map<number, number>> | null = null

async function load(): Promise<Map<number, number>> {
  if (costs) return costs
  // Concurrent callers share one request rather than starting four.
  if (loading) return loading

  loading = (async () => {
    let patch = FALLBACK_PATCH
    const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
    if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

    const res = await fetch(`${CDN}/${patch}/data/en_US/item.json`)
    if (!res.ok) throw new Error(`item data ${res.status}`)
    const json = (await res.json()) as {
      data: Record<string, { gold?: { total?: number } }>
    }

    const map = new Map<number, number>()
    for (const [id, item] of Object.entries(json.data)) {
      const total = item.gold?.total ?? 0
      if (total > 0) map.set(Number(id), total)
    }
    costs = map
    return map
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

/** Zero for trinkets, quest items and anything we do not recognise — all of
 *  which contribute nothing to what a team has spent. */
export async function itemCost(id: number): Promise<number> {
  return (await load()).get(id) ?? 0
}

export type Inventory = { itemID: number; count?: number }[]

/**
 * What one player is carrying, in gold.
 *
 * Counts stacks: three health potions are 150, not 50. Consumables and wards
 * are included because they ARE gold that was spent — leaving them out would
 * make a support who warded look poorer than one who did not.
 */
export async function inventoryValue(items: Inventory): Promise<number> {
  const table = await load()
  let total = 0
  for (const it of items) {
    const price = table.get(it.itemID) ?? 0
    total += price * Math.max(1, it.count ?? 1)
  }
  return total
}

/** Preload, so the first scoreboard read is not waiting on a 1MB download. */
export const warmItemCosts = (): void => void load().catch(() => undefined)
