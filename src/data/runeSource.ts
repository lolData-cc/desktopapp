/**
 * The rune page loldata would show for a champion.
 *
 * Same numbers as the site's Build tab, from the same endpoint — the app is not
 * a second opinion, it is the site with a shorter path to the client. If they
 * ever disagreed, that would be a bug rather than a feature.
 *
 * `preciseRunes.pages` is ordered by how often a page is actually played, so
 * the most popular one is simply the first. Popular is not the same as best,
 * and the app says which it is showing rather than implying they are the same
 * thing.
 */
import type { BuildPage } from "../lcu/runes"

const API = "https://api2.loldata.cc"

export type RuneSuggestion = {
  page: BuildPage
  /** Games behind this exact page, for saying how well attested it is. */
  games: number
  winrate: number
  /** Of the champion's total sample, so "88% of Nami players" is sayable. */
  share: number
  role: string | null
}

type BuildResponse = {
  preciseRunes?: {
    pages?: (BuildPage & { games?: number; winrate?: number })[]
    sample?: number
  }
}

/**
 * Null when there is nothing worth importing, rather than a half-filled page:
 * a champion with no data, a role we have not aggregated, or a page that came
 * back short of its nine perks. Writing an incomplete page to the client is
 * worse than not writing one.
 */
export async function popularRunes(
  championKey: number,
  championName: string,
  role: string | null,
  signal?: AbortSignal
): Promise<RuneSuggestion | null> {
  const res = await fetch(`${API}/api/champion/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The endpoint wants BOTH the numeric key and the name; sending one gets a
    // 400 that says so.
    body: JSON.stringify({ champKey: championKey, champion: championName, role: role ?? undefined }),
    signal,
  })
  if (!res.ok) return null

  const data = (await res.json()) as BuildResponse
  const page = data.preciseRunes?.pages?.[0]
  if (!page) return null

  const complete =
    page.primary?.length === 4 && page.secondary?.length === 2 && page.shards?.length === 3
  if (!complete) return null

  const sample = data.preciseRunes?.sample ?? 0
  const games = page.games ?? 0

  return {
    page,
    games,
    winrate: page.winrate ?? 0,
    share: sample > 0 ? (games / sample) * 100 : 0,
    role,
  }
}
