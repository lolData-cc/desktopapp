/**
 * What the next item still costs, given what is already in the bag.
 *
 * The number people actually want is not the item's price — it is the price
 * MINUS the components already owned. A Liandry's is 3000, but with an
 * Amplifying Tome in the inventory it is 2600, and being told 3000 while
 * standing in the shop able to buy it is worse than being told nothing.
 *
 * ⚠️ The tree is walked RECURSIVELY and owned items are consumed as they are
 * matched. Summing "every owned item that appears anywhere in the tree" double
 * counts: a Haunting Guise contains an Amplifying Tome, so owning the Guise and
 * a loose Tome must not subtract the Tome twice — and a recipe needing two
 * Tomes with one owned must subtract one, not both.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

type Node = { total: number; from: number[]; name: string }

let tree: Map<number, Node> | null = null
let loading: Promise<Map<number, Node>> | null = null

async function load(): Promise<Map<number, Node>> {
  if (tree) return tree
  if (loading) return loading

  loading = (async () => {
    let patch = FALLBACK_PATCH
    const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
    if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

    const res = await fetch(`${CDN}/${patch}/data/en_US/item.json`)
    if (!res.ok) throw new Error(`item data ${res.status}`)
    const json = (await res.json()) as {
      data: Record<string, { name: string; gold?: { total?: number }; from?: string[] }>
    }

    const map = new Map<number, Node>()
    for (const [id, it] of Object.entries(json.data)) {
      map.set(Number(id), {
        total: it.gold?.total ?? 0,
        from: (it.from ?? []).map(Number),
        name: it.name,
      })
    }
    tree = map
    return map
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

/** A mutable tally of what is owned, so each item is spent once. */
type Bag = Map<number, number>

const takeFromBag = (bag: Bag, id: number): boolean => {
  const n = bag.get(id) ?? 0
  if (n <= 0) return false
  bag.set(id, n - 1)
  return true
}

/**
 * Gold still needed to complete `target`, spending anything in `bag` that
 * belongs to its recipe.
 *
 * Owning the finished item costs nothing. Otherwise the price is this recipe's
 * combine cost plus whatever each component still costs — which recurses, so a
 * component that is itself owned stops the walk there and takes its whole
 * subtree with it.
 */
function remaining(id: number, bag: Bag, nodes: Map<number, Node>): number {
  const node = nodes.get(id)
  if (!node) return 0

  if (takeFromBag(bag, id)) return 0

  const parts = node.from
  if (!parts.length) return node.total

  // The recipe's own surcharge: the finished price less what its parts cost.
  const partsTotal = parts.reduce((n, p) => n + (nodes.get(p)?.total ?? 0), 0)
  const combine = Math.max(0, node.total - partsTotal)

  return combine + parts.reduce((n, p) => n + remaining(p, bag, nodes), 0)
}

export type Affordability = {
  item: number
  name: string
  /** Full price, for saying what the item is worth. */
  full: number
  /** What is still needed after components in the bag. */
  remaining: number
  /** Gold in pocket at the time of asking. */
  gold: number
  affordable: boolean
}

export async function costToComplete(
  itemId: number,
  inventory: { itemID: number; count?: number }[],
  gold: number
): Promise<Affordability | null> {
  const nodes = await load()
  const node = nodes.get(itemId)
  if (!node) return null

  const bag: Bag = new Map()
  for (const it of inventory) {
    bag.set(it.itemID, (bag.get(it.itemID) ?? 0) + Math.max(1, it.count ?? 1))
  }

  const left = remaining(itemId, bag, nodes)
  return {
    item: itemId,
    name: node.name,
    full: node.total,
    remaining: left,
    gold,
    affordable: gold >= left,
  }
}

/** True when the finished item is already in the bag — the point at which the
 *  build moves on to the next slot. */
export async function owns(itemId: number, inventory: { itemID: number }[]): Promise<boolean> {
  return inventory.some((i) => i.itemID === itemId)
}

export const warmItemTree = (): void => void load().catch(() => undefined)
