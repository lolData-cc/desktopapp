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

/**
 * What the Settings page owns.
 *
 * ⚠️ Mirrors shell/prefs.ts rather than importing it: shell/ is Node-only and
 * the renderer is meant to survive it being replaced. The two must move
 * together — a key added there and missed here is a switch that writes a value
 * nothing reads.
 */
/**
 * A player's ranked standing.
 *
 * Tier kept separate from the label because they answer different questions:
 * "DIAMOND II" is what to print, "diamond" is which emblem to fetch. Deriving
 * one from the other at render time is how a Master player, who has no
 * division, ends up asking for "master-.png".
 */
export type PlayerRank = {
  label: string
  tier: string
  wins: number
  losses: number
}

/** One card on the loading screen. */
export type LoadingPlayer = {
  name: string
  championId: string | null
  championKey: number
  rank: PlayerRank | null
}

/** One scoreboard row, assembled by the shell. Mirrors LivePlayer there. */
export type LivePlayer = {
  name: string
  /** Full "Name#TAG" — the rank lookup needs the tag, the card does not. */
  riotId: string | null
  champion: string
  championId: string | null
  level: number
  position: string | null
  dead: boolean
  respawnIn: number
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  wards: number
  /** What they are CARRYING, in gold — not what they have earned. */
  worth: number
  items: number[]
  keystone: number | null
  isMe: boolean
}

export type AppSettings = {
  launchAtLogin: boolean
  smartBuild: boolean
  goldReadout: boolean
  loadingBoard: boolean
  objectiveNotices: boolean
  buildNotices: boolean
}

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
    | { state: "build-saved"; champion: string; items: number }
    | { state: "no-room"; pages: { id: number; name: string }[] }
    | { state: "error"; message: string }
  gold: { ours: number; theirs: number; oursCounted: number; theirsCounted: number } | null
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
  builds: {
    championId: string
    championName: string
    championKey: number
    role: string | null
    items: number[]
    runes?: string | null
    enabled: boolean
    source: "champ-select" | "site"
    savedAt: number
    patch: string | null
  }[]
  matchup: {
    slots: { item: number; games: number; winrate: number; lift: number; pickrate: number }[]
    cohortGames: number
    applied: { cls: string; count: number }[]
    shapeLabel: string
    ccNames: string[]
    ccKeys: number[]
    ccHeavy: boolean
    patch: string
  } | null
  matchupLoading: boolean
  pinned: boolean
  hud: { scale: number; nudge: HudNudge; topRight?: HudNudge; source: string | null }
  settings: AppSettings
  /**
   * The ten players while the LOADING SCREEN is up.
   *
   * A different source from `scoreboard`: the Live Client Data API does not
   * answer until the player is in the world, so during loading the roster can
   * only come from the client's own session.
   */
  loading: {
    allies: LoadingPlayer[]
    enemies: LoadingPlayer[]
  } | null
  /** Alignment for the loading cards, and whether the outlines are drawn. */
  loadingNudge: { x: number; y: number; scale: number }
  loadingCalibrating: boolean
  /** The champion we last played, from the live game rather than from match
   *  history — which the client writes at its own pace. */
  lastPlayed: { championId: string; championKey: number } | null
  region: string | null
  /** The board as it stood when the game ended — the live one is gone by
   *  the time the recap opens. */
  finalBoard: { ours: LivePlayer[]; theirs: LivePlayer[] } | null
  scoreboard: {
    gameTime: number
    ours: LivePlayer[]
    theirs: LivePlayer[]
  } | null
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
      demoRecal(): void
      demoLoading(): void
      calibrateLoading(patch: Partial<{ x: number; y: number; scale: number }>): void
      importRunes(): Promise<void>
      chooseRunes(index: number): void
      refreshProfile(): Promise<void>
      setSetting(patch: Partial<AppSettings>): Promise<AppSettings>
      revealSettings(): Promise<void>
      /** A champion's model as a GLB, cached on disk by the shell. Null when
       *  it could not be fetched. */
      model(championId: string, key: number): Promise<ArrayBuffer | null>
      /** Ranked tier per riotId, for the players in a finished game. */
      ranks(riotIds: string[], region: string | null): Promise<Record<string, string | null>>
      signIn(): void
      signOut(): Promise<void>
      askAi(messages: ChatMessage[]): Promise<ChatResult>
      openExternal(url: string): void
      checkUpdate(): Promise<void>
      downloadUpdate(): Promise<void>
      installUpdate(): void
      relaunch(): void
      demoGold(): void
      saveBuild(): Promise<void>
      updateBuild(championId: string, items: number[], runes: string | null): Promise<void>
      toggleBuild(championId: string, enabled: boolean): Promise<void>
      deleteBuild(championId: string): Promise<void>
      calibrate(patch: Partial<HudNudge>): void
      calibrateTopRight(patch: Partial<HudNudge>): void
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
