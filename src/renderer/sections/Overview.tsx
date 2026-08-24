import { useEffect, useState } from "react"
import { resolvePage, type Perk, type Style } from "../../data/perks"
import { CDN, type AppState } from "../types"
import Scoreboard from "./Scoreboard"
import DsPanel from "../DsPanel"

/** Our own emblems, at the CDN ROOT — the same path the summoner page uses. */
const RANKS = "https://cdn2.loldata.cc/ranks"

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

/** "DIAMOND" -> "Diamond". The API shouts its tiers; a card should not. */
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()

/**
 * A single word, the size of the screen, behind everything.
 *
 * The client's state as a film title: outlined rather than filled, because a
 * solid word that size fights the card in front of it while an outline reads
 * as depth. It is the ONLY thing on this screen that says what the client is
 * doing, which is why it can afford to be enormous — there is nothing for it
 * to compete with.
 *
 * ⚠️ Sized in viewport units with a cap, not in pixels. "STANDING BY" and
 * "CHAMPION SELECT" are twice the length of "IN GAME", so a fixed size either
 * wraps the long ones or leaves the short ones small; the length is folded in.
 */
function Watermark({ text }: { text: string }) {
  const word = text.toUpperCase()
  // Longer words get proportionally smaller, so every state fills the same
  // width rather than the same letter height.
  const size = Math.min(150, Math.max(52, 1150 / Math.max(6, word.length)))

  return (
    <p
      aria-hidden
      key={word}
      className="wm pointer-events-none absolute inset-x-0 top-1/2 select-none text-center font-chakrapetch font-bold leading-none"
      style={{
        fontSize: size,
        letterSpacing: "0.06em",
        transform: "translateY(-56%)",
        color: "transparent",
        WebkitTextStroke: "1px rgba(0,217,146,0.16)",
        textShadow: "0 0 60px rgba(0,217,146,0.05)",
      }}
    >
      {word}
    </p>
  )
}

export function Attached({ s }: { s: AppState }) {
  const copy = PHASE_COPY[s.phase ?? "None"] ?? { title: s.phase ?? "Unknown", sub: "" }
  const sel = s.select

  // In a game, the board IS the overview: a card saying "In game" next to ten
  // live rows would be describing what the reader is already looking at.
  if (s.scoreboard) return <Scoreboard s={s} />

  const patch = s.patch ?? "16.16.1"
  const r = s.ranked

  return (
    <div className="relative grid h-full place-items-center">
      <Watermark text={copy.title} />

      {/* The totem: everything about WHO you are, stacked, floating clear of
          the word behind it. */}
      <div className="totem relative flex w-[300px] flex-col items-center">
        <DsPanel className="w-full" eyebrow={copy.sub || "client"}>
          <div className="flex flex-col items-center px-6 py-7">
            {s.summoner ? (
              <img
                src={`${CDN}/${patch}/img/profileicon/${s.summoner.iconId}.png`}
                alt=""
                className="h-[86px] w-[86px] rounded-[4px] ring-1 ring-jade/25"
                style={{ boxShadow: "0 6px 26px rgba(0,0,0,0.6)" }}
                onError={(e) => {
                  // An icon we cannot fetch leaves the frame, not a broken glyph.
                  ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
                }}
              />
            ) : (
              <div className="h-[86px] w-[86px] rounded-[4px] bg-jade/[0.05] ring-1 ring-jade/15" />
            )}

            <p className="mt-3.5 max-w-full truncate font-chakrapetch text-[21px] font-bold leading-none">
              {s.summoner?.name ?? "—"}
            </p>
            <p className="mt-1.5 font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/30">
              #{s.summoner?.tag ?? "—"} · lvl {s.summoner?.level ?? 0}
            </p>

            {r?.tier && (
              <>
                <span aria-hidden className="my-4 h-px w-full bg-jade/[0.14]" />
                <div className="flex items-center gap-2.5">
                  <img
                    src={`${RANKS}/${r.tier.toLowerCase()}.png`}
                    alt=""
                    className="h-9 w-9"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
                    }}
                  />
                  <div className="text-left">
                    <p className="font-chakrapetch text-[13.5px] font-bold leading-none">
                      {title(r.tier)}
                      {r.division ? ` ${r.division}` : ""}
                    </p>
                    <p className="mt-1 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30">
                      {r.leaguePoints} lp · {r.wins}w {r.losses}l
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </DsPanel>
      </div>

      {/* Champion select still gets its own room, below the totem — in champ
          select the page has a job beyond saying who you are. */}
      {sel?.champion && (
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[560px]">
            <RunePanel s={s} />
            <RuneImportNotice imp={s.runeImport} />
          </div>
        </div>
      )}
      {!sel?.champion && (
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px]">
          <RuneImportNotice imp={s.runeImport} />
        </div>
      )}
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

