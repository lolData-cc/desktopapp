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

type Stored = { chosen: Record<string, PageSignature> }

let cache: Stored | null = null

const file = () => join(app.getPath("userData"), "preferences.json")

async function load(): Promise<Stored> {
  if (cache) return cache
  try {
    const raw = await readFile(file(), "utf8")
    const parsed = JSON.parse(raw) as Stored
    cache = { chosen: parsed?.chosen ?? {} }
  } catch {
    cache = { chosen: {} }
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
