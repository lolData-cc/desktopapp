import { useEffect, useState } from "react"
import { championById } from "../../data/champions"
import Player from "../Player"
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
 * Recent games, read from the client.
 *
 * A row is meant to be read at a glance and in order of what matters: did you
 * win, on what, how did it go. So the result is a colour and a bar down the
 * left edge rather than the word "Victory" — the eye finds an edge faster than
 * it reads a label — and KDA leads the numbers because it is the one everybody
 * looks at first.
 *
 * Remakes are shown and set apart. They are not losses, and the website's
 * season stats once counted them as such; a game that ended before it counted
 * should not look like one that did.
 */
export default function Matches({ s }: { s: AppState }) {
  const [busy, setBusy] = useState(false)
  const matches = s.matches

  /**
   * ⚠️ The recordings belong HERE, not on a tab of their own.
   *
   * A capture is not a separate kind of object you go and browse — it is this
   * game, with a video attached. Filed apart, you had to remember which of ten
   * "Lillia, 26 min" rows in one list was the row you were reading in the
   * other. Attached, the question never comes up.
   */
  useEffect(() => { void window.desktop.listRecordings() }, [])

  /** Which recording is open, by ID: the library re-arrives from the shell on
   *  every change, and holding the object would show a stale copy. */
  const [watching, setWatching] = useState<string | null>(null)
  const open = s.recordings.find((r) => r.id === watching) ?? null

  const refresh = async () => {
    setBusy(true)
    await window.desktop.refreshProfile().catch(() => undefined)
    setBusy(false)
  }

  if (!matches) return <Empty>Reading your match history…</Empty>
  if (!matches.length) {
    return <Empty>No games yet. Play one and it will show up here.</Empty>
  }

  const real = matches.filter((m) => !m.remake)
  const wins = real.filter((m) => m.win).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Matches</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          last {matches.length}
          {real.length > 0 && (
            <>
              {" · "}
              <span className="text-jade/70">{wins}W</span>
              {" "}
              <span className="text-flash/40">{real.length - wins}L</span>
              {" · "}
              {Math.round((wins / real.length) * 100)}% wr
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="win-btn ml-auto h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/35"
        >
          {busy ? "reading" : "refresh"}
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {matches.map((m, i) => (
          <Row
            key={m.gameId}
            m={m}
            patch={s.patch}
            index={i}
            clip={recordingFor(s.recordings, m)}
            onWatch={setWatching}
          />
        ))}
      </div>

      {open && (
        <Player rec={open} patch={s.patch ?? "16.16.1"} onClose={() => setWatching(null)} />
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center">
      <p className="font-jetbrains text-[10px] uppercase tracking-[0.2em] text-flash/25">{children}</p>
    </div>
  )
}

function Row({
  m,
  patch,
  index,
  clip,
  onWatch,
}: {
  m: Match
  patch: string | null
  index: number
  /** The recording of this game, when there is one. */
  clip: Recording | null
  onWatch: (id: string) => void
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

  // Won, lost, or did not count. The third is a real outcome, not a bad loss.
  const edge = m.remake ? "rgba(215,216,217,0.25)" : m.win ? "#00d992" : "#FFB615"
  const kda = m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths

  return (
    <div
      className="ds-row relative flex items-center gap-3 rounded-[3px] py-2 pl-4 pr-3"
      style={{
        background: m.remake ? "rgba(215,216,217,0.02)" : m.win ? "rgba(0,217,146,0.05)" : "rgba(255,182,21,0.04)",
        boxShadow: `inset 3px 0 0 0 ${edge}`,
        // Rows arrive in sequence, the way the notification assembles.
        animationDelay: `${Math.min(index, 12) * 28}ms`,
      }}
    >
      {slug ? (
        <img
          src={`${CDN}/${v}/img/champion/${slug}.png`}
          alt=""
          className="h-10 w-10 shrink-0 rounded-[3px] ring-1 ring-jade/15"
        />
      ) : (
        <span className="h-10 w-10 shrink-0 rounded-[3px] bg-flash/[0.04]" />
      )}

      <div className="w-[104px] shrink-0">
        <p className="font-chakrapetch text-[13px] font-bold leading-tight text-flash/85">
          {queueName(m.queueId, m.gameMode)}
        </p>
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
          {m.remake ? "remake" : timeAgo(m.playedAt)}
        </p>
      </div>

      <div className="w-[96px] shrink-0">
        <p className="font-chakrapetch text-[14px] font-bold tabular-nums leading-tight">
          {m.kills} <span className="text-flash/25">/</span>{" "}
          <span className={m.deaths === 0 ? "text-jade" : ""}>{m.deaths}</span>{" "}
          <span className="text-flash/25">/</span> {m.assists}
        </p>
        <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
          {m.deaths === 0 ? "perfect" : `${kda.toFixed(1)} kda`}
        </p>
      </div>

      <div className="hidden w-[92px] shrink-0 sm:block">
        <p className="font-chakrapetch text-[12px] tabular-nums leading-tight text-flash/60">
          {m.creepScore} cs
        </p>
        <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
          lvl {m.champLevel} · {mmss(m.durationSeconds)}
        </p>
      </div>

      {/* Final inventory. Empty slots are drawn, so a six-item game and a
          three-item one do not look the same shape. */}
      <div className="ml-auto flex shrink-0 items-center gap-[3px]">
        {Array.from({ length: 6 }, (_, i) => {
          const id = m.items[i]
          return id ? (
            <img
              key={i}
              src={`${CDN}/${v}/img/item/${id}.png`}
              alt=""
              className="h-[22px] w-[22px] rounded-[2px]"
            />
          ) : (
            <span key={i} className="h-[22px] w-[22px] rounded-[2px] bg-flash/[0.035]" />
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-[3px]">
        {m.spells.filter(Boolean).map((id, i) => (
          <img
            key={`${id}-${i}`}
            src={`${CDN}/${v}/img/spell/${spellFile(id)}.png`}
            alt=""
            className="h-[18px] w-[18px] rounded-[2px] opacity-70"
          />
        ))}
      </div>

      {/* ⚠️ The slot is always there, filled or empty. Rows that grow a button
          only when they have a recording shuffle the whole column sideways as
          you scroll past the game where capture was switched on. */}
      <span className="ml-2.5 grid w-[30px] shrink-0 place-items-center">
        {clip ? (
          <button
            type="button"
            onClick={() => onWatch(clip.id)}
            aria-label={`Watch ${queueName(m.queueId, m.gameMode)}`}
            title={`Watch this game — ${clip.highlights.length} moment${clip.highlights.length === 1 ? "" : "s"} marked`}
            className="grid h-[26px] w-[26px] place-items-center transition-transform hover:scale-110"
            style={{ cursor: "pointer" }}
          >
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
              <path d="M13 2 L24 13 L13 24 L2 13 Z" fill="rgba(0,217,146,0.10)" stroke="#00d992" strokeWidth="1.2" />
              <path d="M10.5 8.5 L17.5 13 L10.5 17.5 Z" fill="#00d992" />
            </svg>
          </button>
        ) : (
          <span
            aria-hidden
            className="block h-[4px] w-[4px] rotate-45"
            style={{ background: "rgba(215,216,217,0.10)" }}
          />
        )}
      </span>
    </div>
  )
}

/**
 * Summoner spell ids into DDragon's file names.
 *
 * DDragon keys spells by internal NAME, not by the numeric id the client
 * reports, and publishes no id→name map — so this is the join, and an id we do
 * not know renders nothing rather than a broken image.
 */
const SPELL_FILE: Record<number, string> = {
  1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste",
  7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 13: "SummonerMana",
  14: "SummonerDot", 21: "SummonerBarrier", 32: "SummonerSnowball", 39: "SummonerSnowURFSnowball_Mark",
  54: "Summoner_UltBookPlaceholder", 55: "Summoner_UltBookSmitePlaceholder",
}
const spellFile = (id: number) => SPELL_FILE[id] ?? "SummonerFlash"
