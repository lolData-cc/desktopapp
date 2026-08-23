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

const CDN = "https://cdn2.loldata.cc/16.16.1/img/spell/"

const SCENES: Record<string, unknown> = {
  waiting: {
    client: "waiting",
    summoner: null,
    phase: null,
    patch: "16.16.1",
    select: null,
    notice: null,
    levelHint: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  lobby: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "Lobby",
    patch: "16.16.1",
    select: null,
    notice: null,
    levelHint: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
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
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  game: {
    client: "attached",
    summoner: { name: "yuumi45", tag: "EU1", level: 104 },
    phase: "InProgress",
    patch: "16.16.1",
    select: { champion: { slug: "Nami", key: 267, name: "Nami" }, role: "UTILITY" },
    notice: null,
    levelHint: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
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
        // 300s and 180s cut by 18 haste — Cosmic Insight, as the real reader
        // would compute it.
        { name: "Flash", icon: CDN + "SummonerFlash.png", cooldown: 254, charges: 1 },
        { name: "Ignite", icon: CDN + "SummonerDot.png", cooldown: 153, charges: 1 },
      ],
      element: null,
    },
    levelHint: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
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
        // 300s and 180s cut by 18 haste — Cosmic Insight, as the real reader
        // would compute it.
        { name: "Flash", icon: CDN + "SummonerFlash.png", cooldown: 254, charges: 1 },
        { name: "Ignite", icon: CDN + "SummonerDot.png", cooldown: 153, charges: 1 },
      ],
      element: null,
    },
    levelHint: null,
    hud: { scale: 0.85, nudge: { x: 0, y: 0, size: 0 }, source: null },
  },
  // From the third dragon on the element is knowable — this is that case.
  infernal: {
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
        { name: "Flash", icon: CDN + "SummonerFlash.png", cooldown: 300, charges: 1 },
        { name: "Smite", icon: CDN + "SummonerSmite.png", cooldown: 15, charges: 2 },
      ],
      element: "Fire",
    },
    levelHint: null,
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
