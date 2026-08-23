import { useEffect, useState } from "react"
import { resolvePage, type Perk, type Style } from "../../data/perks"
import { CDN, type AppState } from "../types"

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

export function Waiting() {
  return (
    <div className="hud rise relative w-full max-w-[420px] overflow-hidden px-8 py-12 text-center">
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

export function Attached({ s }: { s: AppState }) {
  const copy = PHASE_COPY[s.phase ?? "None"] ?? { title: s.phase ?? "Unknown", sub: "" }
  const sel = s.select

  return (
    <div className="hud relative w-full max-w-[560px] px-9 py-10">

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

      {sel?.champion && <RunePanel s={s} />}
      <RuneImportNotice imp={s.runeImport} />
    </div>
  )
}

/**
 * What came of the last import, wherever it was started from.
 *
 * Separate from the rune panel on purpose: a link from the website can arrive
 * while the app is sitting on any screen at all, and a result that only renders
 * inside champ select would mean the website's button silently did nothing most
 * of the time.
 */

function RuneImportNotice({ imp }: { imp: AppState["runeImport"] }) {
  if (imp.state === "idle" || imp.state === "working") return null

  return (
    <p className="rise mt-5 max-w-[440px] font-jetbrains text-[9.5px] leading-relaxed text-flash/40">
      {imp.state === "done" ? (
        <>
          saved as <span className="text-jade">{imp.name}</span>
          {imp.replaced ? " · replaced the previous loldata page" : ""}
        </>
      ) : imp.state === "build-saved" ? (
        <>
          <span className="text-jade">{imp.champion}</span> build saved · {imp.items} item
          {imp.items === 1 ? "" : "s"} · notices will follow it in game
        </>
      ) : imp.state === "no-room" ? (
        <>
          <span className="text-citrine">no free rune page slot.</span> delete one in the client
          and try again — we will not remove a page you made.
        </>
      ) : (
        <span className="text-citrine">{imp.message}</span>
      )}
    </p>
  )
}

/**
 * The page loldata would run, and one button to put it in the client.
 *
 * The numbers are the site's, from the same endpoint the Build tab reads, so
 * the app is not a second opinion — it is the site with a shorter path to the
 * client.
 *
 * It says POPULAR rather than BEST, because that is what the data is: the page
 * most people play. Those are often the same and sometimes not, and the label
 * should not quietly claim the stronger one.
 */

function RunePanel({ s }: { s: AppState }) {
  const r = s.runes
  const v = r?.variants[r.chosen]
  const [art, setArt] = useState<{ perks: (Perk | null)[]; primary: Style | null; secondary: Style | null } | null>(null)

  useEffect(() => {
    if (!v) return setArt(null)
    let alive = true
    const ids = [...v.page.primary, ...v.page.secondary, ...v.page.shards]
    void resolvePage(ids, v.page.primaryStyle, v.page.subStyle)
      .then((a) => { if (alive) setArt(a) })
      .catch(() => { if (alive) setArt(null) })
    return () => { alive = false }
  }, [v?.page.keystone, v?.label])

  if (!r || !v) return null
  const imp = s.runeImport

  return (
    <div className="rise mt-6 border-t border-jade/[0.12] pt-5">
      {/* The same five the site offers, in the same order and the same words.
          Knowing only the most played page is what let champ select overwrite a
          choice made on the website. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {r.variants.map((variant, i) => (
          <button
            key={variant.label}
            type="button"
            onClick={() => window.desktop.chooseRunes(i)}
            className={`win-btn rounded-[3px] px-2 py-1 text-left ${i === r.chosen ? "bg-jade/[0.13]" : ""}`}
          >
            <span className={`block font-jetbrains text-[8.5px] uppercase tracking-[0.14em] ${i === r.chosen ? "text-jade" : "text-flash/30"}`}>
              {variant.label}
            </span>
            <span className={`block font-chakrapetch text-[11px] font-bold tabular-nums ${i === r.chosen ? "text-flash/85" : "text-flash/40"}`}>
              {variant.winrate.toFixed(1)}%
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 font-jetbrains text-[9px] tabular-nums text-flash/30">
        {r.remembered && r.chosen !== 0 && <span className="text-jade/70">your last choice · </span>}
        {v.share >= 1 ? `${Math.round(v.share)}% of games` : "rarely played"} · {v.games.toLocaleString()} games
      </p>

      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {art?.primary && <img src={art.primary.icon} alt={art.primary.name} title={art.primary.name} className="h-5 w-5 opacity-70" />}
          {art?.perks.slice(0, 4).map((p, i) => (
            <img
              key={p?.id ?? i}
              src={p?.icon}
              alt={p?.name ?? ""}
              title={p?.name ?? ""}
              // the keystone is the decision; the rest are the consequences
              className={i === 0 ? "h-8 w-8" : "h-[22px] w-[22px] opacity-85"}
            />
          ))}
        </div>

        <span aria-hidden className="h-6 w-px bg-jade/12" />

        <div className="flex items-center gap-1.5">
          {art?.secondary && <img src={art.secondary.icon} alt={art.secondary.name} title={art.secondary.name} className="h-5 w-5 opacity-70" />}
          {art?.perks.slice(4, 6).map((p, i) => (
            <img key={p?.id ?? i} src={p?.icon} alt={p?.name ?? ""} title={p?.name ?? ""} className="h-[22px] w-[22px] opacity-85" />
          ))}
          {art?.perks.slice(6, 9).map((p, i) => (
            <img key={p?.id ?? `s${i}`} src={p?.icon} alt={p?.name ?? ""} title={p?.name ?? ""} className="ml-0.5 h-[15px] w-[15px] opacity-70" />
          ))}
        </div>

        <button
          type="button"
          disabled={imp.state === "working"}
          onClick={() => void window.desktop.importRunes()}
          className="act-btn ml-auto h-8 w-[112px] shrink-0 rounded-[3px] font-chakrapetch text-[12px] font-bold uppercase tracking-[0.12em]"
        >
          {imp.state === "working" ? "setting" : imp.state === "done" ? "imported" : "import"}
        </button>
      </div>
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
