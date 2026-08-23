/**
 * The spine, end to end: find the client, authenticate, subscribe, react.
 *
 * Run it with the League client open (`bun run probe`). It prints who is signed
 * in, the current lifecycle phase, and then every phase change and champion
 * select update as it happens. If the client is closed it waits, and picks it up
 * the moment you open it.
 *
 * Nothing here is throwaway: if this works, champion select is mostly a matter
 * of turning `onChampSelect` into a real screen.
 */
import { LcuConnection, type Phase } from "./lcu/connection"
import { championById, currentPatch } from "./data/champions"

const t = () => new Date().toTimeString().slice(0, 8)
const log = (tag: string, msg: string) => console.log(`${t()}  ${tag.padEnd(12)} ${msg}`)

let lastPhase: Phase | null = null

const lcu = new LcuConnection({
  onConnect: async ({ port, source }) => {
    log("CONNECTED", `client on port ${port} (found via ${source})`)

    const me = await lcu.currentSummoner()
    if (me) log("SUMMONER", `${me.name}#${me.tag} — level ${me.level}`)

    const phase = await lcu.phase()
    lastPhase = phase
    log("PHASE", phase ?? "unknown")

    // Read what is already true; do not wait for it to change. Events fire on
    // CHANGES only, so attaching in the middle of a champion select — which is
    // most of the time, since people open the app after the queue has popped —
    // would leave it blind until somebody locked in.
    if (phase === "ChampSelect") {
      const session = await lcu.champSelect()
      if (session) await onChampSelect(session)
      else log("CHAMPSELECT", "in select, but the session is still empty")
    }

    console.log("\n  attached — waiting for changes\n")
  },

  onDisconnect: () => log("CLOSED", "client went away — waiting for it to come back"),
  onError: (m) => log("ERROR", m),

  onEvent: (e) => {
    // The lifecycle. One subscription drives the whole app: which screen to
    // show, when to fetch a build, when to record a result.
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      const phase = e.data as Phase
      if (phase !== lastPhase) {
        log("PHASE", `${lastPhase ?? "—"} → ${phase}`)
        lastPhase = phase
      }
      return
    }

    // Champion select: the moment our data is worth the most.
    if (e.uri === "/lol-champ-select/v1/session") {
      void onChampSelect(e.data)
      return
    }
  },
})

/** Everything we need to ask the box for a build is in this payload. */
async function onChampSelect(data: unknown): Promise<void> {
  const s = data as any
  if (!s?.myTeam) return

  const me = s.myTeam.find((p: any) => p.cellId === s.localPlayerCellId)
  if (!me) return

  const picked = (t: any[]) => t.filter((p) => p.championId > 0).length
  const champ = await championById(me.championId)

  // assignedPosition is empty in customs and blind pick — the client only fills
  // it in queues that assign roles. Not a failure; it means we have to infer the
  // role or ask, rather than assume the field will be there.
  const role = me.assignedPosition || "(none — custom or blind)"

  log(
    "CHAMPSELECT",
    `${champ ? `${champ.name} (${champ.slug})` : "not picked yet"} · role ${role} · ` +
      `allies ${picked(s.myTeam)}/${s.myTeam.length} · ` +
      `enemies ${picked(s.theirTeam ?? [])}/${(s.theirTeam ?? []).length}`
  )

  if (champ) {
    // This is the hand-off: from here the champion is one our own endpoints
    // already answer for, so the next step is a fetch, not more client parsing.
    log("→ BOX", `would request /api/champion/build for ${champ.slug} on patch ${await currentPatch()}`)
  }
}

// ── run ────────────────────────────────────────────────────────────────────
console.log("\n  lolData desktop — LCU probe")
console.log("  looking for the League client…\n")

await lcu.start()

process.on("SIGINT", () => {
  lcu.stop()
  console.log("\n  stopped.\n")
  process.exit(0)
})
