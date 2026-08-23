/**
 * A stand-in for the Electron bridge, used only when the renderer is opened in
 * a plain browser.
 *
 * The interface is most of the work and iterating on it by restarting Electron
 * is slow, so the renderer is built to run anywhere: if `window.desktop` is
 * missing it gets this instead. It also makes states reachable on demand that
 * are otherwise a queue and a champion select away —
 * `?state=waiting|lobby|select|game`.
 *
 * This never ships behaviour into the real app: inside Electron the preload has
 * already defined window.desktop, so install() returns immediately.
 */
type Listener = (s: unknown) => void

const SCENES: Record<string, unknown> = {
  waiting: {
    client: "waiting",
    summoner: null,
    phase: null,
    patch: "16.16.1",
    select: null,
    notice: null,
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  lobby: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "Lobby",
    patch: "16.16.1",
    select: null,
    notice: null,
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  select: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "ChampSelect",
    patch: "16.16.1",
    select: {
      champion: { slug: "Nami", key: 267, name: "Nami" },
      role: null, // a custom, where the client assigns no position
      allies: { locked: 3, total: 5 },
      enemies: { locked: 1, total: 5 },
    },
    notice: null,
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  game: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: null,
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // the state the whole feature exists for
  soon: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "dragon",
      inSeconds: 90,
      raisedAt: Date.now(),
      element: null,
      tally: { ours: [], theirs: [] },
    },
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  elder: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "elder",
      inSeconds: 90,
      raisedAt: Date.now(),
      element: null,
      tally: { ours: [], theirs: [] },
    },
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // From the third dragon on the element is knowable — this is that case.
  infernal: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "dragon",
      inSeconds: 90,
      raisedAt: Date.now(),
      element: "Fire",
      // soul is one drake away for us, and they have two
      tally: { ours: ["Fire", "Water", "Air"], theirs: ["Earth", "Hextech"] },
    },
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // three ours, the next drake ends it — the live case
  soul: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "dragon", inSeconds: 90, raisedAt: Date.now(), element: "Air",
      tally: { ours: ["Fire", "Hextech", "Air"], theirs: [] },
    },
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // the same brink, on the wrong side of it
  soulenemy: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "dragon", inSeconds: 90, raisedAt: Date.now(), element: "Water",
      tally: { ours: ["Fire"], theirs: ["Water", "Earth", "Hextech"] },
    },
    levelHint: null,
    pinned: false,
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE" },
      { gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT" },
      { gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE" },
      { gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
}

export function installDevShell(): void {
  if ((window as any).desktop) return // running inside Electron — nothing to do

  const params = new URLSearchParams(location.search)
  const scene = params.get("state") ?? "select"
  let state = SCENES[scene] ?? SCENES.select
  // ?hint=Q lights the ability outline without needing a game or the shell.
  const hint = params.get("hint")
  if (hint) state = { ...(state as object), levelHint: hint }
  const listeners = new Set<Listener>()

  ;(window as any).desktop = {
    getState: async () => state,
    onState: (fn: Listener) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    minimise: () => console.info("[dev shell] minimise"),
    close: () => console.info("[dev shell] close"),
  }

  // Handy while designing: flip scenes from the console without a reload.
  ;(window as any).setScene = (name: keyof typeof SCENES) => {
    state = SCENES[name] ?? state
    listeners.forEach((fn) => fn(state))
  }
}
