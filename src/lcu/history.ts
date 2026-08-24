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

/** One row of a finished game's scoreboard. */
export type MatchPlayer = {
  participantId: number
  /** 100 or 200 — which side, not which team you were on. */
  teamId: number
  championId: number
  /** "Name#TAG" when the client gives both, otherwise whatever it gives. */
  riotId: string | null
  name: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  creepScore: number
  goldEarned: number
  /** To champions, which is the number people mean by "damage". */
  damage: number
  damageTaken: number
  visionScore: number
  wardsPlaced: number
  champLevel: number
  items: number[]
  spells: [number, number]
  role: string | null
  /** True for the row belonging to the player whose history this is. */
  isMe: boolean
  /** Best on the winning side, or best on the losing side — ours. */
  honour: "mvp" | "ace" | null
}

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
  /** Who you were up against in your lane, when the lane is knowable. */
  opponent: { championId: number; role: string | null } | null
  /**
   * All ten players, once the per-game detail has been read.
   *
   * ⚠️ Null until enrich() has run, and null forever for a game whose detail
   * cannot be read. The list endpoint carries only you.
   */
  board: MatchPlayer[] | null
  /**
   * Best on the winning side, or best on the losing side.
   *
   * ⚠️ OURS, not Riot's. The client shows an MVP badge on its end screen and
   * does not publish the score behind it or expose the result in match
   * history — so this is computed here, and the interface says whose opinion
   * it is rather than borrowing the authority of the game's own badge.
   */
  honour: "mvp" | "ace" | null
}

type RawGame = {
  gameId: number
  gameCreation: number
  gameDuration: number
  queueId: number
  gameMode: string
  participants?: {
    participantId: number
    teamId?: number
    championId: number
    spell1Id: number
    spell2Id: number
    timeline?: { lane?: string; role?: string }
    stats?: Record<string, number | boolean>
  }[]
  participantIdentities?: {
    participantId: number
    player?: { puuid?: string; gameName?: string; tagLine?: string; summonerName?: string }
  }[]
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

/**
 * How well somebody played, relative to everyone else in that game.
 *
 * ⚠️ Ranked against the rest of the lobby rather than scored on an absolute
 * scale. Fixed thresholds cannot survive a fifty-minute game and a fifteen-
 * minute one, and every metric here is a share of the best in THIS match, so
 * the length cancels out.
 *
 * ⚠️ Vision and assists carry real weight on purpose. A formula built from
 * kills and damage hands the badge to the carry in every single game, and a
 * support who warded the whole map never appears — which is not a scoreboard,
 * it is a role preference.
 */
function rate(
  p: NonNullable<RawGame["participants"]>[number],
  peak: { kda: number; dmg: number; gold: number; cs: number; vision: number }
): number {
  const st = p.stats ?? {}
  const kda = (num(st.kills) + num(st.assists) * 0.6) / Math.max(1, num(st.deaths))
  const share = (v: number, max: number) => (max > 0 ? v / max : 0)
  return (
    share(kda, peak.kda) * 0.35 +
    share(num(st.totalDamageDealtToChampions), peak.dmg) * 0.25 +
    share(num(st.goldEarned), peak.gold) * 0.15 +
    share(num(st.totalMinionsKilled) + num(st.neutralMinionsKilled), peak.cs) * 0.1 +
    share(num(st.visionScore), peak.vision) * 0.15
  )
}

/** MVP for the winners, ACE for the losers — the participantIds of each. */
function honours(g: RawGame): { mvp: number | null; ace: number | null } {
  const all = g.participants ?? []
  if (all.length < 2) return { mvp: null, ace: null }

  const stat = (p: (typeof all)[number], k: string) => num((p.stats ?? {})[k])
  const peak = {
    kda: Math.max(...all.map((p) => (stat(p, "kills") + stat(p, "assists") * 0.6) / Math.max(1, stat(p, "deaths")))),
    dmg: Math.max(...all.map((p) => stat(p, "totalDamageDealtToChampions"))),
    gold: Math.max(...all.map((p) => stat(p, "goldEarned"))),
    cs: Math.max(...all.map((p) => stat(p, "totalMinionsKilled") + stat(p, "neutralMinionsKilled"))),
    vision: Math.max(...all.map((p) => stat(p, "visionScore"))),
  }

  const best = (won: boolean) => {
    const side = all.filter((p) => (p.stats?.win === true) === won)
    if (!side.length) return null
    return side.reduce((a, b) => (rate(b, peak) > rate(a, peak) ? b : a)).participantId
  }

  return { mvp: best(true), ace: best(false) }
}

/**
 * The whole scoreboard, in our shape.
 *
 * ⚠️ Riot's two arrays are joined by participantId, and the NAME lives in the
 * other one — participants carry the numbers, participantIdentities carry the
 * people. Nothing downstream should have to know that, which is the whole
 * reason this file exists.
 */
function readBoard(
  g: RawGame,
  meId: number,
  mvp: number | null,
  ace: number | null
): MatchPlayer[] {
  const who = new Map(
    (g.participantIdentities ?? []).map((i) => [i.participantId, i.player ?? {}])
  )

  return (g.participants ?? []).map((p) => {
    const st = p.stats ?? {}
    const player = who.get(p.participantId) ?? {}
    const game = player.gameName ?? player.summonerName ?? ""
    const tag = player.tagLine ?? ""

    return {
      participantId: p.participantId,
      teamId: num(p.teamId),
      championId: num(p.championId),
      riotId: game && tag ? `${game}#${tag}` : game || null,
      name: game || "—",
      win: st.win === true,
      kills: num(st.kills),
      deaths: num(st.deaths),
      assists: num(st.assists),
      creepScore: num(st.totalMinionsKilled) + num(st.neutralMinionsKilled),
      goldEarned: num(st.goldEarned),
      damage: num(st.totalDamageDealtToChampions),
      damageTaken: num(st.totalDamageTaken),
      visionScore: num(st.visionScore),
      wardsPlaced: num(st.wardsPlaced),
      champLevel: num(st.champLevel),
      items: [0, 1, 2, 3, 4, 5, 6].map((i) => num(st[`item${i}`])),
      spells: [num(p.spell1Id), num(p.spell2Id)],
      role: readRole(p.timeline),
      isMe: p.participantId === meId,
      honour: mvp === p.participantId ? "mvp" : ace === p.participantId ? "ace" : null,
    }
  })
}

/** Smite. The one role signal in this data that cannot be wrong. */
const SMITE = 11
const hasSmite = (p: NonNullable<RawGame["participants"]>[number]) =>
  p.spell1Id === SMITE || p.spell2Id === SMITE

/**
 * The champion who stood in the same lane on the other side.
 *
 * ⚠️ Riot's lane assignment in match history is a GUESS, derived from where
 * somebody farmed, and it is wrong often enough to matter: a Lillia jungle game
 * came back paired with the enemy TOP laner, because Yorick had been given
 * "JUNGLE" by that heuristic and matched first.
 *
 * So the jungle is decided by SMITE, which is a fact rather than an inference,
 * and everybody else is matched on lane with the enemy jungler removed from the
 * candidates first — a laner can be mislabelled as a jungler, but a jungler
 * carrying Smite cannot be your lane opponent.
 *
 * ⚠️ Null whenever this is not confident. A blank rhombus says "we do not
 * know", which is true and cheap; a confident wrong champion is the app lying
 * about a game the player was in and remembers.
 */
function opponentOf(
  g: RawGame,
  me: NonNullable<RawGame["participants"]>[number]
): { championId: number; role: string | null } | null {
  const role = readRole(me.timeline)
  if (me.teamId === undefined) return null
  const them = (g.participants ?? []).filter((p) => p.teamId !== me.teamId)
  if (!them.length) return null

  // Smite in hand: the opponent is whoever else brought it, whatever the
  // history thinks either of you farmed.
  if (hasSmite(me)) {
    const jungler = them.find(hasSmite)
    return jungler ? { championId: num(jungler.championId), role: "JUNGLE" } : null
  }

  if (!role || role === "JUNGLE") return null

  const laners = them.filter((p) => !hasSmite(p))
  const match = laners.find((p) => readRole(p.timeline) === role)
  return match ? { championId: num(match.championId), role } : null
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
    // Filled in by enrich() from the per-game endpoint; the list has only you.
    opponent: null,
    honour: null,
    board: null,
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
  const matches = games
    .map((g) => toMatch(g, puuid))
    .filter((m): m is Match => m !== null)
    .sort((a, b) => b.playedAt - a.playedAt)

  await enrich(lcu, matches, puuid)
  return matches
}

/* ── the other nine players ─────────────────────────────────────────────── */

/**
 * ⚠️ The LIST endpoint returns ONE participant — you.
 *
 * Measured, after building the lane opponent and the honour badge on the
 * assumption that it returned ten: `participants: 1, identities: 1`. Both
 * features came out null on every real game and worked perfectly against a
 * fixture, which is the most misleading combination there is.
 *
 * The other nine are only in the per-game endpoint, so that is fetched — and
 * cached, because a game that has been played does not change. A refresh
 * re-reads the list and asks for nothing it has already seen.
 */
const extras = new Map<number, Pick<Match, "opponent" | "honour" | "board">>()

/** At a time. The client is local and fast, but twenty simultaneous requests
 *  at it while somebody is in champion select is not a courtesy. */
const AT_ONCE = 4

async function enrich(lcu: LcuConnection, matches: Match[], puuid: string): Promise<void> {
  const need = matches.filter((m) => !extras.has(m.gameId))

  for (let i = 0; i < need.length; i += AT_ONCE) {
    await Promise.all(
      need.slice(i, i + AT_ONCE).map(async (m) => {
        try {
          const { data } = await lcu.request<RawGame>("GET", `/lol-match-history/v1/games/${m.gameId}`)
          if (!data?.participants?.length) return
          const identity = data.participantIdentities?.find((x) => x.player?.puuid === puuid)
          const me = identity && data.participants.find((p) => p.participantId === identity.participantId)
          if (!me) return
          const { mvp, ace } = honours(data)
          extras.set(m.gameId, {
            opponent: opponentOf(data, me),
            honour: mvp === me.participantId ? "mvp" : ace === me.participantId ? "ace" : null,
            board: readBoard(data, me.participantId, mvp, ace),
          })
        } catch {
          // ⚠️ Never fatal. A game whose detail cannot be read shows no
          // opponent and no badge, which is exactly what those fields mean
          // when they are null — the row itself is unaffected.
        }
      })
    )
  }

  for (const m of matches) {
    const extra = extras.get(m.gameId)
    if (!extra) continue
    m.opponent = extra.opponent
    m.honour = extra.honour
    m.board = extra.board
  }
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
