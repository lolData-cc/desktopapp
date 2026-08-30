/**
 * A stand-in for the Electron bridge, used only when the renderer is opened in
 * a plain browser.
 *
 * The interface is most of the work and iterating on it by restarting Electron
 * is slow, so the renderer is built to run anywhere: if `window.desktop` is
 * missing it gets this instead. It also makes states reachable on demand that
 * are otherwise a queue and a champion select away —
 * `?state=waiting|lobby|select|locked|game`.
 *
 * This never ships behaviour into the real app: inside Electron the preload has
 * already defined window.desktop, so install() returns immediately.
 */
type Listener = (s: unknown) => void


/** One row of a dev scoreboard — the fields MatchDetail actually reads. */
const BP = (
  id: number, team: number, champ: number, name: string, role: string | null,
  k: number, d: number, a: number, cs: number, gold: number,
  dmg: number, taken: number, lvl: number, win: boolean, me = false
) => ({
  participantId: id, teamId: team, championId: champ, riotId: name + "#EUW",
  name, win, kills: k, deaths: d, assists: a, creepScore: cs, goldEarned: gold,
  damage: dmg, damageTaken: taken, visionScore: 20, wardsPlaced: 8,
  champLevel: lvl, items: [3157, 6653, 3020, 4645, 3089, 3135],
  spells: [4, 11] as [number, number], role, isMe: me,
})

/**
 * A full ten-player board on the newest dev match.
 *
 * Without one, ?state=board reaches the match page and shows "the client did
 * not give up the rest of this game's scoreboard" — so the two team headers,
 * the ten rows and the player card were all unreachable in a browser.
 */
const DEV_BOARD = [
  BP(1, 100, 875, "Caoskhimera", "TOP", 1, 4, 3, 214, 12400, 15700, 19100, 16, true),
  BP(2, 100, 876, "yuumi45", "JUNGLE", 13, 3, 13, 187, 14200, 46500, 24100, 18, true, true),
  BP(3, 100, 134, "Pretty Hands", "MIDDLE", 14, 3, 11, 240, 15100, 30700, 17300, 16, true),
  BP(4, 100, 201, "Bark for Braum", "BOTTOM", 8, 7, 10, 198, 11800, 34800, 22600, 14, true),
  BP(5, 100, 555, "OH OUI PING MOI", "UTILITY", 5, 5, 12, 41, 8900, 16500, 21400, 13, true),
  BP(6, 200, 79, "신을 죽이는 자", "TOP", 6, 6, 2, 205, 11200, 26100, 31800, 16, false),
  BP(7, 200, 62, "Kung Fu Panda 3", "JUNGLE", 6, 7, 7, 160, 10400, 23200, 28900, 13, false),
  BP(8, 200, 84, "NEXT SAMD", "MIDDLE", 1, 7, 5, 178, 9800, 15100, 19700, 14, false),
  BP(9, 200, 119, "AUR BIG EDGER007", "BOTTOM", 7, 9, 6, 221, 12100, 29900, 20300, 14, false),
  BP(10, 200, 350, "SilleniKittlen", "UTILITY", 2, 12, 13, 33, 7600, 6300, 24800, 12, false),
]

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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
      // Hovering. The client fills `champion` in while you are still scrolling
      // the grid, which is exactly why this flag has to exist separately.
      lockedIn: false,
      role: null, // a custom, where the client assigns no position
      allies: { locked: 3, total: 5 },
      enemies: { locked: 1, total: 5 },
    },
    notice: null,
    levelHint: null,
    pinned: false,
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    gold: { ours: 15250, theirs: 7700, oursCounted: 5, theirsCounted: 5 },
    levelHint: null,
    pinned: false,
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
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
    builds: [
      { championId: "Lillia", championName: "Lillia", championKey: 876, role: "JUNGLE",
        items: [6653, 4633, 3157, 3089], runes: "8000:8300:...", enabled: true,
        source: "champ-select", savedAt: Date.now() - 3600e3, patch: "16.16" },
      { championId: "Nami", championName: "Nami", championKey: 267, role: "UTILITY",
        items: [3853, 6617, 3504], runes: null, enabled: false,
        source: "champ-select", savedAt: Date.now() - 86400e3, patch: "16.15" },
      { championId: "LeeSin", championName: "Lee Sin", championKey: 64, role: null,
        items: [], runes: "8000:8300:x", enabled: true,
        source: "site", savedAt: Date.now() - 600e3, patch: "16.16" },
    ],
    matchup: null,
    matchupLoading: false,
    canUpdate: true,
    update: { state: "available", version: "0.0.1", next: "0.0.2", notes: null },
    ranked: { tier: "DIAMOND", division: "III", leaguePoints: 9, wins: 148, losses: 133, queue: "RANKED_SOLO_5x5" },
    account: { email: "marco@loldata.cc", tier: "premium" },
    matches: [
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 1, playedAt: Date.now() - 900e3, durationSeconds: 1840, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 876, champLevel: 16, kills: 11, deaths: 3, assists: 9, creepScore: 187, goldEarned: 14200, visionScore: 31, items: [3157, 6653, 3020, 4645, 3089, 0], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 2, playedAt: Date.now() - 5400e3, durationSeconds: 1420, queueId: 420, gameMode: "CLASSIC", win: false, remake: false, championId: 267, champLevel: 13, kills: 2, deaths: 7, assists: 18, creepScore: 34, goldEarned: 8900, visionScore: 62, items: [3853, 3158, 6617, 0, 0, 0], spells: [4, 14], role: "SUPPORT", opponent: { championId: 412, role: "SUPPORT" }, honour: null },
      { account: { name: "EGO A CATERVE", tag: "EUW", puuid: "dev-main" }, gameId: 3, playedAt: Date.now() - 9000e3, durationSeconds: 1500, queueId: 420, gameMode: "CLASSIC", win: true, remake: false, championId: 104, champLevel: 3, kills: 0, deaths: 0, assists: 0, creepScore: 12, goldEarned: 900, visionScore: 2, items: [], spells: [4, 11], role: "JUNGLE", opponent: { championId: 121, role: "JUNGLE" }, honour: "mvp" },
      { account: { name: "Kintsugi", tag: "FLA", puuid: "dev-smurf" }, gameId: 4, playedAt: Date.now() - 172800e3, durationSeconds: 2260, queueId: 450, gameMode: "ARAM", win: true, remake: false, championId: 876, champLevel: 18, kills: 19, deaths: 8, assists: 24, creepScore: 96, goldEarned: 18400, visionScore: 8, items: [3152, 3020, 4645, 3089, 3157, 3116], spells: [4, 32], role: null, opponent: null, honour: "ace" },
    ],
    runes: null,
    runeImport: { state: "idle" },
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // in partita, senza alcuna notifica: solo la barra dell'oro
  gold: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: null,
    notice: null,
    gold: { ours: 21400, theirs: 23900, oursCounted: 5, theirsCounted: 5 },
    levelHint: null,
    pinned: false,
    canUpdate: false,
    update: { state: "idle", version: "0.0.2" },
    runes: null,
    runeImport: { state: "idle" },
    account: null,
    ranked: null,
    matches: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // la notifica dell'oggetto acquistabile
  item: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress",
    patch: "16.16.1",
    select: null,
    notice: {
      kind: "item", inSeconds: 0, raisedAt: Date.now(), element: null,
      tally: { ours: [], theirs: [] },
      item: { id: 6653, name: "Liandry's Torment", cost: 2600, index: 1, total: 3 },
    },
    gold: null,
    levelHint: null,
    pinned: false,
    canUpdate: false,
    update: { state: "idle", version: "0.0.2" },
    runes: null,
    runeImport: { state: "idle" },
    account: null,
    ranked: null,
    matches: null,
    matchup: null,
    matchupLoading: false,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  boots: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress", patch: "16.16.1", select: null, gold: null, levelHint: null,
    pinned: false, canUpdate: false, update: { state: "idle", version: "0.0.2" },
    runes: null, runeImport: { state: "idle" }, account: null, ranked: null, matches: null,
    matchup: null, matchupLoading: false, builds: [],
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
    notice: {
      kind: "boots", inSeconds: 0, raisedAt: Date.now(), element: null,
      tally: { ours: [], theirs: [] },
      boots: { item: 3111, name: "Mercury's Treads", reason: "4 enemies bring hard CC", keys: [89, 412, 32, 254] },
    },
  },
  opening: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104, puuid: "p", iconId: 3150 },
    phase: "InProgress", patch: "16.16.1", select: null, gold: null, levelHint: null,
    pinned: false, canUpdate: false, update: { state: "idle", version: "0.0.2" },
    runes: null, runeImport: { state: "idle" }, account: null, ranked: null, matches: null,
    matchup: null, matchupLoading: false, builds: [],
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
    notice: {
      kind: "build", inSeconds: 0, raisedAt: Date.now(), element: null,
      tally: { ours: [], theirs: [] },
      build: { items: [6653, 4633, 3157, 3089], shapeLabel: "3+ ad, 3+ melee, 2+ tank", cohortGames: 1224 },
    },
  },
}

/**
 * `?state=locked` — the same room one beat later.
 *
 * Derived from `select` rather than written out again, so the two scenes differ
 * by exactly what the LOCK changes and nothing else. That is the whole point of
 * having it: put them side by side and any difference you see is the feature.
 *
 * ⚠️ `select` carries `runes: null`, so the panel never rendered in dev at all
 * and the interaction was unreachable without a live champion select. The
 * variants below are shaped like the real payload — five pages, descending
 * share, real perk ids so the icons actually resolve against the CDN.
 */
const DEV_RUNES = {
  chosen: 0,
  remembered: false,
  pageName: "loldata · Nami",
  anyRole: false,
  variants: [
      { label: "popular", games: 48213, winrate: 51.8, share: 62,
        page: { keystone: 8214, primaryStyle: 8200, primary: [8214, 8226, 8210, 8237],
                subStyle: 8300, secondary: [8345, 8352], shards: [5008, 5008, 5001] } },
      { label: "aery", games: 14907, winrate: 52.4, share: 19,
        page: { keystone: 8214, primaryStyle: 8200, primary: [8214, 8226, 8210, 8237],
                subStyle: 8100, secondary: [8143, 8135], shards: [5008, 5008, 5001] } },
      { label: "comet", games: 8801, winrate: 50.1, share: 11,
        page: { keystone: 8229, primaryStyle: 8200, primary: [8229, 8226, 8210, 8237],
                subStyle: 8300, secondary: [8345, 8352], shards: [5008, 5008, 5001] } },
      { label: "glacial", games: 3120, winrate: 49.2, share: 4,
        page: { keystone: 8351, primaryStyle: 8300, primary: [8351, 8306, 8345, 8352],
                subStyle: 8200, secondary: [8226, 8210], shards: [5008, 5008, 5001] } },
    { label: "guardian", games: 2440, winrate: 53.9, share: 3,
      page: { keystone: 8465, primaryStyle: 8400, primary: [8465, 8463, 8473, 8242],
              subStyle: 8300, secondary: [8345, 8352], shards: [5008, 5008, 5001] } },
  ],
}

// Both scenes get the same pages, so the ONLY difference between them is the
// lock. Anything else you notice on screen is the feature doing its job.
;(SCENES.select as Record<string, unknown>).runes = DEV_RUNES


SCENES.locked = {
  ...(SCENES.select as object),
  select: {
    champion: { slug: "Nami", key: 267, name: "Nami" },
    lockedIn: true,
    role: "UTILITY",
    allies: { locked: 5, total: 5 },
    enemies: { locked: 3, total: 5 },
  },
  runes: DEV_RUNES,
}

/**
 * What every scene has unless it says otherwise.
 *
 * ⚠️ Here rather than copied into each scene. A field added to the app and
 * forgotten in one of the scenes below is not a missing value — it is a screen
 * that throws the moment somebody opens it in a browser, which is exactly the
 * place this file exists to make safe. The Capture tab did that: it reads a
 * list of recordings that no scene had.
 */
const BASE = {
  clip: { state: "idle" },
  storage: { recordings: 11_600_000_000, kept: 1_900_000_000, clips: 42_000_000, clipCount: 6 },
  recording: false,
  captureError: null,
  libraryBytes: 1_780_000_000,
  recordings: [
    {
      id: "dev-1",
      file: "dev-1.mp4",
      startedAt: Date.now() - 920e3,
      durationMs: 1_840_000,
      bytes: 980_000_000,
      championId: "Lillia",
      championName: "Lillia",
      queue: "Ranked Solo",
      win: true,
      kept: false,
      width: 1920,
      height: 1080,
      fps: 30,
      // ⚠️ These used to read "Lillia → Zed", which is not a shape the app has
      // ever produced: a real mark carries the OTHER player's name on its own,
      // and now the champion they were playing beside it. A fixture that is
      // richer than production hides exactly the poverty it should expose.
      highlights: [
        { at: 214_000, kind: "kill", label: "Kirei", champion: "Zed" },
        { at: 402_000, kind: "death", label: "Sn0wfl4ke", champion: "Khazix" },
        { at: 617_000, kind: "kill", label: "aqualung", champion: "Nami" },
        // A teamfight: three kills and a death inside ten seconds. Drawn as one
        // pin each way rather than four marks smeared over four pixels.
        { at: 1_103_000, kind: "kill", label: "Frostbite", champion: "Ashe" },
        { at: 1_105_000, kind: "kill", label: "hooklord", champion: "Thresh" },
        { at: 1_108_000, kind: "kill", label: "Kirei", champion: "Zed" },
        { at: 1_110_000, kind: "death", label: "steelcut", champion: "Camille" },
        { at: 1_402_000, kind: "assist", label: "Kirei", champion: "Zed" },
        // ⚠️ No champion on purpose: a turret execute, an older recording, a
        // player Riot withheld. The mark must still draw, and read.
        { at: 1_690_000, kind: "kill", label: "Sn0wfl4ke" },
      ],
    },
    /**
     * Short on purpose.
     *
     * The first entry is what the library LOOKS like — a real game's length and
     * a real spread of moments. This one is sized to the placeholder video, so
     * that clicking a moment actually LANDS on it: against a thirty-minute
     * timeline every seek clamps to the end of a ten-second file, and a jump
     * that works cannot be told apart from one that does not.
     */
    {
      id: "dev-2",
      file: "dev-2.mp4",
      startedAt: Date.now() - 5_500e3,
      durationMs: 9_700,
      bytes: 4_287_926,
      championId: "Nami",
      championName: "Nami",
      queue: "Ranked Solo",
      win: false,
      kept: true,
      width: 1920,
      height: 1080,
      fps: 30,
      highlights: [
        { at: 2_000, kind: "kill", label: "Kirei", champion: "Zed" },
        // ⚠️ "Lee Sin", not "LeeSin": the mark stores the SLUG and the name is
        // resolved for display. This is the case that catches a reader printing
        // the slug and calling it a name.
        { at: 4_000, kind: "death", label: "sensei", champion: "LeeSin" },
        { at: 6_000, kind: "assist", label: "Frostbite", champion: "Ashe" },
        { at: 8_000, kind: "multi", label: "hooklord", champion: "Thresh" },
      ],
    },
  ],
  loading: null,
  loadingNudge: { x: 0, y: 0, scale: 0 },
  loadingCalibrating: false,
  lastPlayed: null,
  region: "euw1",
  finalBoard: null,
  scoreboard: null,
  gold: null,
  settings: {
    launchAtLogin: false,
    smartBuild: true,
    goldReadout: true,
    loadingBoard: true,
    capture: true,
    captureAudio: "system",
    captureBudgetGb: 25,
    captureFps: 30,
    objectiveNotices: true,
    buildNotices: true,
  },
}

/**
 * The live board, which is otherwise only reachable by being in a game.
 *
 * It is the Overview's OTHER shape — ten rows of numbers rather than a totem
 * over a watermark — and it lays out differently for that reason, so it has to
 * be openable at a desk.
 */
const BOARD_PLAYER = (
  name: string,
  champion: string,
  championId: string,
  position: string,
  k: number,
  d: number,
  a: number,
  cs: number,
  isMe = false
) => ({
  name,
  riotId: `${name}#EUW`,
  champion,
  championId,
  level: 14,
  position,
  dead: false,
  respawnIn: 0,
  kills: k,
  deaths: d,
  assists: a,
  cs,
  csPerMin: +(cs / 22).toFixed(1),
  wards: 6,
  worth: 1200 + k * 300,
  items: [3157, 6653, 3020, 0, 0, 0],
  keystone: 8214,
  isMe,
})

SCENES.board = {
  ...(SCENES.game as object),
  scoreboard: {
    gameTime: 1320,
    ours: [
      BOARD_PLAYER("MOSCARDINO 5kg", "Darius", "Darius", "TOP", 3, 5, 12, 198),
      BOARD_PLAYER("EGO A CATERVE", "Lillia", "Lillia", "JUNGLE", 5, 3, 14, 216, true),
      BOARD_PLAYER("Alessàndro", "Galio", "Galio", "MIDDLE", 2, 4, 14, 180),
      BOARD_PLAYER("Stefano", "Kai'Sa", "Kaisa", "BOTTOM", 22, 4, 7, 240),
      BOARD_PLAYER("lottie", "Nami", "Nami", "UTILITY", 0, 6, 28, 30),
    ],
    theirs: [
      BOARD_PLAYER("LETHALITY JETZO", "Aatrox", "Aatrox", "TOP", 8, 5, 4, 190),
      BOARD_PLAYER("Caosse2001", "Kha'Zix", "Khazix", "JUNGLE", 9, 8, 6, 150),
      BOARD_PLAYER("BenjaminMayo", "Diana", "Diana", "MIDDLE", 3, 5, 7, 172),
      BOARD_PLAYER("Mr Spring Onion", "Camille", "Camille", "BOTTOM", 2, 8, 8, 205),
      BOARD_PLAYER("Cedarwood Junk", "Sion", "Sion", "UTILITY", 0, 6, 14, 40),
    ],
  },
}

/**
 * `?state=recording` — the same in-game board while a recording IS running.
 *
 * Derived from `board`, so the two scenes differ by exactly one boolean. Both
 * have to be reachable without queueing: the capture row is the part of this
 * screen read at a glance, and "does the dot actually change" is not a question
 * worth a live game to answer.
 */
// Il primo match della scena board porta un tabellone completo, cosi la pagina
// di dettaglio e' raggiungibile senza una partita vera.
const boardMatches = (SCENES.board as Record<string, unknown>).matches as Record<string, unknown>[]
if (boardMatches?.[0]) boardMatches[0].board = DEV_BOARD

SCENES.recording = { ...(SCENES.board as object), recording: true }

// I due stati dell'aggiornamento che non si possono raggiungere aspettando:
// il pulsante in alto cambia forma tra loro (controllo -> stato -> controllo),
// e senza queste scene l'unico modo di vederli e' pubblicare una release.
SCENES.updating = {
  ...(SCENES.select as object),
  update: { state: "downloading", version: "0.0.6", next: "0.0.7", percent: 42 },
}
// Il ruolo scelto non ha dati: nessuna pagina, e il pannello lo dichiara
// invece di prestare le rune di un'altra lane.
SCENES.norunes = {
  ...(SCENES.locked as object),
  runes: null,
  runeGap: "top",
}

SCENES.updated = {
  ...(SCENES.select as object),
  update: { state: "ready", version: "0.0.6", next: "0.0.7" },
}

export function installDevShell(): void {
  if ((window as any).desktop) return // running inside Electron — nothing to do

  const params = new URLSearchParams(location.search)
  const scene = params.get("state") ?? "select"
  let state: Record<string, unknown> = { ...BASE, ...((SCENES[scene] ?? SCENES.select) as object) }
  // ?hint=Q lights the ability outline without needing a game or the shell.
  const hint = params.get("hint")
  if (hint) state = { ...state, levelHint: hint }
  const listeners = new Set<Listener>()

  const bridge: Record<string, unknown> = {
    getState: async () => state,
    onState: (fn: Listener) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    minimise: () => console.info("[dev shell] minimise"),
    close: () => console.info("[dev shell] close"),
    /**
     * ⚠️ Not the real scheme — that only answers inside Electron.
     *
     * Put any video at public/dev-clip.mp4 to work on the player in a browser;
     * without one the player shows its "could not be opened" state, which is
     * also a thing worth being able to look at.
     */
    clipUrl: () => "/dev-clip.mp4",
  }

  /**
   * Anything the app asks for that this stand-in has not thought of.
   *
   * ⚠️ A miss must not be a crash. This file exists so the interface can be
   * worked on in a browser, and a method added to the bridge months from now
   * should make a screen inert, not take the window down.
   */
  ;(window as any).desktop = new Proxy(bridge, {
    get: (target, key: string) =>
      key in target
        ? target[key]
        : (...args: unknown[]) => {
            console.info("[dev shell] %s", key, args)
            return Promise.resolve()
          },
  })

  // Handy while designing: flip scenes from the console without a reload.
  ;(window as any).setScene = (name: keyof typeof SCENES) => {
    if (SCENES[name]) state = { ...BASE, ...(SCENES[name] as object) }
    listeners.forEach((fn) => fn(state))
  }
}
