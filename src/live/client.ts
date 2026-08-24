/**
 * The in-game API, on 127.0.0.1:2999.
 *
 * A different surface from the LCU and worth keeping separate: it is Riot's
 * DOCUMENTED one, it needs no credential, and it only exists while a match is
 * running. It also has no event stream — there is nothing to subscribe to, so
 * this polls.
 *
 * `node:https` again, not `fetch`. The `tls` option on fetch is a Bun extension
 * that Node ignores in silence, and this code runs in Electron's main process,
 * which is Node.
 */
import { request as httpsRequest } from "node:https"

const PORT = 2999

export type GameStats = {
  gameMode: string
  gameTime: number // seconds since the game clock started
  mapName: string
  /** The Rift's transformation: "Default" until the map changes, then the
   *  element every remaining dragon will be. The only forward-looking signal
   *  Riot exposes about dragons. */
  mapTerrain?: string
}

export type GameEvent = {
  EventID: number
  EventName: string
  EventTime: number // seconds on the same clock as gameTime
  KillerName?: string
  /** ChampionKill: who died. */
  VictimName?: string
  /** ChampionKill: everyone who helped. */
  Assisters?: string[]
  DragonType?: string
  Stolen?: string
}

export type PlayerSlot = {
  riotId?: string
  /** The name without the tag, which is what a scoreboard shows. */
  riotIdGameName?: string
  summonerName?: string
  team: string
  championName?: string
  level?: number
  /** TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY. Empty string in modes that have
   *  no lanes, and in a custom game with the roles unset — so never assume it. */
  position?: string
  isBot?: boolean
  isDead?: boolean
  /** Seconds left, when dead. */
  respawnTimer?: number
  scores?: {
    kills: number
    deaths: number
    assists: number
    creepScore: number
    wardScore: number
  }
  runes?: {
    keystone?: { id?: number; displayName?: string }
  }
  /** Present for EVERY player, ours and theirs — the same inventory the
   *  scoreboard shows when Tab is held. */
  items?: { itemID: number; count?: number }[]
}

function get<T>(path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = httpsRequest(
      { host: "127.0.0.1", port: PORT, path: `/liveclientdata${path}`, method: "GET", rejectUnauthorized: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(null)
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T) }
          catch { resolve(null) }
        })
      }
    )
    // No game running is the normal case, not an error — the port simply is not
    // listening between matches.
    req.on("error", () => resolve(null))
    req.end()
  })
}

export const liveGameStats = () => get<GameStats>("/gamestats")
export const liveActivePlayerName = () => get<string>("/activeplayername")

export const livePlayers = () => get<PlayerSlot[]>("/playerlist")

/** Your own gold and inventory. Yours only — the scoreboard shows everyone's
 *  items, but this is the pair the shop decisions are made from. */
export async function liveOwnPurse(riotId: string): Promise<{
  gold: number
  items: { itemID: number; count?: number }[]
} | null> {
  const [ap, items] = await Promise.all([
    get<{ currentGold?: number }>("/activeplayer"),
    get<{ itemID: number; count?: number }[]>(`/playeritems?riotId=${encodeURIComponent(riotId)}`),
  ])
  if (!ap) return null
  return {
    gold: Math.max(0, Math.floor(ap.currentGold ?? 0)),
    items: (items ?? []).filter((i) => Number.isFinite(i?.itemID)),
  }
}

export async function liveEvents(): Promise<GameEvent[]> {
  const wrap = await get<{ Events?: GameEvent[] }>("/eventdata")
  return wrap?.Events ?? []
}

/** True while a match is actually running. */
export async function isInGame(): Promise<boolean> {
  return (await liveGameStats()) !== null
}
