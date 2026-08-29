/**
 * Every game this MACHINE has seen, across every account signed into it.
 *
 * The client only ever tells us about the account that is signed in right now,
 * and only its twenty most recent games. That made the Matches tab a property
 * of the account rather than of the computer: sign into a smurf and your main's
 * games vanished, and the Stats tab recomputed itself around whoever happened to
 * be logged in.
 *
 * So we keep what we have seen. Each game is stamped with the account that
 * played it and merged into one archive on disk, which is what both tabs read.
 *
 * ⚠️ This is deliberately "since you installed the app", not "your history".
 * Games played before the app existed are not in the client's twenty and cannot
 * be recovered — the archive only ever grows from what we witness. That is the
 * honest boundary and the interface should say so rather than implying a
 * complete record.
 */
import { app } from "electron"
import { readFile, writeFile, rename } from "node:fs/promises"
import { join } from "node:path"
import type { Match } from "../src/lcu/history"

export type ArchivedAccount = { name: string; tag: string; puuid: string }
/** ⚠️ `account` is OPTIONAL: it is stamped by us on merge, and a live read
 *  that has not been through the archive yet does not carry one. */
export type ArchivedMatch = Match & { account?: ArchivedAccount }

type Stored = { version: 1; matches: ArchivedMatch[] }

/**
 * A ceiling, not a target. At roughly 400 bytes a game this is a couple of
 * megabytes; the cap exists so a machine used for years cannot grow a file that
 * has to be parsed on every launch.
 */
const MAX_MATCHES = 3000

const file = () => join(app.getPath("userData"), "matches.json")

/** Read once, then kept in memory — every merge rewrites the whole file. */
let cache: ArchivedMatch[] | null = null

export async function loadArchive(): Promise<ArchivedMatch[]> {
  if (cache) return cache
  try {
    const raw = await readFile(file(), "utf8")
    const parsed = JSON.parse(raw) as Stored
    cache = Array.isArray(parsed?.matches) ? parsed.matches : []
  } catch {
    // No file yet, or a file we cannot read. Either way the archive starts
    // empty rather than taking the app down: this is a convenience store, and
    // losing it costs history, not correctness.
    cache = []
  }
  return cache
}

/**
 * Folds a fresh read from the client into the archive and returns everything
 * this machine knows, newest first.
 *
 * ⚠️ Keyed on gameId. The same game read twice must not appear twice, and the
 * SECOND read wins — a game read moments after it ended can be missing its
 * final scoreboard, and the later read is the more complete one.
 */
export async function mergeMatches(
  fresh: Match[],
  account: ArchivedAccount
): Promise<ArchivedMatch[]> {
  const all = await loadArchive()
  if (!account.puuid || !fresh.length) return all

  const byId = new Map<number, ArchivedMatch>()
  for (const m of all) byId.set(m.gameId, m)
  for (const m of fresh) byId.set(m.gameId, { ...m, account })

  const merged = [...byId.values()]
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, MAX_MATCHES)

  cache = merged
  await save(merged)
  return merged
}

/** The accounts this machine has actually seen play, newest first. */
export function accountsIn(matches: ArchivedMatch[]): ArchivedAccount[] {
  const seen = new Map<string, ArchivedAccount>()
  for (const m of matches) {
    if (m.account?.puuid && !seen.has(m.account.puuid)) seen.set(m.account.puuid, m.account)
  }
  return [...seen.values()]
}

/**
 * ⚠️ Written to a temporary file and renamed over the real one.
 *
 * A crash or a power cut halfway through a plain write leaves a truncated JSON
 * file, and the next launch reads it as an empty archive — losing every game
 * the machine had ever recorded. A rename is atomic, so the file on disk is
 * always one whole version or the other.
 */
async function save(matches: ArchivedMatch[]): Promise<void> {
  const target = file()
  const tmp = `${target}.tmp`
  const body: Stored = { version: 1, matches }
  try {
    await writeFile(tmp, JSON.stringify(body), "utf8")
    await rename(tmp, target)
  } catch (e) {
    console.log("[archive] could not save:", e)
  }
}
