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
   * The client reports a PLATFORM ("EUW1"); the site's routes take a REGION
   * ("euw"). They are not the same string and there is no rule connecting
   * them — "la1" is "lan" — so the map is written out rather than derived.
   */
  async region(): Promise<string | null> {
    const { data } = await this.request<any>(
      "GET",
      "/lol-platform-config/v1/namespaces/LoginDataPacket/platformId"
    )
    const platform = String(data ?? "").toLowerCase()
    return PLATFORM_REGION[platform] ?? (platform || null)
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
