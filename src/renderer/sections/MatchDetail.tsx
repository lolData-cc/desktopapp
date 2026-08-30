import { useEffect, useMemo, useState } from "react"
import MatchInsights from "./MatchInsights"
import { championById } from "../../data/champions"
import Player from "../Player"
import ShareClip from "../ShareClip"
import Honour from "../Honour"
import {
  CDN,
  CDRAGON,
  mmss,
  queueName,
  rankLabel,
  recordingFor,
  timeAgo,
  type AppState,
  type Match,
  type MatchPlayer,
  type PlayerRank,
} from "../types"

/**
 * One game, in full.
 *
 * ⚠️ A PAGE, not an expanded row. A scoreboard is ten people with a dozen
 * numbers each; opening that inside a list pushes every other game off the
 * screen and leaves you scrolling a list to read a table. Going somewhere and
 * coming back is the honest shape for it.
 *
 * The recording sits at the top because it is the only thing here that is not
 * a number — if this game has one, it is what you came to see.
 */
export default function MatchDetail({
  s,
  match,
  onBack,
}: {
  s: AppState
  match: Match
  onBack: () => void
}) {
  const clip = recordingFor(s.recordings, match)
  const [sharing, setSharing] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [ranks, setRanks] = useState<Record<string, PlayerRank | null>>({})
  const patch = s.patch ?? "16.16.1"

  const board = match.board
  const mine = board?.find((p) => p.isMe) ?? null
  const ours = board?.filter((p) => p.teamId === mine?.teamId) ?? []
  const theirs = board?.filter((p) => p.teamId !== mine?.teamId) ?? []

  /**
   * ⚠️ Ten lookups, once per board, never per render. They are network calls
   * against our own API, and a re-render storm behind them would be a request
   * storm.
   */
  useEffect(() => {
    const ids = (board ?? []).map((p) => p.riotId).filter((x): x is string => !!x)
    if (!ids.length) return
    let alive = true
    void window.desktop
      .ranks(ids, s.region)
      // ⚠️ `?? {}`. Every row reads ranks[riotId], so one empty answer from the
      //    shell turns the whole page into the error boundary — which is what
      //    it did. A missing rank is a normal outcome; a missing OBJECT should
      //    not be able to take the scoreboard down with it.
      .then((r) => { if (alive) setRanks(r ?? {}) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [board, s.region])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onBack])

  /** The biggest number on the board, so every bar means the same thing. */
  const peak = useMemo(() => {
    const b = board ?? []
    return {
      damage: Math.max(1, ...b.map((p) => p.damage)),
      taken: Math.max(1, ...b.map((p) => p.damageTaken)),
      gold: Math.max(1, ...b.map((p) => p.goldEarned)),
    }
  }, [board])

  const chosen = board?.find((p) => p.participantId === picked) ?? null

  return (
    <div className="flex h-full flex-col">
      <Head match={match} clip={clip} onBack={onBack} />

      {/* ⚠️ The two halves live in one element so a WIDE WINDOW can put them
          side by side — see the media query in index.css. Nothing here is tied
          to fullscreen: the player takes the screen on its own, as it always
          did, and this is purely a response to how much room the app has. */}
      <div className="match-stage no-bar mt-4 min-h-0 flex-1 overflow-y-auto">
        <div className="match-stage-row">
        {/* ── the recording, first ─────────────────────────────────────── */}
        {clip && (
          /* ⚠️ THIS is the flex item in the wide layout, not .match-stage-video —
             that one is nested a level down. Sizing the inner element instead
             leaves this wrapper with no height and collapses the player to
             nothing. */
          <div className="match-stage-clip mb-6">
            {/* One group, because these are three things you do to the same
                file. keep and reveal used to sit inside the player's control
                strip, which put them over the video and a screen away from the
                share button they belong beside. */}
            <div className="mb-2 flex items-baseline gap-2">
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
                the recording
              </p>
              <button
                type="button"
                title={
                  clip.kept
                    ? "Let this one age out with the rest"
                    : "Keep this one — the size limit stops counting it, so it is never discarded"
                }
                onClick={() => void window.desktop.keepRecording(clip.id, !clip.kept)}
                className={`ml-auto win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
                  clip.kept ? "text-jade" : "text-flash/45"
                }`}
              >
                {clip.kept ? "kept" : "keep"}
              </button>
              <button
                type="button"
                title="Show the file on disk"
                onClick={() => void window.desktop.revealRecording(clip.id)}
                className="win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/45"
              >
                file
              </button>
              <button
                type="button"
                onClick={() => setSharing(true)}
                className="win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/45"
              >
                share a moment
              </button>
            </div>
            {/* ⚠️ No max-width. It used to be capped at 880px and centred, which
                left the page's own background down both sides of the picture —
                reading exactly like letterboxing without being it. The frame
                already states the video's aspect ratio, so taking the full
                width just makes the picture bigger; nothing stretches. */}
            <div className="match-stage-video w-full">
              <Player rec={clip} patch={patch} inline onClose={() => undefined} />
            </div>
          </div>
        )}

        {/* ── the scoreboard ───────────────────────────────────────────── */}
        <div className="match-stage-board">
        {!board ? (
          <p className="font-chakrapetch text-[12.5px] text-flash/30">
            The client did not give up the rest of this game's scoreboard.
          </p>
        ) : (
          <>
            <Side
              side="your team"
              outcome={mine?.win ? "victory" : "defeat"}
              won={!!mine?.win}
              players={ours}
              patch={patch}
              peak={peak}
              ranks={ranks}
              picked={picked}
              onPick={setPicked}
            />
            <Side
              side="their team"
              outcome={mine?.win ? "defeat" : "victory"}
              won={!mine?.win}
              players={theirs}
              patch={patch}
              peak={peak}
              ranks={ranks}
              picked={picked}
              onPick={setPicked}
            />
          </>
        )}

        </div>

        </div>

        {/* ⚠️ After the ROW but still inside the SCROLLER.
            .match-stage is both at once — it is the element with overflow-y and
            the element the wide-window media query turns into a flex row — and
            that pulled this band two ways. Inside it, the band became a third
            column and squashed the video to a thumbnail. Outside it, the band
            sat still while the stage scrolled underneath, pinned to the bottom
            of the window. The row is its own element now, so the band is simply
            the next thing down the page. */}
        <MatchInsights board={board} chosen={chosen} patch={patch} />
      </div>

      {sharing && clip && <ShareClip rec={clip} s={s} onClose={() => setSharing(false)} />}
    </div>
  )
}

/* ── the header ──────────────────────────────────────────────────────────── */

function Head({
  match,
  clip,
  onBack,
}: {
  match: Match
  /** The recording, when this game has one — its size, rate and kill count
   *  belong on the same line as the queue and the length, because they are the
   *  same kind of fact about the same game. On their own line they read as a
   *  second heading for a second thing. */
  clip: ReturnType<typeof recordingFor>
  onBack: () => void
}) {
  const mins = Math.max(1, match.durationSeconds / 60)
  const kda = match.deaths === 0 ? match.kills + match.assists : (match.kills + match.assists) / match.deaths

  return (
    <div className="flex shrink-0 items-center gap-5">
      {/**
        * ⚠️ The one control that has to be found without looking for it.
        *
        * A bare "◂ matches" is a label; this is the only way out of the page
        * short of Escape, so it gets a real surface, an arrow with room around
        * it, and a hover that moves. Reading as a caption was the whole
        * complaint.
        */}
      {/**
        * ⚠️ The arrow is an SVG, and the label is line-height 1.
        *
        * Measured, because it looked high and loose and guessing at padding
        * would have moved it without fixing it: a 9px uppercase label was
        * sitting in a 14px line box holding 7px of ink — uppercase has no
        * descenders, so half the box below the letters is empty and centring
        * the BOX lifts the letters. And "◂" is a character, whose vertical
        * metrics belong to the font: its ink sat a further 1.5px off the
        * label's. A drawn arrow has the metrics we give it.
        */}
      <button
        type="button"
        onClick={onBack}
        title="Back to your matches — Escape does it too"
        className="group flex h-[30px] shrink-0 items-center gap-2 rounded-[3px] pl-2.5 pr-3.5 transition-colors"
        style={{
          cursor: "pointer",
          background: "rgba(215,216,217,0.055)",
          boxShadow: "inset 0 0 0 1px rgba(215,216,217,0.16)",
        }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          aria-hidden
          className="shrink-0 transition-transform group-hover:-translate-x-[2px]"
        >
          <path d="M6.2 1 L2.4 4.5 L6.2 8" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-flash/55" />
        </svg>
        <span className="font-jetbrains text-[9px] uppercase leading-none tracking-[0.18em] text-flash/60">
          matches
        </span>
      </button>

      <h2
        className="font-chakrapetch text-[22px] font-bold leading-none"
        style={{ color: match.remake ? "#d7d8d9" : match.win ? "#00d992" : "#FFB615" }}
      >
        {match.remake ? "Remake" : match.win ? "Victory" : "Defeat"}
      </h2>

      <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
        {queueName(match.queueId, match.gameMode)} · {mmss(match.durationSeconds)} · {timeAgo(match.playedAt)}
        {clip && (
          <span className="text-flash/20">
            {" · "}
            {Math.round(clip.bytes / 1048576)} MB
            {clip.fps > 0 ? ` · ${clip.fps} fps` : ""}
            {" · "}
            {clip.highlights.filter((h) => h.kind === "kill").length} kills
          </span>
        )}
      </p>

      {/**
       * ⚠️ Three numbers with names under them, not one sentence.
       *
       * This was a single run of text — "13 / 3 / 13 8.67 kda 10.3 cs/m" — in
       * which the three figures ran together and the two derived ones were
       * unlabelled trailing words. Numbers on a scoreboard need to say what
       * they are: each gets its value above its name, the same shape the rest
       * of this page uses for damage and gold, and the deaths take the enemy
       * colour because that is the one figure of the three you did not want.
       */}
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right">
          <p className="font-chakrapetch text-[20px] font-bold leading-none tabular-nums">
            {match.kills}
            <span className="text-flash/20"> / </span>
            <span style={{ color: "#ff6286" }}>{match.deaths}</span>
            <span className="text-flash/20"> / </span>
            {match.assists}
          </p>
          <p className="mt-1.5 font-jetbrains text-[8px] uppercase leading-none tracking-[0.22em] text-flash/25">
            k · d · a
          </p>
        </div>

        <span aria-hidden className="h-7 w-px bg-jade/15" />

        <Figure
          value={match.deaths === 0 ? "perfect" : kda.toFixed(2)}
          label="kda"
          lit={match.deaths === 0}
        />
        <Figure value={(match.creepScore / mins).toFixed(1)} label="cs / min" />
      </div>
    </div>
  )
}

/**
 * One number with its name under it.
 *
 * The whole point is the LABEL. A scoreboard full of bare figures makes the
 * reader carry the meaning; putting the name under each one costs a line of
 * 8px type and removes the guessing. `lit` is for the one case worth colouring
 * — a game with no deaths in it.
 */
function Figure({ value, label, lit }: { value: string; label: string; lit?: boolean }) {
  return (
    <div className="text-right">
      <p
        className={`font-chakrapetch text-[15px] font-bold leading-none tabular-nums ${
          lit ? "text-jade" : "text-flash/70"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 font-jetbrains text-[8px] uppercase leading-none tracking-[0.22em] text-flash/25">
        {label}
      </p>
    </div>
  )
}

/* ── one side ────────────────────────────────────────────────────────────── */

type Peak = { damage: number; taken: number; gold: number }

function Side({
  side,
  outcome,
  won,
  players,
  patch,
  peak,
  ranks,
  picked,
  onPick,
}: {
  /** Whose half this is — the caption. */
  side: string
  /** What happened to them — the headline. */
  outcome: string
  won: boolean
  players: MatchPlayer[]
  patch: string
  peak: Peak
  ranks: Record<string, PlayerRank | null>
  picked: number | null
  onPick: (id: number | null) => void
}) {
  return (
    <div className="mb-5">
      {/**
       * ⚠️ The OUTCOME is the headline, not "your team".
       *
       * This was a single 9px monospace line reading "your team · victory",
       * which gave equal weight to the half you already know and the half you
       * are looking for — and at 9px gave neither enough to be read at a
       * glance. The result now carries the size and the colour; whose side it
       * is stays a caption, because you can already see whose side it is.
       */}
      <div className="mb-2.5 flex items-center gap-2.5">
        {/* The rhombus the rest of the app marks a section with. Rotation on
            the <g>, never on the rect — see DsPanel. */}
        <svg aria-hidden width="9" height="9" viewBox="0 0 9 9" className="shrink-0 overflow-visible">
          <g transform="rotate(45 4.5 4.5)">
            <rect x="1.6" y="1.6" width="5.8" height="5.8" fill={won ? "#00d992" : "#FFB615"} />
          </g>
        </svg>
        <p
          className="font-chakrapetch text-[16px] font-bold uppercase leading-none tracking-[0.05em]"
          style={{ color: won ? "#00d992" : "#FFB615" }}
        >
          {outcome}
        </p>
        <p className="font-jetbrains text-[8.5px] uppercase leading-none tracking-[0.24em] text-flash/30">
          {side}
        </p>
        {/* A rule that leaves the mark and dies into nothing: it closes the
            header without drawing a box around it. */}
        <span
          aria-hidden
          className="ml-1 h-px flex-1"
          style={{
            background: `linear-gradient(90deg, ${
              won ? "rgba(0,217,146,0.35)" : "rgba(255,182,21,0.3)"
            }, rgba(0,0,0,0))`,
          }}
        />
      </div>
      <div className="space-y-1">
        {players.map((p) => (
          <Row
            key={p.participantId}
            p={p}
            patch={patch}
            peak={peak}
            rank={p.riotId ? ranks[p.riotId] ?? null : null}
            picked={picked === p.participantId}
            onPick={() => onPick(picked === p.participantId ? null : p.participantId)}
          />
        ))}
      </div>
    </div>
  )
}

function Row({
  p,
  patch,
  peak,
  rank,
  picked,
  onPick,
}: {
  p: MatchPlayer
  patch: string
  peak: Peak
  rank: PlayerRank | null
  picked: boolean
  onPick: () => void
}) {
  const [slug, setSlug] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void championById(p.championId)
      .then((c) => { if (alive) setSlug(c?.slug ?? null) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [p.championId])

  const kda = p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 py-2 pl-3 pr-3 text-left transition-colors"
      style={{
        background: picked
          ? "rgba(0,217,146,0.09)"
          : p.isMe
            ? "rgba(215,216,217,0.05)"
            : "rgba(215,216,217,0.02)",
        // ⚠️ Your own row is marked, because on a board of ten identical shapes
        // the first thing anybody does is hunt for themselves.
        boxShadow: p.isMe ? "inset 2px 0 0 0 rgba(215,216,217,0.5)" : undefined,
        cursor: "pointer",
      }}
    >
      <span className="relative block h-9 w-9 shrink-0">
        {slug ? (
          <img src={`${CDN}/${patch}/img/champion/${slug}.png`} alt="" className="h-9 w-9 rounded-[3px] ring-1 ring-jade/12" />
        ) : (
          <span className="block h-9 w-9 rounded-[3px] bg-flash/[0.04]" />
        )}
        <span
          className="absolute -bottom-[3px] -right-[3px] grid h-[15px] min-w-[15px] place-items-center rounded-full px-[3px] font-jetbrains text-[8px] font-bold tabular-nums leading-none"
          style={{ background: "#040A0C", color: "rgba(215,216,217,0.7)", boxShadow: "0 0 0 1px rgba(215,216,217,0.16)" }}
        >
          {p.champLevel}
        </span>

        {p.honour && <Honour kind={p.honour} small />}
      </span>

      {/* ⚠️ shrink-0 on BOTH the group and the icons. `w-[17px]` in a flex row
          is only a starting width — the item still shrinks when the row runs
          short, and in the narrow column of the wide layout these collapsed to
          about a pixel each: two vertical hairlines where two spells should be.
          A 17px icon has no useful smaller size, so it is told not to have one. */}
      <div className="flex shrink-0 gap-[3px]">
        {p.spells.filter(Boolean).map((id, i) => (
          <img key={`${id}-${i}`} src={`${CDN}/${patch}/img/spell/${spellFile(id)}.png`} alt="" className="h-[17px] w-[17px] shrink-0 rounded-[2px] opacity-70" />
        ))}
      </div>

      {/* ⚠️ The crest sits to the LEFT of the name, not under it. A rank is
          how you place somebody before you have read their name — a shape and
          a colour do that in the time it takes to scan ten rows, where a word
          has to be read. The same emblem the account menu uses. */}
      <div className="flex w-[164px] shrink-0 items-center gap-2">
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center">
          {rank?.tier ? (
            <img
              src={`${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${rank.tier}.svg`}
              alt=""
              className="h-[26px] w-[26px]"
            />
          ) : (
            // Drawn empty rather than absent: ten rows whose names start at
            // different places because one player is unranked is a list that
            // cannot be scanned down.
            <span className="block h-[7px] w-[7px] rotate-45" style={{ background: "rgba(215,216,217,0.10)" }} />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate font-chakrapetch text-[12.5px] font-bold leading-tight" style={{ color: p.isMe ? "#d7d8d9" : "rgba(215,216,217,0.7)" }}>
            {p.name}
          </p>
          <p className="truncate font-jetbrains text-[8.5px] uppercase tracking-[0.12em] text-flash/30">
            {rank ? rankLabel(rank) : "unranked"}
          </p>
        </div>
      </div>

      <div className="w-[86px] shrink-0 whitespace-nowrap">
        <p className="font-chakrapetch text-[13px] font-bold tabular-nums leading-tight">
          {p.kills} <span className="text-flash/25">/</span> {p.deaths} <span className="text-flash/25">/</span> {p.assists}
        </p>
        <p className="font-jetbrains text-[8.5px] tabular-nums text-flash/25">{kda.toFixed(2)} kda</p>
      </div>

      <Bar label="damage" value={p.damage} peak={peak.damage} colour="#ff6286" />
      <Bar label="taken" value={p.damageTaken} peak={peak.taken} colour="rgba(215,216,217,0.45)" />

      <div className="w-[62px] shrink-0">
        <p className="font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/70">{p.creepScore}</p>
        <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.1em] text-flash/20">cs</p>
      </div>

      <div className="row-roomy hidden w-[62px] shrink-0 xl:block">
        <p className="font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/70">{p.visionScore}</p>
        <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.1em] text-flash/20">vision</p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-[3px]">
        {p.items.slice(0, 7).map((id, i) =>
          id ? (
            <img key={i} src={`${CDN}/${patch}/img/item/${id}.png`} alt="" className="h-[21px] w-[21px] rounded-[2px]" />
          ) : (
            <span key={i} className="h-[21px] w-[21px] rounded-[2px] bg-flash/[0.03]" />
          )
        )}
      </div>

    </button>
  )
}

/**
 * ⚠️ Every bar is a share of the BIGGEST number in this game, so the ten of
 * them can be read against each other. Scaled to a fixed ceiling instead, a
 * fifteen-minute game would draw ten stubs and a forty-minute one ten full
 * bars, and neither would say who did the damage.
 */
const Bar = ({ label, value, peak, colour }: { label: string; value: number; peak: number; colour: string }) => (
  <div className="row-roomy hidden w-[92px] shrink-0 lg:block">
    <p className="font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/75">
      {short(value)}
    </p>
    <div className="mt-[3px] h-[3px] w-full" style={{ background: "rgba(215,216,217,0.07)" }}>
      <span className="block h-full" style={{ width: `${(value / peak) * 100}%`, background: colour }} />
    </div>
    <p className="mt-[2px] font-jetbrains text-[8px] uppercase tracking-[0.1em] text-flash/20">{label}</p>
  </div>
)

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))

const SPELL_FILE: Record<number, string> = {
  1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste",
  7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 13: "SummonerMana",
  14: "SummonerDot", 21: "SummonerBarrier", 32: "SummonerSnowball", 39: "SummonerSnowURFSnowball_Mark",
  54: "Summoner_UltBookPlaceholder", 55: "Summoner_UltBookSmitePlaceholder",
}
const spellFile = (id: number) => SPELL_FILE[id] ?? "SummonerFlash"
