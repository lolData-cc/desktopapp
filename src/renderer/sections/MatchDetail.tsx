import { useEffect, useMemo, useState } from "react"
import { championById } from "../../data/champions"
import Player from "../Player"
import ShareClip from "../ShareClip"
import {
  CDN,
  CDRAGON,
  mmss,
  queueName,
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
      .then((r) => { if (alive) setRanks(r) })
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
      <Head match={match} onBack={onBack} />

      <div className="no-bar mt-4 min-h-0 flex-1 overflow-y-auto">
        {/* ── the recording, first ─────────────────────────────────────── */}
        {clip && (
          <div className="mb-6">
            <div className="mb-2 flex items-baseline gap-3">
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
                the recording
              </p>
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
                {Math.round(clip.bytes / 1048576)} MB
                {clip.fps > 0 ? ` · ${clip.fps}fps` : ""} ·{" "}
                {clip.highlights.filter((h) => h.kind === "kill").length} kills
              </p>
              <button
                type="button"
                onClick={() => setSharing(true)}
                className="ml-auto win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/45"
              >
                share a moment
              </button>
            </div>
            <div className="mx-auto w-full max-w-[880px]">
              <Player rec={clip} patch={patch} inline onClose={() => undefined} />
            </div>
          </div>
        )}

        {/* ── the scoreboard ───────────────────────────────────────────── */}
        {!board ? (
          <p className="font-chakrapetch text-[12.5px] text-flash/30">
            The client did not give up the rest of this game's scoreboard.
          </p>
        ) : (
          <>
            <Side
              label={mine?.win ? "your team · victory" : "your team · defeat"}
              won={!!mine?.win}
              players={ours}
              patch={patch}
              peak={peak}
              ranks={ranks}
              picked={picked}
              onPick={setPicked}
            />
            <Side
              label={mine?.win ? "their team · defeat" : "their team · victory"}
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

        {chosen && <Card p={chosen} patch={patch} match={match} rank={chosen.riotId ? ranks[chosen.riotId] ?? null : null} onClose={() => setPicked(null)} />}
      </div>

      {sharing && clip && <ShareClip rec={clip} s={s} onClose={() => setSharing(false)} />}
    </div>
  )
}

/* ── the header ──────────────────────────────────────────────────────────── */

function Head({ match, onBack }: { match: Match; onBack: () => void }) {
  const mins = Math.max(1, match.durationSeconds / 60)
  const kda = match.deaths === 0 ? match.kills + match.assists : (match.kills + match.assists) / match.deaths

  return (
    <div className="flex shrink-0 items-center gap-5">
      <button
        type="button"
        onClick={onBack}
        className="win-btn h-8 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/45"
      >
        ◂ matches
      </button>

      <h2
        className="font-chakrapetch text-[22px] font-bold leading-none"
        style={{ color: match.remake ? "#d7d8d9" : match.win ? "#00d992" : "#FFB615" }}
      >
        {match.remake ? "Remake" : match.win ? "Victory" : "Defeat"}
      </h2>

      <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
        {queueName(match.queueId, match.gameMode)} · {mmss(match.durationSeconds)} · {timeAgo(match.playedAt)}
      </p>

      <p className="ml-auto font-chakrapetch text-[15px] font-bold tabular-nums">
        {match.kills} <span className="text-flash/25">/</span> {match.deaths}{" "}
        <span className="text-flash/25">/</span> {match.assists}
        <span className="ml-2 font-jetbrains text-[9.5px] font-normal text-flash/35">
          {match.deaths === 0 ? "perfect" : `${kda.toFixed(2)} kda`}
        </span>
        <span className="ml-3 font-jetbrains text-[9.5px] font-normal text-flash/35">
          {(match.creepScore / mins).toFixed(1)} cs/m
        </span>
      </p>
    </div>
  )
}

/* ── one side ────────────────────────────────────────────────────────────── */

type Peak = { damage: number; taken: number; gold: number }

function Side({
  label,
  won,
  players,
  patch,
  peak,
  ranks,
  picked,
  onPick,
}: {
  label: string
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
      <p
        className="mb-2 font-jetbrains text-[9px] uppercase tracking-[0.2em]"
        style={{ color: won ? "rgba(0,217,146,0.6)" : "rgba(255,182,21,0.55)" }}
      >
        {label}
      </p>
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
      </span>

      <div className="flex gap-[3px]">
        {p.spells.filter(Boolean).map((id, i) => (
          <img key={`${id}-${i}`} src={`${CDN}/${patch}/img/spell/${spellFile(id)}.png`} alt="" className="h-[17px] w-[17px] rounded-[2px] opacity-70" />
        ))}
      </div>

      <div className="w-[132px] shrink-0">
        <p className="truncate font-chakrapetch text-[12.5px] font-bold leading-tight" style={{ color: p.isMe ? "#d7d8d9" : "rgba(215,216,217,0.7)" }}>
          {p.name}
        </p>
        <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.12em] text-flash/25">
          {rank ? rank.label.toLowerCase() : "—"}
        </p>
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

      <div className="hidden w-[62px] shrink-0 xl:block">
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

      {p.honour && (
        <span
          className="shrink-0 px-1.5 py-[2px] font-jetbrains text-[8px] font-bold uppercase leading-none"
          style={{ background: p.honour === "mvp" ? "#FFB615" : "rgba(215,216,217,0.8)", color: "#040A0C" }}
        >
          {p.honour}
        </span>
      )}
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
  <div className="hidden w-[92px] shrink-0 lg:block">
    <p className="font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/75">
      {short(value)}
    </p>
    <div className="mt-[3px] h-[3px] w-full" style={{ background: "rgba(215,216,217,0.07)" }}>
      <span className="block h-full" style={{ width: `${(value / peak) * 100}%`, background: colour }} />
    </div>
    <p className="mt-[2px] font-jetbrains text-[8px] uppercase tracking-[0.1em] text-flash/20">{label}</p>
  </div>
)

/* ── one player, opened ──────────────────────────────────────────────────── */

function Card({
  p,
  patch,
  match,
  rank,
  onClose,
}: {
  p: MatchPlayer
  patch: string
  match: Match
  rank: PlayerRank | null
  onClose: () => void
}) {
  const [slug, setSlug] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void championById(p.championId).then((c) => { if (alive) setSlug(c?.slug ?? null) }).catch(() => undefined)
    return () => { alive = false }
  }, [p.championId])

  const mins = Math.max(1, match.durationSeconds / 60)
  const games = rank ? rank.wins + rank.losses : 0

  return (
    /* ⚠️ Centred, not top-aligned. The blocks in here are different heights —
       a 48px portrait, a crest, two three-row tables — so aligning their tops
       left every one of them sitting at a different height down the panel. */
    <div className="ds-enter mb-4 flex flex-wrap items-center gap-x-9 gap-y-4 px-4 py-4" style={{ background: "rgba(0,217,146,0.045)", boxShadow: "inset 2px 0 0 0 rgba(0,217,146,0.5)" }}>
      <div className="flex items-center gap-3">
        {slug && <img src={`${CDN}/${patch}/img/champion/${slug}.png`} alt="" className="h-12 w-12 rounded-[3px] ring-1 ring-jade/20" />}
        <div>
          <p className="font-chakrapetch text-[15px] font-bold leading-tight">{p.name}</p>
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/30">
            {slug ?? "—"}{p.role ? ` · ${p.role.toLowerCase()}` : ""} · level {p.champLevel}
          </p>
        </div>
      </div>

      {/* ⚠️ The rank, with its record beside it. "Emerald II" alone says
          nothing about whether they belong there; 148W 133L does. */}
      <div className="flex items-center gap-2.5">
        {rank?.tier && (
          <img
            src={`${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${rank.tier.toLowerCase()}.svg`}
            alt=""
            className="h-9 w-9"
          />
        )}
        <div>
          {/* ⚠️ Printed as the client writes it. Lowercasing and then applying
              `capitalize` turned "EMERALD III" into "Emerald Iii", because the
              rule capitalises every word and a roman numeral is a word. */}
          <p className="font-jetbrains text-[11px] font-bold uppercase tracking-[0.1em] leading-tight text-flash/85">
            {rank ? rank.label : "unranked"}
          </p>
          {games > 0 && (
            <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
              {rank!.wins}W {rank!.losses}L · {Math.round((rank!.wins / games) * 100)}%
            </p>
          )}
        </div>
      </div>

      <Facts
        rows={[
          ["score", `${p.kills} / ${p.deaths} / ${p.assists}`],
          ["damage dealt", `${short(p.damage)} · ${short(p.damage / mins)} a minute`],
          ["damage taken", short(p.damageTaken)],
        ]}
      />
      <Facts
        rows={[
          ["creep score", `${p.creepScore} · ${(p.creepScore / mins).toFixed(1)} a minute`],
          ["gold", `${short(p.goldEarned)} · ${short(p.goldEarned / mins)} a minute`],
          // ⚠️ The ward count only when there IS one. This payload does not
          // always carry it, and "0 wards placed" beside a vision score of six
          // is the app asserting something it was never told.
          ["vision", p.wardsPlaced > 0 ? `${p.visionScore} · ${p.wardsPlaced} wards` : String(p.visionScore)],
        ]}
      />

      <button
        type="button"
        onClick={onClose}
        className="win-btn ml-auto h-7 shrink-0 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/35"
      >
        close
      </button>
    </div>
  )
}

const Facts = ({ rows }: { rows: [string, string][] }) => (
  <table className="border-separate border-spacing-y-[3px]">
    <tbody>
      {rows.map(([k, v]) => (
        <tr key={k}>
          <td className="pr-5 font-jetbrains text-[9px] uppercase tracking-[0.1em] text-flash/25">{k}</td>
          <td className="font-chakrapetch text-[12.5px] font-bold tabular-nums text-flash/80">{v}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))

const SPELL_FILE: Record<number, string> = {
  1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste",
  7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 13: "SummonerMana",
  14: "SummonerDot", 21: "SummonerBarrier", 32: "SummonerSnowball", 39: "SummonerSnowURFSnowball_Mark",
  54: "Summoner_UltBookPlaceholder", 55: "Summoner_UltBookSmitePlaceholder",
}
const spellFile = (id: number) => SPELL_FILE[id] ?? "SummonerFlash"
