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
 *
 * ALL of them are returned, not just the first. The site offers the same five
 * and lets you pick; an app that only knew about the most played one would
 * overwrite a deliberate choice every time champ select came round.
 */
import type { BuildPage } from "../lcu/runes"

const API = "https://api2.loldata.cc"

export type RuneVariant = {
  page: BuildPage
  /** Games behind this exact page, for saying how well attested it is. */
  games: number
  winrate: number
  /** Of the champion's total sample, so "88% of Nami players" is sayable. */
  share: number
  /** The site's own words for these, so the two surfaces agree. */
  label: string
}

export type RuneSuggestion = {
  variants: RuneVariant[]
  role: string | null

}

/** Identical to the website's, deliberately — the same page must not be called
 *  one thing there and another here. */
const VARIANT_LABEL = ["Most Popular", "2nd Most Popular", "Alternative", "Off-Meta", "Niche"]

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
export async function championRunes(
  championKey: number,
  championName: string,
  role: string | null,
  signal?: AbortSignal
): Promise<RuneSuggestion | null> {
  const pagesFor = async (r: string | null): Promise<RuneVariant[]> => {
    const res = await fetch(`${API}/api/champion/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The endpoint wants BOTH the numeric key and the name; sending one gets a
      // 400 that says so.
      body: JSON.stringify({ champKey: championKey, champion: championName, role: r ?? undefined }),
      signal,
    })
    if (!res.ok) return []

    const data = (await res.json()) as BuildResponse
    const sample = data.preciseRunes?.sample ?? 0

    return (data.preciseRunes?.pages ?? [])
      // A page short of its nine perks is dropped rather than half-written to the
      // client, and dropping it here keeps the labels aligned with the site's.
      .filter((p) => p.primary?.length === 4 && p.secondary?.length === 2 && p.shards?.length === 3)
      .map((page, i) => ({
        page,
        games: page.games ?? 0,
        winrate: page.winrate ?? 0,
        share: sample > 0 ? ((page.games ?? 0) / sample) * 100 : 0,
        label: VARIANT_LABEL[i] ?? `Build ${i + 1}`,
      }))
  }

  const scoped = await pagesFor(role)
  if (scoped.length) return { variants: scoped, role }

  /**
   * ⚠️ NO FALLBACK TO THE CHAMPION'S OTHER ROLES. This used to ask again
   * without a role and hand those pages over with a quiet "· all roles" note.
   *
   * That is worse than showing nothing, and it was reported as a serious bug the
   * first time it met a real pick: Twisted Fate TOP has a sample of zero, so the
   * unscoped query answered with his 399,190 MID games and the app recommended
   * Arcane Comet — a mid rune page — to somebody about to play top. A rune page
   * is advice you ACT on, and a small provenance label at the bottom of the card
   * cannot carry that weight.
   *
   * The panel still appears; it simply makes no recommendation and says why.
   * Silence with a reason, never the wrong lane's runes.
   */
  return null
}
