import { useEffect, useState } from "react"
import { CDN, type AppState } from "../types"
import { championById } from "../../data/champions"
import ChampionStage from "../ChampionStage"
import Verdict from "../Verdict"
import type { LivePlayer, PlayerRank } from "../types"

/**
 * The game you just finished.
 *
 * Shown when the client is in a post-game phase, which is the one moment the
 * player is sitting still and actually wants to look at what happened. The
 * champion idles on a pedestal on the left and the numbers sit on the right —
 * the model is the reason to look, the stats are the reason to stay.
 *
 * ⚠️ Driven by the PHASE, not by "the newest match is recent". The client
 * writes a match to history at its own pace, so a timestamp test would either
 * miss the game just played or re-open for one from an hour ago after a
 * restart.
 */
const POST_GAME = new Set(["WaitingForStats", "PreEndOfGame", "EndOfGame"])

export function isPostGame(phase: string | null): boolean {
  return !!phase && POST_GAME.has(phase)
}

export default function Recap({
  s,
  onClose,
  preview,
}: {
  s: AppState
  onClose: () => void
  /**
   * A game to show instead of the one that just ended.
   *
   * The recap is only reachable by finishing a match, which makes it the most
   * expensive screen in the app to iterate on — a change costs twenty minutes
   * of League. This lets it be opened over a real past game instead, so the
   * model, the framing and the layout can all be worked on at a desk.
   */
  preview?: NonNullable<AppState["matches"]>[number] | null
}) {
  /**
   * ⚠️ The champion comes from the LIVE GAME, not from history.
   *
   * The client writes the finished match at its own pace, so at the moment the
   * recap opens `matches[0]` is still the previous game — which is how this
   * showed Yasuo to someone who had just played Kai'Sa. The board we were
   * watching a second ago knows the right answer with no waiting.
   */
  const played = preview ? null : s.lastPlayed
  const newest = preview ?? s.matches?.[0] ?? null

  // The numbers are only shown once history has caught up to the game we
  // actually played. Anything else is last game's score under this game's
  // champion, which is worse than an empty column.
  const match = preview
    ? preview
    : played && newest?.championId === played.championKey
      ? newest
      : null

  const [fallbackSlug, setFallbackSlug] = useState<string | null>(null)
  useEffect(() => {
    if (played || !newest) return   // played already carries the slug
    let alive = true
    void championById(newest.championId)
      .then((c) => { if (alive) setFallbackSlug(c?.slug ?? null) })
      .catch(() => { if (alive) setFallbackSlug(null) })
    return () => { alive = false }
  }, [played, newest?.championId])

  /**
   * The verdict plays once per opening — on MOUNT, not on every change.
   *
   * Stepping through games in preview keeps this component mounted, so the
   * animation does not replay; sitting through 2.6 seconds per step would make
   * the debug button slower than finishing a real game.
   */
  const [verdictDone, setVerdictDone] = useState(false)

  /**
   * ⚠️ Held until the window is actually LOOKED AT.
   *
   * A game ends while the player is still on League's end screen, so a verdict
   * that starts on the phase change plays to an empty desktop and is over
   * before they alt-tab in. It waits for focus, which is the moment they are
   * here.
   */
  const [focused, setFocused] = useState(() => document.hasFocus())
  useEffect(() => {
    if (focused) return
    const on = () => setFocused(true)
    window.addEventListener("focus", on)
    return () => window.removeEventListener("focus", on)
  }, [focused])

  const showVerdict = !verdictDone && focused

  const slug = played?.championId ?? fallbackSlug
  const key = played?.championKey ?? newest?.championId ?? 0

  // ⚠️ EVERY hook is above this line, and must stay there.
  //
  // This returned early while three hooks were still declared below it. On the
  // first render slug is null — the champion name resolves asynchronously — so
  // React saw two hooks; on the next it saw five, threw, and unmounted the
  // whole tree. The app went black.
  if (!slug) {
    return (
      <div className="grid h-full place-items-center">
        <p className="font-chakrapetch text-[13px] text-flash/35">Waiting on the result…</p>
      </div>
    )
  }

  const mins = match ? Math.max(1, match.durationSeconds / 60) : 1
  const kda = match ? (match.kills + match.assists) / Math.max(1, match.deaths) : 0
  const won = !!match?.win && !match?.remake

  return (
    <div className="relative flex h-full flex-col">
      {showVerdict && (
        <Verdict won={won} remake={!!match?.remake} onDone={() => setVerdictDone(true)} />
      )}

      <div className="flex shrink-0 items-baseline gap-3">
        <h2
          className="font-chakrapetch text-[22px] font-bold leading-none"
          style={{
            color: !match ? "#d7d8d9" : match.remake ? "#d7d8d9" : won ? "#00d992" : "#ff6286",
          }}
        >
          {!match ? "Game over" : match.remake ? "Remake" : won ? "Victory" : "Defeat"}
        </h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {match
            ? `${Math.floor(mins)} min · ${queueName(match.queueId, match.gameMode)}`
            : "waiting on the client for the result"}
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-7">
        {/* the champion */}
        <div className="relative w-[430px] shrink-0">
          <ChampionStage championId={slug} championKey={key} className="h-full w-full" />
          <p className="absolute inset-x-0 bottom-0 text-center font-chakrapetch text-[15px] font-bold uppercase tracking-[0.16em] text-flash/70">
            {slug}
            {match && (
              <span className="ml-2 font-jetbrains text-[10px] tracking-[0.18em] text-flash/25">
                lvl {match.champLevel}
              </span>
            )}
          </p>
        </div>

        {/* the numbers */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          {!match ? (
            <p className="max-w-[40ch] font-chakrapetch text-[12.5px] leading-snug text-flash/30">
              The client has not written this game to your history yet. The score will
              fill in on its own — it usually takes a few seconds after the end screen.
            </p>
          ) : (
          <>
          <div className="flex items-baseline gap-2">
            <span className="font-chakrapetch text-[34px] font-bold leading-none tabular-nums text-flash">
              {match.kills}
            </span>
            <span className="font-chakrapetch text-[24px] font-bold leading-none text-flash/20">/</span>
            <span className="font-chakrapetch text-[34px] font-bold leading-none tabular-nums text-flash/55">
              {match.deaths}
            </span>
            <span className="font-chakrapetch text-[24px] font-bold leading-none text-flash/20">/</span>
            <span className="font-chakrapetch text-[34px] font-bold leading-none tabular-nums text-flash">
              {match.assists}
            </span>
            <span
              className="ml-3 font-chakrapetch text-[15px] font-bold tabular-nums"
              style={{ color: kda >= 3 ? "#00d992" : kda >= 2 ? "#d7d8d9" : "#ff6286" }}
            >
              {match.deaths === 0 ? "perfect" : `${kda.toFixed(2)} kda`}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
            <Stat k="cs" v={String(match.creepScore)} sub={`${(match.creepScore / mins).toFixed(1)} / min`} />
            <Stat k="gold" v={short(match.goldEarned)} sub={`${short(match.goldEarned / mins)} / min`} />
          </div>

          {match.items?.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
                what you finished on
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.items.filter(Boolean).map((id, i) => (
                  <img
                    key={`${id}-${i}`}
                    src={`${CDN}/${s.patch ?? "16.16.1"}/img/item/${id}.png`}
                    alt=""
                    className="h-9 w-9 rounded-[2px] ring-1 ring-jade/12"
                  />
                ))}
              </div>
            </div>
          )}

          </>
          )}

          <p className="mt-6 max-w-[52ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            Model by Khada (modelviewer.lol), cached on your machine after the first
            game on this champion.
          </p>
        </div>
      </div>

      <Lobby s={s} onClose={onClose} />
    </div>
  )
}

/**
 * The ten players, and the way out.
 *
 * ⚠️ Read from the board CAPTURED WHEN THE GAME ENDED, not from a live one —
 * that endpoint stops answering the moment the game does — and not from match
 * history, which the client has usually not written yet.
 *
 * Ranks arrive separately and late, because they are ten network lookups. The
 * cards render immediately without them and fill in; blocking the whole recap
 * on a rank service would be letting the least important column set the pace.
 */
function Lobby({ s, onClose }: { s: AppState; onClose: () => void }) {
  const board = s.finalBoard
  const [ranks, setRanks] = useState<Record<string, PlayerRank | null>>({})

  const rows = board ? [...board.ours, ...board.theirs] : []

  useEffect(() => {
    if (!rows.length) return
    const ids = rows.map((p) => p.riotId).filter((x): x is string => !!x)
    if (!ids.length) return
    let alive = true
    void window.desktop
      .ranks(ids, s.region)
      .then((r) => { if (alive) setRanks(r) })
      .catch(() => undefined)
    return () => { alive = false }
    // Once per board, never per render: ten lookups behind a re-render would be
    // a request storm.
  }, [board, s.region])

  return (
    <div className="mt-5 shrink-0">
      {rows.length > 0 && (
        <>
          <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
            the lobby
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {rows.map((p, i) => (
              <PlayerCard
                key={`${p.name}-${i}`}
                p={p}
                patch={s.patch ?? "16.16.1"}
                rank={p.riotId ? ranks[p.riotId] ?? null : null}
                ally={i < (board?.ours.length ?? 5)}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="act-btn h-9 rounded-[3px] px-7 font-chakrapetch text-[12px] font-bold uppercase tracking-[0.18em]"
        >
          continue
        </button>
      </div>
    </div>
  )
}

function PlayerCard({
  p,
  patch,
  rank,
  ally,
}: {
  p: LivePlayer
  patch: string
  rank: PlayerRank | null
  ally: boolean
}) {
  const accent = ally ? "rgba(0,217,146," : "rgba(255,98,134,"
  return (
    <div
      className="ds-row flex items-center gap-2 rounded-[3px] px-2 py-1.5"
      style={{
        background: p.isMe ? `${accent}0.10)` : `${accent}0.035)`,
        boxShadow: p.isMe ? `inset 2px 0 0 0 ${accent}0.85)` : `inset 1px 0 0 0 ${accent}0.28)`,
      }}
    >
      {p.championId ? (
        <img
          src={`${CDN}/${patch}/img/champion/${p.championId}.png`}
          alt=""
          className="h-8 w-8 shrink-0 rounded-[2px]"
        />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded-[2px] bg-flash/[0.05]" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-chakrapetch text-[11.5px] font-bold leading-tight">{p.name}</p>
        <p className="truncate font-jetbrains text-[8px] uppercase tracking-[0.12em] text-flash/25">
          {/* ⚠️ rank.LABEL, not rank. This renders a PlayerRank object as a
              React child if you forget, which throws "objects are not valid as
              a React child" and takes the screen down — it did, when the rank
              lookup was widened from a string to an object and this caller was
              not updated with it.

              A rank we do not have yet and a player who has none look the same
              on a card, so neither gets a placeholder pretending otherwise. */}
          {rank?.label ?? p.champion}
        </p>
      </div>

      <p className="shrink-0 font-chakrapetch text-[11.5px] font-bold tabular-nums text-flash/75">
        {p.kills}/{p.deaths}/{p.assists}
      </p>
    </div>
  )
}

const Stat = ({ k, v, sub }: { k: string; v: string; sub: string }) => (
  <div>
    <p className="font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25">{k}</p>
    <p className="font-chakrapetch text-[21px] font-bold leading-none tabular-nums text-flash/85">{v}</p>
    <p className="mt-0.5 font-jetbrains text-[9px] tabular-nums text-flash/25">{sub}</p>
  </div>
)

const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))

/** The handful worth naming. Anything else keeps the client's own word for it
 *  rather than being called "Unknown". */
function queueName(queueId: number, mode: string): string {
  if (queueId === 420) return "ranked solo"
  if (queueId === 440) return "ranked flex"
  if (queueId === 400) return "draft"
  if (queueId === 430) return "blind"
  if (queueId === 450) return "aram"
  if (queueId === 490) return "quickplay"
  if (queueId === 700) return "clash"
  return mode.toLowerCase()
}
