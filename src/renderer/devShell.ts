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
    objective: null,
  },
  lobby: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "Lobby",
    patch: "16.16.1",
    select: null,
    objective: null,
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
    objective: null,
  },
  game: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    objective: { kind: "dragon", inSeconds: 214, taken: 1 },
  },
  // the state the whole feature exists for
  soon: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    objective: { kind: "dragon", inSeconds: 118, taken: 1 },
  },
  up: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    objective: { kind: "elder", inSeconds: -4, taken: 4 },
  },
}

export function installDevShell(): void {
  if ((window as any).desktop) return // running inside Electron — nothing to do

  const scene = new URLSearchParams(location.search).get("state") ?? "select"
  let state = SCENES[scene] ?? SCENES.select
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
