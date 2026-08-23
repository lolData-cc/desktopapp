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

type Stored = { chosen: Record<string, PageSignature>; session?: Session | null }

let cache: Stored | null = null

const file = () => join(app.getPath("userData"), "preferences.json")

async function load(): Promise<Stored> {
  if (cache) return cache
  try {
    const raw = await readFile(file(), "utf8")
    const parsed = JSON.parse(raw) as Stored
    cache = { chosen: parsed?.chosen ?? {}, session: parsed?.session ?? null }
  } catch {
    cache = { chosen: {}, session: null }
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
  try {
    await mkdir(dirname(file()), { recursive: true })
    await writeFile(file(), JSON.stringify(store, null, 2), "utf8")
  } catch {
    // Failing to persist is not worth interrupting an import that worked; the
    // choice simply does not survive a restart.
  }
}

export async function readSession(): Promise<Session | null> {
  return (await load()).session ?? null
}

/** Null clears it — which is what signing out means, on disk as well. */
export async function writeSession(session: Session | null): Promise<void> {
  const store = await load()
  store.session = session
  try {
    await mkdir(dirname(file()), { recursive: true })
    await writeFile(file(), JSON.stringify(store, null, 2), "utf8")
  } catch {
    // Not worth interrupting a sign-in that otherwise worked; it simply will
    // not survive a restart.
  }
}
