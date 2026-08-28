/**
 * The one place that talks to the League client.
 *
 * Everything above this file works in our own domain types. That is deliberate:
 * Riot has announced a brand-new integrated client after 2026 which replaces the
 * one the LCU *is*, so the day it lands we want to rewrite an adapter rather
 * than an application. Nothing outside src/lcu/ should know what an
 * `/lol-champ-select/v1/session` is.
 */
import NodeWebSocket from "ws"
import { findClient, type LcuCredentials } from "./credentials"
import { lcuFetch } from "./http"

/** The client presents a self-signed certificate on 127.0.0.1. */
const TLS = { rejectUnauthorized: false }

const isBun = () => typeof (globalThis as any).Bun !== "undefined"

/** Riot's platform ids to the region segment our API uses. */
const PLATFORM_REGION: Record<string, string> = {
  euw1: "euw", eun1: "eune", na1: "na", kr: "kr", br1: "br", jp1: "jp",
  la1: "lan", la2: "las", oc1: "oce", tr1: "tr", ru: "ru", ph2: "ph",
  sg2: "sg", th2: "th", tw2: "tw", vn2: "vn", me1: "me",
}

/** Set once per game, so the shape dump does not repeat every poll. */
let lastShapeLogged: unknown = null

/** One player in a game being loaded. */
export type RosterEntry = {
  championKey: number
  name: string
  tag: string
  puuid: string
}

export type Phase =
  | "None" | "Lobby" | "Matchmaking" | "ReadyCheck" | "ChampSelect"
  | "GameStart" | "InProgress" | "Reconnect" | "WaitingForStats"
  | "PreEndOfGame" | "EndOfGame" | "TerminatedInError"

export type LcuEvent = {
  uri: string
  type: "Create" | "Update" | "Delete"
  data: unknown
}

export class LcuConnection {
  private creds: LcuCredentials | null = null
  private ws: any = null
  private stopped = false
  private pollTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly handlers: {
      onConnect?: (info: { port: number; source: string }) => void
      onDisconnect?: () => void
      onEvent?: (e: LcuEvent) => void
      onError?: (message: string) => void
    } = {}
  ) {}

  /** GET/POST/PUT against the client. Throws only on transport failure. */
  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T | null }> {
    if (!this.creds) throw new Error("not connected to the client")
    return lcuFetch<T>(this.creds.port, this.creds.authHeader, method, path, body)
  }

  /**
   * Waits for the client, connects, and keeps trying if it is not there yet.
   * A closed client is a normal state — the app sits idle until one appears.
   */
  async start(): Promise<void> {
    this.stopped = false
    await this.attach()
  }

  stop(): void {
    this.stopped = true
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.ws?.close()
    this.ws = null
    this.creds = null
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => void this.attach(), ms)
  }

  private async attach(): Promise<void> {
    if (this.stopped) return

    const creds = await findClient()
    if (!creds) {
      this.creds = null
      this.schedule(2000)
      return
    }
    this.creds = creds

    // WAMP 1.0 over the same port and credentials: opcode 5 subscribes,
    // 6 unsubscribes, 8 is an event arriving.
    //
    // The socket has to come from whichever implementation the current runtime
    // actually honours. Bun's `ws` compatibility shim silently drops the
    // headers and TLS options — it connects to nothing and times out, with no
    // error — so under Bun we use its native WebSocket, which does support both
    // as an extension. Under Node the native one supports neither, so `ws` is
    // the right choice there. Both expose addEventListener, so there is one
    // code path below.
    const url = `wss://127.0.0.1:${creds.port}`
    const ws: any = isBun()
      ? new WebSocket(url, { headers: { Authorization: creds.authHeader }, tls: TLS } as any)
      : new NodeWebSocket(url, { headers: { Authorization: creds.authHeader }, ...TLS })
    this.ws = ws

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify([5, "OnJsonApiEvent"]))
      this.handlers.onConnect?.({ port: creds.port, source: creds.source })
    })

    ws.addEventListener("message", (ev: { data: unknown }) => {
      const text = String((ev as any).data ?? "")
      if (!text) return // the client sends empty frames as keep-alives
      let frame: unknown
      try { frame = JSON.parse(text) } catch { return }
      if (!Array.isArray(frame) || frame[0] !== 8) return
      const payload = frame[2] as { uri?: string; eventType?: string; data?: unknown }
      if (!payload?.uri) return
      this.handlers.onEvent?.({
        uri: payload.uri,
        type: (payload.eventType ?? "Update") as LcuEvent["type"],
        data: payload.data,
      })
    })

    const drop = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.creds = null
      this.handlers.onDisconnect?.()
      this.schedule(2000)
    }
    ws.addEventListener("close", drop)
    ws.addEventListener("error", (err: any) => {
      // A refused socket usually means the client closed between finding the
      // credential and opening the connection — normal, not worth surfacing.
      const msg = err?.message ?? err?.error?.message ?? "socket error"
      if (!/ECONNREFUSED|ECONNRESET/.test(msg)) this.handlers.onError?.(msg)
      drop()
    })
  }

  // ── the small, typed surface the rest of the app is allowed to use ──────

  async currentSummoner(): Promise<{
    name: string
    tag: string
    level: number
    /** Needed to find the player in a match's participant list. */
    puuid: string
    /** The icon they actually chose — the app should look like their account. */
    iconId: number
  } | null> {
    const { data } = await this.request<any>("GET", "/lol-summoner/v1/current-summoner")
    if (!data) return null
    return {
      name: data.gameName ?? data.displayName ?? "",
      tag: data.tagLine ?? "",
      level: data.summonerLevel ?? 0,
      puuid: data.puuid ?? "",
      iconId: data.profileIconId ?? 0,
    }
  }

  /**
   * The account's region, in the form our own API expects.
   *
   * ⚠️ From /riotclient/region-locale, whose `webRegion` field IS that form —
   * "euw", not "EUW1". Verified against a running client.
   *
   * The first attempt used /lol-platform-config/…/platformId, which 404s on
   * the current client. It failed SILENTLY: region came back null, every rank
   * lookup returned before making a request, and the loading cards sat on
   * their initial "UNRANKED" — a wrong answer that looked like a real one.
   *
   * /lol-chat/v1/me is the fallback because it reports a platformId ("EUW1")
   * from a different subsystem, so one endpoint moving does not take the
   * feature with it.
   */
  async region(): Promise<string | null> {
    const { data } = await this.request<any>("GET", "/riotclient/region-locale")
    const web = String(data?.webRegion ?? "").toLowerCase()
    if (web) return web

    const chat = await this.request<any>("GET", "/lol-chat/v1/me").catch(() => ({ data: null }))
    const platform = String(chat?.data?.platformId ?? "").toLowerCase()
    return PLATFORM_REGION[platform] ?? (platform || null)
  }

  /**
   * The roster of the game being loaded.
   *
   * ⚠️ The Live Client Data API does not carry the ROSTER during the loading
   * screen, so this is the only source for who is in the game while that screen
   * is on.
   *
   * This used to claim the 2999 API "is NOT up during the loading screen". It
   * is — measured: it answers at gameTime=0.0 with the board still on screen,
   * and that stopped clock is exactly how the app knows a loading screen is up
   * (paintBoard, shell/main.ts). The wrong version of this comment nearly cost
   * that mechanism, so the correction stays here. The session itself only exists
   * during a game flow; it 404s from an idle client, which is why the caller
   * treats a null as "not in a game" rather than as a fault.
   *
   * teamOne is ORDER and teamTwo is CHAOS, always. Which of them is OURS has to
   * be worked out from the puuid — the loading screen puts your own team on
   * top whichever side you are on.
   */
  async gameRoster(myPuuid: string): Promise<{
    allies: RosterEntry[]
    enemies: RosterEntry[]
  } | null> {
    const { data } = await this.request<any>("GET", "/lol-gameflow/v1/session")
    const one = data?.gameData?.teamOne
    const two = data?.gameData?.teamTwo
    if (!Array.isArray(one) || !Array.isArray(two)) return null

    // ⚠️ Logged once per game, because this endpoint's shape was taken from
    // documentation and the documentation was wrong: a real ranked game gave
    // one player, no opponents and no names at all. Printing the KEYS is how
    // that gets settled — the values may carry identity, the key names do not.
    const shape = [...one, ...two][0]
    if (shape && lastShapeLogged !== data?.gameData?.gameId) {
      lastShapeLogged = data?.gameData?.gameId
      console.log("[roster] teamOne=%d teamTwo=%d fields=%s",
        one.length, two.length, Object.keys(shape).join(","))
    }

    const read = (p: any): RosterEntry => ({
      championKey: Number(p?.championId ?? 0),
      name: p?.gameName ?? p?.summonerName ?? "",
      tag: p?.tagLine ?? "",
      puuid: String(p?.puuid ?? ""),
    })

    const mine = one.some((p: any) => p?.puuid && p.puuid === myPuuid)
    const allies = (mine ? one : two).map(read)
    const enemies = (mine ? two : one).map(read)

    // ⚠️ Names are frequently ABSENT here — the session carries ids, not
    // identities. Without a name#tag nothing downstream can look anyone up,
    // which is exactly how a real game produced "no riot ids to look up".
    // The client can resolve a puuid locally, so it is asked.
    await Promise.all([...allies, ...enemies].map((e) => this.fillName(e)))

    return { allies, enemies }
  }

  /** Fills in name and tag from a puuid, using the CLIENT rather than the
   *  network — it already knows everyone in the game. */
  private async fillName(entry: RosterEntry): Promise<void> {
    if ((entry.name && entry.tag) || !entry.puuid) return
    try {
      const { data } = await this.request<any>(
        "GET",
        `/lol-summoner/v2/summoners/puuid/${entry.puuid}`
      )
      if (data?.gameName) {
        entry.name = data.gameName
        entry.tag = data.tagLine ?? ""
      }
    } catch {
      // One unresolvable player costs that player's card, not the board.
    }
  }

  async phase(): Promise<Phase | null> {
    const { data } = await this.request<Phase>("GET", "/lol-gameflow/v1/gameflow-phase")
    return data
  }

  /** The champion select as it stands right now. Null when not in one. */
  async champSelect(): Promise<unknown | null> {
    const { status, data } = await this.request("GET", "/lol-champ-select/v1/session")
    return status === 200 ? data : null
  }
}
