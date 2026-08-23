/**
 * What to build next, given what you have ACTUALLY built.
 *
 * A saved build is a plan, and plans survive contact with the game about half
 * the time: you take Steelcaps into a fed Zed, you pick up Rylai's because the
 * fight needed it, and from that point the rest of the plan is answering a
 * question nobody is asking any more. This asks the live one instead — among
 * players on this champion who reached exactly this inventory, what did the
 * winning ones build next.
 *
 * ⚠️ Restricted to real, final items via `itemPool`. Without it the ranking
 * returns trinkets and quest items alongside legendaries, and "Oracle Lens is
 * your best next item" is not advice.
 *
 * ⚠️ And a PICKRATE FLOOR, which is the part worth arguing about. Unfiltered,
 * the top of this ranking on Lillia is Mejai's Soulstealer at an 84% winrate
 * and +33pp lift, from 10% of the cohort. Mejai's does not make you win; it is
 * bought BY people who are already winning, and its winrate is that fact wearing
 * a number. Requiring that a fifth of the cohort actually builds the item drops
 * that class of artefact, at the honest cost of also dropping genuine niche
 * picks. Recommending a snowball item to someone who is behind is the worse
 * error of the two.
 */
import { allItems } from "./itemCatalog"

const API = "https://api2.loldata.cc"

/** Below this the winrates stop meaning anything and constraints get dropped. */
const MIN_COHORT = 300

/** An item a fifth of the cohort builds. See the note above. */
const MIN_PICKRATE = 20

/** Enough games behind the item itself, independent of the cohort's size. */
const MIN_ITEM_GAMES = 40

export type NextBest = {
  item: number
  name: string
  winrate: number
  /** Percentage points against the cohort's own baseline. */
  lift: number
  pickrate: number
  /** Games in the cohort the recommendation was drawn from. */
  cohort: number
  /** The owned items actually used to narrow it — fewer than asked for when
   *  the full inventory left too small a sample. */
  applied: number[]
}

type Row = {
  dimension: number
  games: number
  winrate: number
  lift: number
  pickrate: number
  cohort_games: number
}

let pool: number[] | null = null
let names: Map<number, string> | null = null

async function itemPool(): Promise<{ pool: number[]; names: Map<number, string> }> {
  if (!pool || !names) {
    const items = await allItems()
    pool = items.map((i) => i.id)
    names = new Map(items.map((i) => [i.id, i.name]))
  }
  return { pool, names }
}

async function rank(
  champion: string,
  role: string | null,
  owned: number[],
  itemPoolIds: number[],
  signal?: AbortSignal
): Promise<Row[] | null> {
  try {
    const res = await fetch(`${API}/api/explorer/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: {
          champion,
          ...(role ? { role } : {}),
          ...(owned.length ? { items: owned } : {}),
        },
        constraints: [],
        filters: { scope: "current_patch" },
        output: { kind: "rank", dimension: "item", limit: 12, minGames: MIN_ITEM_GAMES, itemPool: itemPoolIds },
      }),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { rows?: Row[]; error?: string }
    return json?.error ? null : json.rows ?? []
  } catch {
    return null
  }
}

/**
 * The best item to buy next, or null when the data does not support one.
 *
 * Drops the most recently acquired constraint whenever the cohort comes back
 * too thin, rather than reporting a winrate drawn from forty games. What
 * survives is reported in `applied`, so the interface can say how specific the
 * answer really is.
 */
export async function nextBest(
  champion: string,
  role: string | null,
  owned: number[],
  signal?: AbortSignal
): Promise<NextBest | null> {
  const { pool: ids, names: byId } = await itemPool()

  // Only items the ranking could return are worth constraining on; a control
  // ward in the inventory narrows nothing and is not in the pool anyway.
  let use = owned.filter((id) => ids.includes(id))
  const ownedSet = new Set(use)

  for (;;) {
    const rows = await rank(champion, role, use, ids, signal)
    if (!rows) return null

    const cohort = rows[0]?.cohort_games ?? 0
    if (cohort < MIN_COHORT && use.length > 0) {
      use = use.slice(0, -1)
      continue
    }

    const best = rows.find(
      (r) => !ownedSet.has(r.dimension) && r.pickrate >= MIN_PICKRATE && r.games >= MIN_ITEM_GAMES
    )
    if (!best) return null

    return {
      item: best.dimension,
      name: byId.get(best.dimension) ?? `Item ${best.dimension}`,
      winrate: best.winrate,
      lift: best.lift,
      pickrate: best.pickrate,
      cohort,
      applied: use,
    }
  }
}

/** A stable key for one inventory, so the same question is not asked twice. */
export const inventoryKey = (championId: string, owned: number[]): string =>
  `${championId}:${[...owned].sort((a, b) => a - b).join(",")}`
