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
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
  },
  lobby: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "Lobby",
    patch: "16.16.1",
    select: null,
    notice: null,
    levelHint: null,
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
  },
  select: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
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
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
  },
  game: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: null,
    levelHint: null,
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
  },
  // the state the whole feature exists for
  soon: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "dragon",
      inSeconds: 90,
      raisedAt: Date.now(),
      spells: [
        { name: "Flash", icon: "https://cdn2.loldata.cc/16.16.1/img/spell/SummonerFlash.png" },
        { name: "Ignite", icon: "https://cdn2.loldata.cc/16.16.1/img/spell/SummonerDot.png" },
      ],
    },
    levelHint: null,
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
  },
  elder: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: {
      kind: "elder",
      inSeconds: 90,
      raisedAt: Date.now(),
      spells: [
        { name: "Flash", icon: "https://cdn2.loldata.cc/16.16.1/img/spell/SummonerFlash.png" },
        { name: "Ignite", icon: "https://cdn2.loldata.cc/16.16.1/img/spell/SummonerDot.png" },
      ],
    },
    levelHint: null,
    hud: { qLeft: 0.3871, top: 0.8693, size: 0.0494, pitch: 0.0323 },
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
