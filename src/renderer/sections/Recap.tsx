import { useEffect, useState } from "react"
import { CDN, type AppState } from "../types"
import { championById } from "../../data/champions"
import ChampionStage from "../ChampionStage"

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

export default function Recap({ s, onClose }: { s: AppState; onClose: () => void }) {
  const match = s.matches?.[0] ?? null
  const [slug, setSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!match) return
    let alive = true
    void championById(match.championId)
      .then((c) => { if (alive) setSlug(c?.slug ?? null) })
      .catch(() => { if (alive) setSlug(null) })
    return () => { alive = false }
  }, [match?.championId])

  if (!match) {
    return (
      <div className="grid h-full place-items-center">
        <p className="font-chakrapetch text-[13px] text-flash/35">Waiting on the result…</p>
      </div>
    )
  }

  const mins = Math.max(1, match.durationSeconds / 60)
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths)
  const won = match.win && !match.remake

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2
          className="font-chakrapetch text-[22px] font-bold leading-none"
          style={{ color: match.remake ? "#d7d8d9" : won ? "#00d992" : "#ff6286" }}
        >
          {match.remake ? "Remake" : won ? "Victory" : "Defeat"}
        </h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {Math.floor(mins)} min · {queueName(match.queueId, match.gameMode)}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="win-btn ml-auto h-7 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          dismiss
        </button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-7">
        {/* the champion */}
        <div className="relative w-[430px] shrink-0">
          {slug && (
            <ChampionStage
              championId={slug}
              championKey={match.championId}
              className="h-full w-full"
            />
          )}
          <p className="absolute inset-x-0 bottom-0 text-center font-chakrapetch text-[15px] font-bold uppercase tracking-[0.16em] text-flash/70">
            {slug ?? "—"}
            <span className="ml-2 font-jetbrains text-[10px] tracking-[0.18em] text-flash/25">
              lvl {match.champLevel}
            </span>
          </p>
        </div>

        {/* the numbers */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
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

          <p className="mt-6 max-w-[52ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            Model by Khada (modelviewer.lol), cached on your machine after the first
            game on this champion.
          </p>
        </div>
      </div>
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
