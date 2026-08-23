/**
 * What to build against the comp you are actually facing.
 *
 * Uses the site's Explorer engines — the same ones the champion page runs on —
 * with the enemy team folded into the query as CONSTRAINTS.
 *
 * ⚠️ Constrained by the comp's SHAPE, not by its names. Asking for "Lillia
 * against Darius and Jinx" collapsed a live cohort to 37 games, where a
 * winrate means nothing; asking for "Lillia against three or more melee
 * champions" keeps thousands. Named enemies feel more precise and are less
 * true, which is the worst trade a stats product can make.
 *
 * ⚠️ And a recommendation is only made when the data actually says something.
 * Item strength comes back as verdicts with a z-score, and on live data most of
 * them are NEUTRAL — Mercury's Treads on Lillia has no significant verdict
 * against any comp shape across 2,317 games. A feature that always produces a
 * reason would be inventing one. Silence is a valid answer here and is used.
 */
const API = "https://api2.loldata.cc"

/** The six classes plus damage and range profiles, as the Explorer knows them. */
export type Category =
  | "Assassin" | "Fighter" | "Mage" | "Marksman" | "Support" | "Tank"
  | "AD" | "AP" | "Melee" | "Ranged"

export type CompShape = { cls: Category; count: number }

export type BuildSlot = {
  item: number
  games: number
  winrate: number
  /** Percentage points against the cohort's own baseline. */
  lift: number
  pickrate: number
}

export type BuildAdvice = {
  slots: BuildSlot[]
  cohortGames: number
  baseline: number
  patch: string
  /** The shapes that were actually used to narrow the cohort, for saying WHY. */
  applied: CompShape[]
}

export type ItemVerdict = {
  item: number
  label: string
  delta: number
  z: number
  direction: "strong" | "weak" | "neutral"
  significant: boolean
  gamesIn: number
}

/**
 * A comp reduced to the shapes worth constraining on.
 *
 * Only counts of two or more are kept: "the enemy has one mage" describes
 * almost every game and narrows nothing, so constraining on it costs cohort
 * size and buys no information.
 */
export function compShapes(enemyCategories: Category[][]): CompShape[] {
  const counts = new Map<Category, number>()
  for (const cats of enemyCategories) {
    // A champion counted once per category it belongs to, never twice for the
    // same one — a Mage/Assassin is one of each, not two mages.
    for (const c of new Set(cats)) counts.set(c, (counts.get(c) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([cls, count]) => ({ cls, count }))
    // Strongest signal first: a five-AD comp says more than a two-tank one.
    .sort((a, b) => b.count - a.count)
}

type Graph = {
  subject: { champion: string; role?: string }
  constraints: unknown[]
  categories?: { side: "enemy"; cls: Category; min: number }[]
  filters: { scope: "current_patch" | "all" }
  output: { kind: "stats" }
}

const graphFor = (champion: string, role: string | null, shapes: CompShape[]): Graph => ({
  subject: { champion, ...(role ? { role } : {}) },
  constraints: [],
  categories: shapes.map((s) => ({ side: "enemy" as const, cls: s.cls, min: s.count })),
  filters: { scope: "current_patch" },
  output: { kind: "stats" },
})

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as T & { error?: string }
    return json?.error ? null : json
  } catch {
    return null
  }
}

/** How small a cohort may get before its winrates stop meaning anything. */
const MIN_COHORT = 400

/** And how thin an individual SLOT may get. The deeper slots fall away fast —
 *  a live query returned a fifth item drawn from 41 games showing +15pp, which
 *  is noise wearing a number. A build that stops at four honest items is worth
 *  more than one padded to six. */
const MIN_SLOT_GAMES = 150

/**
 * The build for this matchup, dropping constraints until the cohort is big
 * enough to trust.
 *
 * Starts with every shape the comp has and removes the weakest signal each
 * time the sample comes back too thin, rather than either refusing outright or
 * reporting a winrate drawn from thirty games. What survives is reported in
 * `applied`, so the interface can say which part of the comp the advice is
 * actually about.
 */
export async function buildForComp(
  champion: string,
  role: string | null,
  shapes: CompShape[],
  signal?: AbortSignal
): Promise<BuildAdvice | null> {
  let use = [...shapes]

  for (;;) {
    const data = await post<{
      slots: BuildSlot[][]
      cohortGames: number
      baseline: number
      patch: string
    }>("/api/explorer/buildpath", graphFor(champion, role, use), signal)

    if (!data) return null

    if (data.cohortGames >= MIN_COHORT || use.length === 0) {
      return {
        slots: pickPath(data.slots),
        cohortGames: data.cohortGames,
        baseline: data.baseline,
        patch: data.patch,
        applied: use,
      }
    }

    use = use.slice(0, -1)
  }
}

/**
 * One item per slot, never the same one twice, and nothing built on too little.
 *
 * The raw slots are independent rankings, so the same item can top two of them
 * — a live query put Zhonya's at both third and fourth. Read literally that is
 * "buy it, then buy it again". Each slot therefore takes its best option that
 * has not been taken already.
 *
 * And the path STOPS at the first slot too thin to trust rather than skipping
 * it: slot five being unreliable does not make slot six sound, and a build that
 * ends honestly at four items beats one padded to six.
 */
function pickPath(slots: BuildSlot[][]): BuildSlot[] {
  const path: BuildSlot[] = []
  const used = new Set<number>()

  for (const options of slots) {
    const next = options.find((o) => !used.has(o.item))
    if (!next || next.games < MIN_SLOT_GAMES) break
    used.add(next.item)
    path.push(next)
  }
  return path
}

/**
 * Whether an item is genuinely better against this comp.
 *
 * Null unless a verdict is SIGNIFICANT. Most are not, and reporting a
 * half-point difference at z=0.6 as a recommendation would be dressing noise
 * up as a reason.
 */
export async function itemVerdict(
  champion: string,
  role: string | null,
  itemId: number,
  signal?: AbortSignal
): Promise<ItemVerdict | null> {
  const data = await post<{
    verdicts: {
      label: string
      delta: number
      z: number
      direction: string
      significant: boolean
      gamesIn: number
    }[]
  }>(
    "/api/explorer/itemstrength",
    { graph: graphFor(champion, role, []), itemId },
    signal
  )
  if (!data?.verdicts?.length) return null

  const best = data.verdicts
    .filter((v) => v.significant && v.direction === "strong")
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0]

  if (!best) return null

  return {
    item: itemId,
    label: best.label,
    delta: best.delta,
    z: best.z,
    direction: "strong",
    significant: true,
    gamesIn: best.gamesIn,
  }
}

/** "3+ melee, 2+ tanks" — the shapes the advice was actually narrowed by. */
export function describeShapes(shapes: CompShape[]): string {
  if (!shapes.length) return "no strong comp pattern"
  return shapes.map((s) => `${s.count}+ ${s.cls.toLowerCase()}`).join(", ")
}
