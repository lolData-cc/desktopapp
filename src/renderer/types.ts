/**
 * What the interface is allowed to know, and how it can answer back.
 *
 * Mirrors the shell's AppState structurally rather than importing it: the
 * renderer is meant to survive the shell being replaced — if this becomes Tauri
 * one day, nothing under src/renderer should have to change.
 *
 * Note what is NOT here. There is no session token, no client credential, no
 * League URI. The renderer gets an ACCOUNT — an email and a tier — and asks the
 * shell to act on its behalf. A surface that cannot hold a credential cannot
 * leak one.
 */
import type { Ability, HudNudge } from "../data/hud"

export const CDN = "https://cdn2.loldata.cc"
/** For assets Riot never published to DDragon, like the rank crests. */
export const CDRAGON = "https://raw.communitydragon.org/latest"

export type Champion = { slug: string; key: number; name: string }

export type Match = {
  gameId: number
  playedAt: number
  durationSeconds: number
  queueId: number
  gameMode: string
  win: boolean
  remake: boolean
  championId: number
  champLevel: number
  kills: number
  deaths: number
  assists: number
  creepScore: number
  goldEarned: number
  visionScore: number
  items: number[]
  spells: [number, number]
  role: string | null
}

export type RankedSummary = {
  tier: string | null
  division: string | null
  leaguePoints: number
  wins: number
  losses: number
  queue: string
}

export type RuneVariant = {
  page: {
    keystone: number
    primaryStyle: number
    primary: number[]
    subStyle: number
    secondary: number[]
    shards: number[]
  }
  games: number
  winrate: number
  share: number
  label: string
}

export type AppState = {
  client: "waiting" | "attached"
  summoner: { name: string; tag: string; level: number; puuid: string; iconId: number } | null
  ranked: RankedSummary | null
  matches: Match[] | null
  phase: string | null
  patch: string | null
  select: {
    champion: Champion | null
    role: string | null
    allies: { locked: number; total: number }
    enemies: { locked: number; total: number }
  } | null
  levelHint: Ability | null
  runes: {
    variants: RuneVariant[]
    chosen: number
    remembered: boolean
    pageName: string
  } | null
  runeImport:
    | { state: "idle" }
    | { state: "working" }
    | { state: "done"; name: string; replaced: boolean }
    | { state: "no-room"; pages: { id: number; name: string }[] }
    | { state: "error"; message: string }
  account: { email: string | null; tier: string | null } | null
  update:
    | { state: "idle"; version: string }
    | { state: "checking"; version: string }
    | { state: "current"; version: string; checkedAt: number }
    | { state: "available"; version: string; next: string; notes: string | null }
    | { state: "downloading"; version: string; next: string; percent: number }
    | { state: "ready"; version: string; next: string }
    | { state: "failed"; version: string; message: string }
  canUpdate: boolean
  pinned: boolean
  hud: { scale: number; nudge: HudNudge; source: string | null }
}

export type ChatMessage = { role: "user" | "assistant"; content: string }
export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; reason: "signed-out" | "not-premium" | "no-credits" | "failed"; message: string }

declare global {
  interface Window {
    desktop: {
      getState(): Promise<AppState>
      onState(fn: (s: AppState) => void): () => void
      minimise(): void
      close(): void
      pinOverlay(on: boolean): void
      demoOverlay(): void
      importRunes(): Promise<void>
      chooseRunes(index: number): void
      refreshProfile(): Promise<void>
      signIn(): void
      signOut(): Promise<void>
      askAi(messages: ChatMessage[]): Promise<ChatResult>
      openExternal(url: string): void
      checkUpdate(): Promise<void>
      downloadUpdate(): Promise<void>
      installUpdate(): void
      calibrate(patch: Partial<HudNudge>): void
      hint(ability: Ability | null): void
      report?(info: unknown): void
    }
  }
}

/** Elite counts as premium wherever premium is the gate. */
export const isPremium = (tier: string | null | undefined): boolean =>
  tier === "premium" || tier === "elite"

/**
 * The plan crest, from the site's own badge set — the same image a premium
 * profile shows there, so the two surfaces mark a plan the same way.
 *
 * Null for the free tier: a badge meaning "no plan" is a contradiction, and the
 * account menu already says which plan it is in words.
 */
export function planBadge(tier: string | null | undefined): string | null {
  if (tier === "elite") return `${CDN}/img/badge/loldata-plans/Elite.png`
  if (tier === "premium") return `${CDN}/img/badge/loldata-plans/Premium.png`
  return null
}

/** Riot's queue ids, as words. Unknown ones say so instead of guessing. */
export const QUEUE_NAME: Record<number, string> = {
  400: "Draft Pick",
  420: "Ranked Solo",
  430: "Blind Pick",
  440: "Ranked Flex",
  450: "ARAM",
  490: "Quickplay",
  700: "Clash",
  720: "ARAM Clash",
  830: "Co-op vs AI",
  840: "Co-op vs AI",
  850: "Co-op vs AI",
  900: "URF",
  1020: "One for All",
  1700: "Arena",
  1900: "URF",
  2000: "Tutorial",
  2010: "Tutorial",
  2020: "Tutorial",
  3140: "Practice Tool",
}

export const queueName = (id: number, mode: string): string =>
  QUEUE_NAME[id] ?? (mode === "PRACTICETOOL" ? "Practice Tool" : mode === "CLASSIC" ? "Custom" : mode)

/** "12m ago", "3d ago" — precise enough to place a game, short enough for a row. */
export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 90) return "just now"
  const m = s / 60
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  const d = h / 24
  if (d < 7) return `${Math.round(d)}d ago`
  return `${Math.round(d / 7)}w ago`
}

export const mmss = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
