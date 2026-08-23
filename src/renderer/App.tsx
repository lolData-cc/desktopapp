import { useEffect, useState } from "react"

/** Mirrors the shell's AppState. Kept structural on purpose — the renderer is
 *  meant to be portable to a different shell without editing this file. */
type Champion = { slug: string; key: number; name: string }
type AppState = {
  client: "waiting" | "attached"
  summoner: { name: string; tag: string; level: number } | null
  phase: string | null
  patch: string | null
  select: {
    champion: Champion | null
    role: string | null
    allies: { locked: number; total: number }
    enemies: { locked: number; total: number }
  } | null
}

declare global {
  interface Window {
    desktop: {
      getState(): Promise<AppState>
      onState(fn: (s: AppState) => void): () => void
      minimise(): void
      close(): void
    }
  }
}

const CDN = "https://cdn2.loldata.cc"

/** What the client's phase means to a person. The raw names are Riot's
 *  vocabulary; nobody outside the codebase should have to read "PreEndOfGame". */
const PHASE_COPY: Record<string, { title: string; sub: string }> = {
  None:            { title: "Standing by",     sub: "no game in progress" },
  Lobby:           { title: "In the lobby",    sub: "waiting for the queue" },
  Matchmaking:     { title: "In queue",        sub: "looking for a match" },
  ReadyCheck:      { title: "Match found",     sub: "accept to continue" },
  ChampSelect:     { title: "Champion select", sub: "picking" },
  GameStart:       { title: "Loading in",      sub: "the game is starting" },
  InProgress:      { title: "In game",         sub: "match under way" },
  Reconnect:       { title: "Reconnecting",    sub: "rejoining the match" },
  WaitingForStats: { title: "Game over",       sub: "waiting on the result" },
  PreEndOfGame:    { title: "Game over",       sub: "wrapping up" },
  EndOfGame:       { title: "Game over",       sub: "reading the result" },
}

export default function App() {
  const [s, setS] = useState<AppState | null>(null)

  useEffect(() => {
    void window.desktop.getState().then(setS)
    return window.desktop.onState(setS)
  }, [])

  return (
    <div className="relative flex h-full flex-col bg-liquirice text-flash">
      <div aria-hidden className="dot-field pointer-events-none absolute inset-0" />
      <TitleBar />
      <main className="relative flex flex-1 items-center justify-center px-8 pb-4">
        {s?.client === "attached" ? <Attached s={s} /> : <Waiting />}
      </main>
      <StatusStrip s={s} />
    </div>
  )
}

/* ── chrome ──────────────────────────────────────────────────────────────── */

function TitleBar() {
  return (
    <header className="drag relative z-10 flex h-9 shrink-0 items-center gap-2.5 border-b border-jade/[0.10] px-3">
      <span className="h-[7px] w-[7px] rotate-45 bg-jade" style={{ boxShadow: "0 0 8px #00d992" }} />
      <span className="font-chakrapetch text-[12px] font-bold tracking-[0.16em] text-flash/80">
        lolData
      </span>
      <span className="font-jetbrains text-[9px] uppercase tracking-[0.24em] text-flash/25">
        desktop
      </span>

      <div className="no-drag ml-auto flex items-center">
        <button
          type="button"
          onClick={() => window.desktop.minimise()}
          aria-label="Minimise"
          className="win-btn grid h-9 w-11 place-items-center text-flash/40"
        >
          <span className="block h-px w-[11px] bg-current" />
        </button>
        <button
          type="button"
          onClick={() => window.desktop.close()}
          aria-label="Close"
          className="win-btn danger grid h-9 w-11 place-items-center text-flash/40"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
          </svg>
        </button>
      </div>
    </header>
  )
}

function StatusStrip({ s }: { s: AppState | null }) {
  const attached = s?.client === "attached"
  return (
    <footer className="relative z-10 flex h-8 shrink-0 items-center gap-3 border-t border-jade/[0.10] px-3.5 font-jetbrains text-[9.5px] uppercase tracking-[0.16em]">
      <span
        className={`h-[6px] w-[6px] rounded-full ${attached ? "bg-jade beat" : "bg-flash/25"}`}
      />
      <span className={attached ? "text-jade/80" : "text-flash/30"}>
        {attached ? "client attached" : "waiting for client"}
      </span>

      {s?.summoner && (
        <span className="text-flash/35">
          {s.summoner.name}
          <span className="text-flash/20">#{s.summoner.tag}</span>
        </span>
      )}

      <span className="ml-auto text-flash/20">{s?.patch ? `patch ${s.patch}` : ""}</span>
    </footer>
  )
}

/* ── states ──────────────────────────────────────────────────────────────── */

function Waiting() {
  return (
    <div className="hud rise relative w-full max-w-[420px] overflow-hidden px-8 py-12 text-center">
      <span className="tick-b" />
      <span className="tick-c" />
      <span aria-hidden className="sweep pointer-events-none absolute inset-x-0 top-0 h-[2px]" />

      <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.3em] text-jade/50">
        no client
      </p>
      <h1 className="mt-3 font-chakrapetch text-[26px] font-bold leading-tight">
        Open League
      </h1>
      <p className="mx-auto mt-2 max-w-[34ch] font-chakrapetch text-[13px] leading-relaxed text-flash/40">
        This attaches on its own the moment the client is running. Nothing to
        press.
      </p>
    </div>
  )
}

function Attached({ s }: { s: AppState }) {
  const copy = PHASE_COPY[s.phase ?? "None"] ?? { title: s.phase ?? "Unknown", sub: "" }
  const sel = s.select

  return (
    <div className="hud relative w-full max-w-[560px] px-9 py-10">
      <span className="tick-b" />
      <span className="tick-c" />

      {/* the phase, keyed so every change replays the entrance */}
      <div key={s.phase ?? "none"} className="rise">
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.3em] text-jade/55">
          {copy.sub || " "}
        </p>
        <h1 className="mt-2.5 font-chakrapetch text-[30px] font-bold leading-none tracking-tight">
          {copy.title}
        </h1>
      </div>

      {sel && (
        <div key={sel.champion?.slug ?? "unpicked"} className="rise mt-7 flex items-center gap-4">
          {sel.champion ? (
            <img
              src={`${CDN}/16.16.1/img/champion/${sel.champion.slug}.png`}
              alt=""
              className="h-14 w-14 rounded-[3px] ring-1 ring-jade/25"
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-[3px] bg-jade/[0.05] ring-1 ring-jade/15">
              <span className="font-jetbrains text-[9px] text-flash/25">—</span>
            </div>
          )}

          <div className="min-w-0">
            <p className="font-chakrapetch text-[19px] font-bold leading-tight">
              {sel.champion?.name ?? "Not picked yet"}
            </p>
            <p className="font-jetbrains text-[10px] uppercase tracking-[0.18em] text-flash/35">
              {sel.role ?? "role not assigned"}
            </p>
          </div>

          <div className="ml-auto flex gap-5 text-right">
            <Count label="allies" v={sel.allies} />
            <Count label="enemies" v={sel.enemies} />
          </div>
        </div>
      )}
    </div>
  )
}

function Count({ label, v }: { label: string; v: { locked: number; total: number } }) {
  return (
    <div>
      <p className="font-chakrapetch text-[17px] font-bold tabular-nums leading-none text-flash/85">
        {v.locked}
        <span className="text-flash/25">/{v.total}</span>
      </p>
      <p className="mt-1 font-jetbrains text-[8.5px] uppercase tracking-[0.18em] text-flash/25">
        {label}
      </p>
    </div>
  )
}
