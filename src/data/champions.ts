/**
 * Champion identity, on our side of the adapter.
 *
 * The client speaks in numeric champion ids. Everything we publish — builds,
 * runes, jungle routes — is keyed by the ddragon slug. This is the join, and it
 * lives here rather than in src/lcu/ because it is our domain, not the client's.
 *
 * Source is our own CDN, the same one the website reads, so a champion the site
 * knows about is a champion the desktop app knows about — no second source of
 * truth to drift.
 *
 * There is an offline alternative worth remembering: an installed client ships
 * its own copy of this data in the `rcp-be-lol-game-data` plugin, so a future
 * version could resolve names with no network at all.
 */
const CDN = "https://cdn2.loldata.cc"
const FALLBACK_PATCH = "16.16.1"

export type Champion = {
  /** ddragon id — what our build and route endpoints key on, e.g. "Nami" */
  slug: string
  /** numeric id — what the League client speaks, e.g. 267 */
  key: number
  name: string
}

let cache: Map<number, Champion> | null = null
let patch = FALLBACK_PATCH

async function load(): Promise<Map<number, Champion>> {
  if (cache) return cache

  const marker = await fetch(`${CDN}/_current_version.txt`).catch(() => null)
  if (marker?.ok) patch = (await marker.text()).trim() || FALLBACK_PATCH

  const res = await fetch(`${CDN}/${patch}/data/en_US/champion.json`)
  if (!res.ok) throw new Error(`champion data ${res.status}`)
  const json = (await res.json()) as { data: Record<string, { id: string; key: string; name: string }> }

  const map = new Map<number, Champion>()
  for (const c of Object.values(json.data)) {
    map.set(Number(c.key), { slug: c.id, key: Number(c.key), name: c.name })
  }
  cache = map
  return map
}

/** Null for 0 or an unknown id — 0 is what the client sends for "not picked". */
export async function championById(id: number): Promise<Champion | null> {
  if (!id) return null
  return (await load()).get(id) ?? null
}

export async function currentPatch(): Promise<string> {
  await load()
  return patch
}
