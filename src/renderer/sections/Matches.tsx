import { useEffect, useMemo, useState } from "react"
import { championById } from "../../data/champions"
import Player from "../Player"
import ShareClip from "../ShareClip"
import MatchDetail from "./MatchDetail"
import Honour from "../Honour"
import {
  CDN,
  mmss,
  queueName,
  recordingFor,
  timeAgo,
  type AppState,
  type Match,
  type Recording,
} from "../types"

/**
 * Your games.
 *
 * ⚠️ A row is a CLAIM, not a dump of fields. Every number here answers a
 * question somebody actually asks after a game — was it close, did I farm, did
 * I feed, was I useful — and each one is shown against what it should have
 * been, because 187 CS means nothing until you know it was thirty minutes.
 *
 * The recording lives on the row rather than in a library of its own: a capture
 * is not a separate kind of object, it is this game with a video attached.
 */
/**
 * The only queues this page shows.
 *
 * ⚠️ Solo, Flex and Clash — and everything else is DROPPED rather than
 * greyed. This screen compares games to each other: CS a minute, gold a
 * minute, vision. An ARAM has no lane and a bot game has no opponent, so a row
 * for one is a row of numbers that cannot be read next to the row above it,
 * and it drags every average on the page with it.
 *
 * ARAM Clash (720) is left out with the rest for the same reason — it is Clash
 * in name and ARAM in every number.
 */
const QUEUES = new Set([420, 440, 700])

export default function Matches({ s }: { s: AppState }) {
  const [busy, setBusy] = useState(false)
  const [watching, setWatching] = useState<string | null>(null)
  const [sharing, setSharing] = useState<Recording | null>(null)
  /**
   * Which game is OPEN, by id.
   *
   * ⚠️ A page, not an expanded row. It was an accordion, and a scoreboard is
   * ten people with a dozen numbers each — unfolded inside the list it pushed
   * every other game off the screen and left you scrolling a list to read a
   * table.
   */
  const [open, setOpen] = useState<number | null>(null)
  const [only, setOnly] = useState<"all" | "wins" | "losses" | "clips">("all")

  const matches = useMemo(
    () => (s.matches ?? null) && s.matches!.filter((m) => QUEUES.has(m.queueId)),
    [s.matches]
  )
  useEffect(() => { void window.desktop.listRecordings() }, [])

  const refresh = async () => {
    setBusy(true)
    await window.desktop.refreshProfile().catch(() => undefined)
    setBusy(false)
  }

  const rows = useMemo(() => {
    const all = (matches ?? []).map((m) => ({ m, clip: recordingFor(s.recordings, m) }))
    if (only === "wins") return all.filter((r) => r.m.win && !r.m.remake)
    if (only === "losses") return all.filter((r) => !r.m.win && !r.m.remake)
    if (only === "clips") return all.filter((r) => r.clip)
    return all
  }, [matches, s.recordings, only])

  const detail = open !== null ? (matches ?? []).find((m) => m.gameId === open) : null
  if (detail) return <MatchDetail s={s} match={detail} onBack={() => setOpen(null)} />

  if (!matches) return <Empty>Reading your match history…</Empty>
  if (!matches.length) {
    return <Empty>No ranked or Clash games in your recent history.</Empty>
  }

  const real = matches.filter((m) => !m.remake)
  const wins = real.filter((m) => m.win).length
  const clips = matches.filter((m) => recordingFor(s.recordings, m)).length

  return (
    <div className="flex h-full flex-col">
      <Head
        total={matches.length}
        real={real.length}
        wins={wins}
        clips={clips}
        busy={busy}
        only={only}
        onOnly={setOnly}
        onRefresh={() => void refresh()}
      />

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="mt-6 text-center font-jetbrains text-[10px] uppercase tracking-[0.2em] text-flash/25">
            nothing matches that filter
          </p>
        ) : (
          rows.map(({ m, clip }, i) => (
            <Row
              key={m.gameId}
              m={m}
              clip={clip}
              patch={s.patch}
              index={i}
              account={m.account?.name ?? null}
              onOpen={() => setOpen(m.gameId)}
            />
          ))
        )}
      </div>

      {watching && s.recordings.find((r) => r.id === watching) && (
        <Player
          rec={s.recordings.find((r) => r.id === watching)!}
          patch={s.patch ?? "16.16.1"}
          library
          onClose={() => setWatching(null)}
        />
      )}

      {sharing && <ShareClip rec={sharing} s={s} onClose={() => setSharing(null)} />}
    </div>
  )
}

/* ── the header ──────────────────────────────────────────────────────────── */

function Head({
  total,
  real,
  wins,
  clips,
  busy,
  only,
  onOnly,
  onRefresh,
}: {
  total: number
  real: number
  wins: number
  clips: number
  busy: boolean
  only: "all" | "wins" | "losses" | "clips"
  onOnly: (v: "all" | "wins" | "losses" | "clips") => void
  onRefresh: () => void
}) {
  const wr = real > 0 ? Math.round((wins / real) * 100) : 0

  return (
    <div className="shrink-0">
      <div className="flex items-end gap-5">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Matches</h2>

        {/* ⚠️ The bar carries the record, not a percentage on its own. Fourteen
            wins in twenty is a different fact from 70%, and the shape says the
            sample size without spending a word on it. */}
        {real > 0 && (
          <div className="flex items-end gap-3">
            <div>
              <div className="flex h-[6px] w-[164px] overflow-hidden">
                <span style={{ width: `${wr}%`, background: "#00d992" }} />
                <span style={{ width: `${100 - wr}%`, background: "rgba(255,182,21,0.5)" }} />
              </div>
              <p className="mt-1.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30">
                <span className="text-jade">{wins}W</span> <span className="text-citrine/70">{real - wins}L</span>
                <span className="ml-2 text-flash/45">{wr}% wr</span>
              </p>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/**
            * ⚠️ One frame around the four, not four loose words.
            *
            * These were transparent until selected, so three of them were
            * captions and the fourth looked like a highlight. Enclosed, the
            * group reads as a switch with one position chosen — which is what
            * it is — and every position is visibly reachable.
            */}
          <div
            className="flex items-center overflow-hidden rounded-[3px]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(215,216,217,0.13)" }}
          >
            {(["all", "wins", "losses", "clips"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onOnly(k)}
                disabled={k === "clips" && clips === 0}
                className="h-7 px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] transition-colors disabled:opacity-25"
                style={{
                  cursor: k === "clips" && clips === 0 ? "default" : "pointer",
                  color: only === k ? "#040A0C" : "rgba(215,216,217,0.5)",
                  background: only === k ? "#00d992" : "rgba(215,216,217,0.03)",
                  fontWeight: only === k ? 700 : 400,
                }}
              >
                {k === "clips" ? `recorded${clips ? ` · ${clips}` : ""}` : k}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/45"
          >
            {busy ? "reading" : "refresh"}
          </button>
        </div>
      </div>

      <p className="mt-1 font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/20">
        last {total} ranked and clash games · other queues are not shown
      </p>
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="grid h-full place-items-center">
    <p className="font-jetbrains text-[10px] uppercase tracking-[0.2em] text-flash/25">{children}</p>
  </div>
)

/* ── a game ──────────────────────────────────────────────────────────────── */

function Row({
  m,
  clip,
  patch,
  index,
  account,
  onOpen,
}: {
  m: Match
  clip: Recording | null
  patch: string | null
  index: number
  /** The account that played it, or null when naming it would say nothing. */
  account: string | null
  onOpen: () => void
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const v = patch ?? "16.16.1"

  useEffect(() => {
    let alive = true
    void championById(m.championId)
      .then((c) => { if (alive) setSlug(c?.slug ?? null) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [m.championId])

  const mins = Math.max(1, m.durationSeconds / 60)
  const kda = m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths
  const csm = m.creepScore / mins
  const gpm = m.goldEarned / mins
  const edge = m.remake ? "rgba(215,216,217,0.25)" : m.win ? "#00d992" : "#FFB615"

  return (
    <div
      className="ds-row"
      style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-colors"
        style={{
          background: m.remake
            ? "rgba(215,216,217,0.02)"
            : m.win
              ? "rgba(0,217,146,0.05)"
              : "rgba(255,182,21,0.04)",
          boxShadow: `inset 3px 0 0 0 ${edge}`,
          cursor: "pointer",
        }}
      >
        <span className="relative block h-11 w-11 shrink-0">
          {slug ? (
            <img src={`${CDN}/${v}/img/champion/${slug}.png`} alt="" className="h-11 w-11 rounded-[3px] ring-1 ring-jade/15" />
          ) : (
            <span className="block h-11 w-11 rounded-[3px] bg-flash/[0.04]" />
          )}

          {/* ⚠️ On the portrait, not in a column. The level belongs to the
              champion, and the game itself puts it in exactly this corner —
              borrowing that placement costs a reader nothing to learn. */}
          <span
            className="absolute -bottom-[3px] -right-[3px] grid h-[17px] min-w-[17px] place-items-center rounded-full px-[3px] font-jetbrains text-[9px] font-bold tabular-nums leading-none"
            style={{ background: "#040A0C", color: "rgba(215,216,217,0.75)", boxShadow: "0 0 0 1px rgba(215,216,217,0.18)" }}
          >
            {m.champLevel}
          </span>

          {m.honour && <Honour kind={m.honour} />}
        </span>

        <div className="w-[112px] shrink-0">
          <p className="truncate font-chakrapetch text-[13px] font-bold leading-tight text-flash/85">
            {queueName(m.queueId, m.gameMode)}
          </p>
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
            {m.remake ? "remake" : timeAgo(m.playedAt)} · {mmss(m.durationSeconds)}
          </p>
          {account && (
            /* In jade, because it answers a different question from the two
               lines above it: not what this game was, but who played it. */
            <p className="truncate font-jetbrains text-[9px] uppercase tracking-[0.14em] text-jade/45">
              {account}
            </p>
          )}
        </div>

        {/**
          * ⚠️ 66px because the score MEASURES 61–64px, not because 104 looked
          * about right. The column was forty pixels wider than its own ink, and
          * all forty of them sat between the score and the rhombus — 60px on
          * that side against 18 on the other.
          *
          * Right-aligning would make the two exactly equal and was tried; it
          * also tore the score away from the queue beside it, which was worse
          * than the thing it fixed. With the text left-aligned, exact equality
          * is not available at any width — the ink ends wherever the numbers
          * end — so this is sized to the widest ordinary score and the gap
          * closes on the rare one that runs long.
          */}
        <div className="w-[66px] shrink-0 whitespace-nowrap">
          <p className="font-chakrapetch text-[15px] font-bold tabular-nums leading-tight">
            {m.kills} <span className="text-flash/25">/</span>{" "}
            <span className={m.deaths === 0 ? "text-jade" : "text-flash"}>{m.deaths}</span>{" "}
            <span className="text-flash/25">/</span> {m.assists}
          </p>
          <p className="font-jetbrains text-[9px] tabular-nums" style={{ color: kdaColour(kda) }}>
            {m.deaths === 0 ? "perfect" : `${kda.toFixed(2)} kda`}
          </p>
        </div>

        <Versus opponent={m.opponent} patch={v} />

        {/* ⚠️ Per minute, with the raw number underneath. A CS total is a
            statement about the length of the game as much as about the player;
            the rate is the part that compares. */}
        <Metric value={csm.toFixed(1)} unit="cs/m" sub={`${m.creepScore} total`} good={csm >= 6} />
        <Metric value={short(gpm)} unit="gold/m" sub={short(m.goldEarned)} good={gpm >= 400} />
        <Metric value={String(m.visionScore)} unit="vision" sub={`${(m.visionScore / mins).toFixed(1)}/m`} good={m.visionScore / mins >= 1} />

        <div className="ml-auto flex shrink-0 items-center gap-[3px]">
          {Array.from({ length: 6 }, (_, i) => {
            const id = m.items[i]
            return id ? (
              <img key={i} src={`${CDN}/${v}/img/item/${id}.png`} alt="" className="h-[24px] w-[24px] rounded-[2px]" />
            ) : (
              <span key={i} className="h-[24px] w-[24px] rounded-[2px] bg-flash/[0.035]" />
            )
          })}
        </div>

        <span className="grid w-[26px] shrink-0 place-items-center">
          {clip ? (
            <span
              aria-hidden
              title="This game was recorded"
              className="block h-[7px] w-[7px] rotate-45"
              style={{ background: "#00d992", boxShadow: "0 0 8px rgba(0,217,146,0.7)" }}
            />
          ) : (
            <span aria-hidden className="block h-[4px] w-[4px] rotate-45" style={{ background: "rgba(215,216,217,0.12)" }} />
          )}
        </span>

        <span aria-hidden className="shrink-0 font-jetbrains text-[9px] text-flash/25">
          ▸
        </span>
      </button>
    </div>
  )
}

/**
 * Who you were up against, in a rhombus.
 *
 * ⚠️ The shape is the label. A second round portrait beside your own would read
 * as a second champion you played; turned forty-five degrees it reads as the
 * other side of something, which is what it is — and it needs no word saying
 * "versus" to do it.
 *
 * ⚠️ The slot is drawn even when the lane is unknown. Riot's own lane
 * assignment is a guess and often has none, and a column that appears and
 * disappears shifts every row beside it as you scroll.
 */
function Versus({ opponent, patch }: { opponent: Match["opponent"]; patch: string }) {
  const [slug, setSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!opponent) return
    let alive = true
    void championById(opponent.championId)
      .then((c) => { if (alive) setSlug(c?.slug ?? null) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [opponent?.championId])

  return (
    <span
      className="relative grid w-[58px] shrink-0 place-items-center"
      title={opponent ? `against ${slug ?? "?"} in ${opponent.role?.toLowerCase() ?? "lane"}` : "no lane opponent for this game"}
    >
      {/**
        * ⚠️ CLIPPED, not rotated.
        *
        * It was a rotated box with a counter-rotated image inside, which is two
        * transforms fighting to end up where one clip-path puts you — and it
        * left no way to say WHERE in the picture the window should sit. A
        * clip-path is the diamond, and the image behind it can then be nudged.
        */}
      {/* ⚠️ A BIGGER window, not a bigger picture. More of the champion becomes
          visible by widening the diamond; zooming the image inside it does the
          opposite — a diamond already discards the four corners of any square,
          and magnifying on top of that throws away the middle too. */}
      <span
        className="relative block h-[46px] w-[46px] overflow-hidden"
        style={{ clipPath: DIAMOND, background: "rgba(4,10,12,0.6)" }}
      >
        {opponent && slug ? (
          /**
           * ⚠️ Barely zoomed at all — 1.04, where it started at 1.35.
           *
           * The zoom exists only to give the vertical nudge somewhere to move
           * without exposing an edge at the vertices. Riot's square portraits
           * put the face above centre, so a window on the middle of one keeps
           * the chin and cuts the forehead; two per cent up is enough to
           * correct that at this size, and any more costs recognisability,
           * which is the entire job of this picture.
           */
          <img
            src={`${CDN}/${patch}/img/champion/${slug}.png`}
            alt=""
            className="absolute left-1/2 top-1/2 h-[48px] w-[48px] max-w-none"
            style={{ transform: "translate(-50%, -48%)" }}
          />
        ) : (
          <span className="grid h-full w-full place-items-center font-jetbrains text-[10px] text-flash/15">—</span>
        )}
      </span>

      {/* The outline on top, so the clip cannot eat its own edge. */}
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden className="pointer-events-none absolute">
        <path
          d="M24 1 L47 24 L24 47 L1 24 Z"
          fill="none"
          stroke={opponent ? "rgba(255,98,134,0.42)" : "rgba(215,216,217,0.10)"}
          strokeWidth="1"
        />
      </svg>
    </span>
  )
}

/** The rhombus, as a clip. Written once: the outline above has to trace the
 *  same shape, and two definitions of it drift apart on the first tweak. */
const DIAMOND = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"


const Metric = ({ value, unit, sub, good }: { value: string; unit: string; sub: string; good: boolean }) => (
  <div className="hidden w-[74px] shrink-0 lg:block">
    <p
      className="font-chakrapetch text-[13px] font-bold tabular-nums leading-tight"
      style={{ color: good ? "rgba(215,216,217,0.9)" : "rgba(215,216,217,0.45)" }}
    >
      {value} <span className="font-jetbrains text-[8.5px] font-normal text-flash/25">{unit}</span>
    </p>
    <p className="font-jetbrains text-[9px] tabular-nums text-flash/20">{sub}</p>
  </div>
)

/* ── odds and ends ───────────────────────────────────────────────────────── */

/** Green when it is good, plain when it is not — and never red. A bad KDA in
 *  your own history is information, not an accusation. */
const kdaColour = (k: number) =>
  k >= 4 ? "#00d992" : k >= 2.5 ? "rgba(215,216,217,0.75)" : "rgba(215,216,217,0.4)"

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))
