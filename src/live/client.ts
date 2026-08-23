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
  DragonType?: string
  Stolen?: string
}

export type PlayerSlot = { riotId?: string; summonerName?: string; team: string }

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

export async function liveEvents(): Promise<GameEvent[]> {
  const wrap = await get<{ Events?: GameEvent[] }>("/eventdata")
  return wrap?.Events ?? []
}

/** True while a match is actually running. */
export async function isInGame(): Promise<boolean> {
  return (await liveGameStats()) !== null
}
