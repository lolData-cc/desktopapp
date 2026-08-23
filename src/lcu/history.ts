/**
 * The player's recent games, read from the client.
 *
 * From the LCU rather than from our own API on purpose: it is already local, it
 * needs no account, and it is there the instant the client is — no waiting for
 * an ingest to have seen the game. It is also the player's OWN history, which
 * is the least contentious data in the whole client.
 *
 * The shape here is ours, not Riot's. The LCU returns a deep object with two
 * parallel arrays that have to be joined by participantId; nothing downstream
 * should have to know that.
 */
import type { LcuConnection } from "./connection"

export type Match = {
  gameId: number
  /** Milliseconds since epoch, from the client's own clock. */
  playedAt: number
  durationSeconds: number
  queueId: number
  gameMode: string
  win: boolean
  /** True for a game that ended before it counted — shown, but set apart. */
  remake: boolean
  championId: number
  champLevel: number
  kills: number
  deaths: number
  assists: number
  creepScore: number
  goldEarned: number
  visionScore: number
  /** Final inventory, trinket last, zeroes stripped. */
  items: number[]
  spells: [number, number]
  role: string | null
}

type RawGame = {
  gameId: number
  gameCreation: number
  gameDuration: number
  queueId: number
  gameMode: string
  participants?: {
    participantId: number
    championId: number
    spell1Id: number
    spell2Id: number
    timeline?: { lane?: string; role?: string }
    stats?: Record<string, number | boolean>
  }[]
  participantIdentities?: { participantId: number; player?: { puuid?: string } }[]
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** Riot's lane vocabulary is not the one the rest of the app speaks. */
function readRole(t: { lane?: string; role?: string } | undefined): string | null {
  const lane = t?.lane
  if (!lane || lane === "NONE") return t?.role === "DUO_SUPPORT" ? "SUPPORT" : null
  if (lane === "BOTTOM") return t?.role === "DUO_SUPPORT" ? "SUPPORT" : "BOTTOM"
  if (lane === "JUNGLE" || lane === "MIDDLE" || lane === "TOP") return lane
  return null
}

function toMatch(g: RawGame, puuid: string): Match | null {
  // The two arrays are parallel but not ordered, so the join is by id.
  const identity = g.participantIdentities?.find((i) => i.player?.puuid === puuid)
  const me = identity && g.participants?.find((p) => p.participantId === identity.participantId)
  if (!me) return null

  const st = me.stats ?? {}
  const items = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => num(st[`item${i}`]))
    .filter((id) => id > 0)

  const duration = num(g.gameDuration)

  return {
    gameId: g.gameId,
    playedAt: num(g.gameCreation),
    durationSeconds: duration,
    queueId: num(g.queueId),
    gameMode: g.gameMode ?? "CLASSIC",
    win: st.win === true,
    // Under five minutes, or the client says so: a remake is not a loss, and
    // counting it as one is the mistake the website's season stats already made.
    remake: duration < 300 || st.gameEndedInEarlySurrender === true,
    championId: num(me.championId),
    champLevel: num(st.champLevel),
    kills: num(st.kills),
    deaths: num(st.deaths),
    assists: num(st.assists),
    creepScore: num(st.totalMinionsKilled) + num(st.neutralMinionsKilled),
    goldEarned: num(st.goldEarned),
    visionScore: num(st.visionScore),
    items,
    spells: [num(me.spell1Id), num(me.spell2Id)],
    role: readRole(me.timeline),
  }
}

/** Empty rather than throwing when the client has nothing to give — a fresh
 *  account has no history, and that is not an error state. */
export async function recentMatches(
  lcu: LcuConnection,
  puuid: string,
  count = 20
): Promise<Match[]> {
  const { data } = await lcu.request<{ games?: { games?: RawGame[] } }>(
    "GET",
    `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`
  )
  const games = data?.games?.games ?? []
  return games
    .map((g) => toMatch(g, puuid))
    .filter((m): m is Match => m !== null)
    .sort((a, b) => b.playedAt - a.playedAt)
}

export type RankedSummary = {
  tier: string | null
  division: string | null
  leaguePoints: number
  wins: number
  losses: number
  queue: string
}

/** Solo queue, falling back to whatever the client considers the highest entry. */
export async function rankedSummary(lcu: LcuConnection): Promise<RankedSummary | null> {
  const { data } = await lcu.request<any>("GET", "/lol-ranked/v1/current-ranked-stats")
  if (!data) return null

  const solo = data.queueMap?.RANKED_SOLO_5x5
  const entry = solo?.tier ? solo : data.highestRankedEntry
  if (!entry?.tier) return null

  return {
    tier: entry.tier || null,
    division: entry.division === "NA" ? null : entry.division || null,
    leaguePoints: num(entry.leaguePoints),
    wins: num(entry.wins),
    losses: num(entry.losses),
    queue: entry.queueType ?? "RANKED_SOLO_5x5",
  }
}
