/**
 * What the player last chose, per champion.
 *
 * Without this the two surfaces contradict each other: the site offers five
 * variants and you pick Off-Meta, then champ select comes round, the app's
 * button says IMPORT, and it quietly puts the most played page back. Whichever
 * you pressed last wins, which is not a choice — it is a race.
 *
 * The choice is stored as the PERK SIGNATURE rather than an index. Variant
 * ordering is a popularity ranking and it moves between patches, so "the fourth
 * one" means something different next week; the actual runes do not.
 *
 * A missing or corrupt file is not an error. It means no preference yet, and
 * the most played page is the right default for someone who has never chosen.
 */
import { app } from "electron"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { PageSignature } from "../src/lcu/runes"

export { signatureOf, type PageSignature } from "../src/lcu/runes"

/**
 * A signed-in session.
 *
 * The token is a bearer credential and is treated like one: never logged, never
 * put in a URL, never sent anywhere but our own API over https. It IS written
 * to disk in the clear, which is what a desktop app has to do to stay signed in
 * — the file sits in the per-user app data directory, readable only by that
 * user, and signing out deletes it.
 */
export type Session = { token: string; email: string | null; tier: string | null }

/**
 * A saved build for one champion: the runes and the item order, together.
 *
 * Kept per champion rather than per champion-and-comp. The comp changes every
 * game and the advice is recomputed live from it; what a player wants to KEEP
 * is "this is how I build Lillia", which is a decision, not a query result.
 *
 * `enabled` is what decides whether the shop notices fire. Off by default would
 * mean saving a build and wondering why nothing happens, so a saved build is an
 * active one until it is turned off.
 */
export type BuildProfile = {
  /** DDragon champion id, e.g. "Lillia" — what everything else keys on. */
  championId: string
  championName: string
  championKey: number
  role: string | null
  /** Item ids in build order. */
  items: number[]
  /** The rune page signature, when one was saved with it. */
  runes?: PageSignature | null
  enabled: boolean
  /** Where it came from, so the interface can say. */
  source: "champ-select" | "site"
  savedAt: number
  patch: string | null
}

type Stored = {
  chosen: Record<string, PageSignature>
  session?: Session | null
  builds?: Record<string, BuildProfile>
  /** Set once the pre-existing rune choices have been turned into profiles.
   *  Without it the backfill would run every start and resurrect a rune-only
   *  profile the player had deliberately deleted. */
  runesBackfilled?: boolean
}

let cache: Stored | null = null

const file = () => join(app.getPath("userData"), "preferences.json")

async function load(): Promise<Stored> {
  if (cache) return cache
  try {
    const raw = await readFile(file(), "utf8")
    const parsed = JSON.parse(raw) as Stored
    cache = {
      chosen: parsed?.chosen ?? {},
      session: parsed?.session ?? null,
      builds: parsed?.builds ?? {},
      runesBackfilled: parsed?.runesBackfilled ?? false,
    }
  } catch {
    cache = { chosen: {}, session: null, builds: {}, runesBackfilled: false }
  }
  return cache
}

/** The signature this player last imported for a champion, if any. */
export async function chosenFor(champion: string): Promise<PageSignature | null> {
  return (await load()).chosen[champion.toLowerCase()] ?? null
}

/**
 * Records a choice — including one made on the website, which is the whole
 * point: a deep link is the player choosing, and champ select should not
 * then overrule it.
 */
export async function rememberChoice(champion: string, signature: PageSignature): Promise<void> {
  const store = await load()
  store.chosen[champion.toLowerCase()] = signature
  await persist(store)
}

/** Every remembered choice, keyed by the champion's DISPLAY NAME lowercased —
 *  which is what the import knew. Not the ddragon id. */
export async function chosenAll(): Promise<Record<string, PageSignature>> {
  return { ...(await load()).chosen }
}

export async function runesBackfilled(): Promise<boolean> {
  return (await load()).runesBackfilled === true
}

export async function markRunesBackfilled(): Promise<void> {
  const store = await load()
  store.runesBackfilled = true
  await persist(store)
}

export async function readSession(): Promise<Session | null> {
  return (await load()).session ?? null
}

/** Null clears it — which is what signing out means, on disk as well. */
export async function writeSession(session: Session | null): Promise<void> {
  const store = await load()
  store.session = session
  await persist(store)
}

/** Every saved build, newest first. */
export async function listBuilds(): Promise<BuildProfile[]> {
  const store = await load()
  return Object.values(store.builds ?? {}).sort((a, b) => b.savedAt - a.savedAt)
}

export async function buildFor(championId: string): Promise<BuildProfile | null> {
  const store = await load()
  return store.builds?.[championId.toLowerCase()] ?? null
}

/** Saving replaces whatever was there for that champion — one build per
 *  champion is the whole point, and keeping a history nobody asked for turns a
 *  decision into a list to manage. */
export async function saveBuild(profile: BuildProfile): Promise<void> {
  const store = await load()
  store.builds = store.builds ?? {}
  store.builds[profile.championId.toLowerCase()] = profile
  await persist(store)
}

export async function setBuildEnabled(championId: string, enabled: boolean): Promise<void> {
  const store = await load()
  const b = store.builds?.[championId.toLowerCase()]
  if (!b) return
  b.enabled = enabled
  await persist(store)
}

export async function deleteBuild(championId: string): Promise<void> {
  const store = await load()
  if (store.builds) delete store.builds[championId.toLowerCase()]
  await persist(store)
}

/** The one place this file is written. Failing to persist never interrupts an
 *  operation that otherwise worked — the change simply does not survive a
 *  restart, which is better than losing an import that DID reach the client. */
async function persist(store: Stored): Promise<void> {
  try {
    await mkdir(dirname(file()), { recursive: true })
    await writeFile(file(), JSON.stringify(store, null, 2), "utf8")
  } catch {
    // deliberately silent, see above
  }
}
