import { useEffect, useState } from "react"
import { resolvePage, type Perk, type Style } from "../../data/perks"
import { CDN, type AppState } from "../types"
import { championById } from "../../data/champions"
import Scoreboard from "./Scoreboard"
import DsPanel from "../DsPanel"

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
    <DsPanel className="rise w-full max-w-[460px]" eyebrow="standby">
      <div className="px-8 py-11">
      <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.3em] text-jade/50">
        no client
      </p>
      <h1 className="mt-2.5 font-chakrapetch text-[30px] font-bold leading-none tracking-tight">
        Open League
      </h1>
      <span aria-hidden className="mt-4 block h-px w-full bg-jade/[0.16]" />
      <p className="mt-3 max-w-[38ch] font-chakrapetch text-[13px] leading-relaxed text-flash/40">
        This attaches on its own the moment the client is running. Nothing to press.
      </p>
      </div>
    </DsPanel>
  )
}

export function Attached({ s }: { s: AppState }) {
  const copy = PHASE_COPY[s.phase ?? "None"] ?? { title: s.phase ?? "Unknown", sub: "" }
  const sel = s.select

  // In a game, the board IS the overview: a card saying "In game" next to ten
  // live rows would be describing what the reader is already looking at.
  if (s.scoreboard) return <Scoreboard s={s} />

  return (
    <div className="flex w-full max-w-[560px] flex-col">
    <DsPanel className="w-full" eyebrow="client">
      <div className="px-9 py-10">

      {/* the phase, keyed so every change replays the entrance */}
      <div key={s.phase ?? "none"} className="rise">
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.3em] text-jade/55">
          {copy.sub || " "}
        </p>
        <h1 className="mt-2.5 font-chakrapetch text-[30px] font-bold leading-none tracking-tight">
          {copy.title}
        </h1>
        {/* the rule under the head, as the notification has: it is what turns a
            title and a body into a card that was designed. */}
        <span aria-hidden className="mt-4 block h-px w-full bg-jade/[0.16]" />
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
    </DsPanel>

    {/* Only when there is no champion select to think about: in champ select
        the rune page is the thing that matters, and a season record below it
        would be competing with it for the same glance. */}
    {!sel?.champion && <Standing s={s} />}
    </div>
  )
}

/**
 * Who you are and how it has been going, outside a game.
 *
 * The phase card on its own says almost nothing you could not see by looking at
 * the client. This is the part worth opening the app for while queueing: the
 * rank, the form, and the champions the recent games were actually on.
 */
export function Standing({ s }: { s: AppState }) {
  const r = s.ranked
  const matches = (s.matches ?? []).filter((m) => !m.remake)
  const recent = matches.slice(0, 10)
  const wins = recent.filter((m) => m.win).length

  const kda = recent.length
    ? recent.reduce((n, m) => n + m.kills + m.assists, 0) /
      Math.max(1, recent.reduce((n, m) => n + m.deaths, 0))
    : null

  if (!s.summoner && !r) return null
  const patch = s.patch ?? "16.16.1"

  return (
    <div className="mt-6 w-full max-w-[560px] space-y-5">
      {r && (
        <div className="flex items-center gap-4">
          <RankCrest tier={r.tier} />
          <div className="min-w-0">
            <p className="font-chakrapetch text-[17px] font-bold leading-tight">
              {r.tier ? `${title(r.tier)}${r.division ? ` ${r.division}` : ""}` : "Unranked"}
            </p>
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
              {r.tier ? `${r.leaguePoints} lp · ${r.wins}w ${r.losses}l` : "no ranked games yet"}
            </p>
          </div>

          {r.tier && r.wins + r.losses > 0 && (
            <div className="ml-auto text-right">
              <p className="font-chakrapetch text-[17px] font-bold leading-none tabular-nums text-flash/80">
                {Math.round((r.wins / (r.wins + r.losses)) * 100)}%
              </p>
              <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.16em] text-flash/25">
                season
              </p>
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="flex items-baseline gap-3">
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">recent form</p>
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.16em] text-flash/25">
              {wins}w {recent.length - wins}l
              {kda !== null && ` · ${kda.toFixed(2)} kda`}
            </p>
          </div>

          {/* Newest on the LEFT, which is the order every scoreboard on the
              internet uses; reversing it to read like a timeline would be
              technically nicer and read wrong to everyone. */}
          <div className="mt-2 flex items-center gap-1.5">
            {recent.map((m) => (
              <Pip key={m.gameId} m={m} patch={patch} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One recent game.
 *
 * ⚠️ The portrait URL needs the DDRAGON ID and a match carries the numeric key,
 * which are not the same thing — 64 is "LeeSin". Resolving it is a lookup, so
 * it happens per pip rather than being papered over with an onError.
 */
function Pip({ m, patch }: { m: NonNullable<AppState["matches"]>[number]; patch: string }) {
  const [slug, setSlug] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void championById(m.championId)
      .then((c) => { if (alive) setSlug(c?.slug ?? null) })
      .catch(() => { if (alive) setSlug(null) })
    return () => { alive = false }
  }, [m.championId])

  const edge = m.win ? "rgba(0,217,146,0.55)" : "rgba(255,98,134,0.45)"

  return (
    <div
      title={`${m.win ? "Win" : "Loss"} · ${m.kills}/${m.deaths}/${m.assists} · ${m.creepScore} cs`}
      className="relative"
    >
      <div
        className="h-[34px] w-[34px] overflow-hidden rounded-[3px] bg-flash/[0.04]"
        style={{ boxShadow: `0 0 0 1px ${edge}`, opacity: m.win ? 1 : 0.62 }}
      >
        {slug && (
          <img src={`${CDN}/${patch}/img/champion/${slug}.png`} alt="" className="h-full w-full" />
        )}
      </div>
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-[3px] h-[2px] rounded-full"
        style={{ background: m.win ? "#00d992" : "#ff6286" }}
      />
    </div>
  )
}

const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()

/**
 * A rank crest drawn rather than fetched.
 *
 * The real emblems are Riot art we do not host, and a missing image where a
 * rank should be looks like a fault. This is a chevron stack in the tier's own
 * colour — the shape people already read as rank, in our own line language.
 */
function RankCrest({ tier }: { tier: string | null }) {
  const colour = TIER_COLOUR[(tier ?? "").toUpperCase()] ?? "rgba(215,216,217,0.35)"
  const pips = TIER_PIPS[(tier ?? "").toUpperCase()] ?? 1

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0">
      <path d="M22 3 L38 11 L38 25 Q38 36 22 42 Q6 36 6 25 L6 11 Z"
            fill="none" stroke={colour} strokeWidth="1.3" strokeLinejoin="round" opacity="0.75" />
      {Array.from({ length: pips }, (_, i) => (
        <path
          key={i}
          d={`M 14 ${26 - i * 6} L 22 ${20 - i * 6} L 30 ${26 - i * 6}`}
          fill="none"
          stroke={colour}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={1 - i * 0.22}
        />
      ))}
    </svg>
  )
}

/** Riot's own tier colours, near enough that the crest reads as the right rank
 *  at a glance without pretending to be their artwork. */
const TIER_COLOUR: Record<string, string> = {
  IRON: "#7a7469", BRONZE: "#a4703f", SILVER: "#9fb0bd", GOLD: "#e2b857",
  PLATINUM: "#4ec3b0", EMERALD: "#2fb36a", DIAMOND: "#7db8f0",
  MASTER: "#b76fe0", GRANDMASTER: "#e05c5c", CHALLENGER: "#f0d074",
}

const TIER_PIPS: Record<string, number> = {
  IRON: 1, BRONZE: 1, SILVER: 2, GOLD: 2, PLATINUM: 3, EMERALD: 3,
  DIAMOND: 3, MASTER: 4, GRANDMASTER: 4, CHALLENGER: 5,
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
