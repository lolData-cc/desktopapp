import { useEffect, useState } from "react"
import { CDN, type AppSettings, type AppState, type Recording } from "../types"
// The same switch the Settings page uses: one control, one behaviour, one
// place to change how a toggle looks in this app.
import { Toggle } from "./Preferences"
import Player from "../Player"

/**
 * Recording, and the games it kept.
 *
 * ⚠️ The switch is OFF until the player turns it on, and the app says so in
 * game every time it records. Recording someone's screen is not a feature you
 * enable on their behalf, and a program that captures without announcing it is
 * spyware whatever it does with the file.
 *
 * The library holds the last ten automatic recordings and drops the oldest.
 * That is stated on the screen rather than left to be discovered when a game
 * someone wanted is gone — and KEEPING one takes it out of the count, so the
 * cap can never delete something they asked to save.
 */
const AUDIO: { value: AppSettings["captureAudio"]; label: string; note: string }[] = [
  { value: "none", label: "None", note: "Video only." },
  {
    value: "system",
    label: "System",
    note: "Everything the machine plays — game, Discord, music — as one track.",
  },
  { value: "mic", label: "Microphone", note: "Your voice only." },
  { value: "both", label: "Both", note: "System and microphone, mixed." },
]

export default function Capture({ s }: { s: AppState }) {
  const set = (patch: Partial<AppSettings>) => void window.desktop.setSetting(patch)
  const v = s.settings

  // The library lives on disk, so it is read when this screen opens rather
  // than pushed with every state change.
  useEffect(() => { void window.desktop.listRecordings() }, [])

  /**
   * Which recording is open, by ID rather than by value.
   *
   * The library re-arrives from the shell whenever anything is kept or
   * deleted, and holding the object would leave the player showing a stale
   * copy of a row that has since changed underneath it.
   */
  const [watching, setWatching] = useState<string | null>(null)
  const open = s.recordings.find((r) => r.id === watching) ?? null

  const kept = s.recordings.filter((r) => r.kept).length
  const automatic = s.recordings.length - kept

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Capture</h2>
        {s.recording ? (
          <span className="flex items-center gap-1.5 font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-jade">
            <span className="beat block h-[7px] w-[7px] rounded-full bg-jade" />
            recording now
          </span>
        ) : (
          <span className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
            {s.recordings.length} saved · {gb(s.libraryBytes)}
          </span>
        )}
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {s.captureError && (
          <p
            className="rounded-[3px] px-3.5 py-2.5 font-chakrapetch text-[12px] text-citrine/80"
            style={{ background: "rgba(255,182,21,0.07)" }}
          >
            {s.captureError}
          </p>
        )}

        <Toggle
          on={v.capture}
          onChange={(on) => set({ capture: on })}
          label="Record my games"
          note="Records the League window only — never your whole screen, and nothing else you have open. Starts when the game does and stops when it ends, and the overlay says so every time; that notice cannot be switched off. Around 1.3 GB per game at 1080p, so a full library of ten is roughly 13 GB."
        />

        {v.capture && (
          <section>
            <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
              audio
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {AUDIO.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => set({ captureAudio: a.value })}
                  className="rounded-[3px] px-3.5 py-2.5 text-left transition"
                  style={{
                    background:
                      v.captureAudio === a.value ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.022)",
                    boxShadow:
                      v.captureAudio === a.value ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
                  }}
                >
                  <span
                    className={`block font-chakrapetch text-[13px] font-bold ${
                      v.captureAudio === a.value ? "text-flash" : "text-flash/55"
                    }`}
                  >
                    {a.label}
                  </span>
                  <span className="mt-0.5 block font-chakrapetch text-[11px] leading-snug text-flash/30">
                    {a.note}
                  </span>
                </button>
              ))}
            </div>

            {/* ⚠️ Said plainly rather than left to be discovered. Splitting the
                game from Discord needs Windows' per-process loopback through a
                native module; the audio Chromium exposes is one mix. A "game
                only" option here would be a switch that quietly did something
                else. */}
            <p className="mt-2.5 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
              Game and Discord audio cannot be separated — Windows hands out one
              mixed track, and splitting it is not something this app can do today.
            </p>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-baseline gap-3">
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
              library
            </p>
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.16em] text-flash/25">
              {automatic} of 10 automatic{kept > 0 ? ` · ${kept} kept` : ""}
            </p>
          </div>

          {s.recordings.length === 0 ? (
            <p className="max-w-[60ch] font-chakrapetch text-[12.5px] leading-snug text-flash/30">
              {v.capture
                ? "Nothing recorded yet. The next game you play lands here."
                : "Recording is off. Turn it on and your games are kept here — the last ten, with the oldest dropped as new ones arrive."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {s.recordings.map((r, i) => (
                <Row
                  key={r.id}
                  r={r}
                  patch={s.patch ?? "16.16.1"}
                  index={i}
                  onWatch={() => setWatching(r.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <Player rec={open} patch={s.patch ?? "16.16.1"} onClose={() => setWatching(null)} />
      )}
    </div>
  )
}

function Row({
  r,
  patch,
  index,
  onWatch,
}: {
  r: Recording
  patch: string
  index: number
  onWatch: () => void
}) {
  const kills = r.highlights.filter((h) => h.kind === "kill").length
  const deaths = r.highlights.filter((h) => h.kind === "death").length

  return (
    <div
      className="ds-row flex items-center gap-3 rounded-[3px] py-2 pl-3 pr-2.5"
      style={{
        background: r.kept ? "rgba(0,217,146,0.05)" : "rgba(215,216,217,0.022)",
        boxShadow: r.kept ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
        animationDelay: `${Math.min(index, 12) * 28}ms`,
      }}
    >
      {/* The champion and the name ARE the play button. A row you can only
          open from a small control at the far right is a row people scroll
          past. */}
      <button
        type="button"
        onClick={onWatch}
        className="watch group flex min-w-0 shrink-0 items-center gap-3 text-left"
        title="Watch this game"
      >
        <span className="relative block h-9 w-9 shrink-0">
          {r.championId ? (
            <img
              src={`${CDN}/${patch}/img/champion/${r.championId}.png`}
              alt=""
              className="h-9 w-9 rounded-[3px] ring-1 ring-jade/15"
            />
          ) : (
            <span className="block h-9 w-9 rounded-[3px] bg-flash/[0.05]" />
          )}
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center rounded-[3px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: "rgba(4,10,12,0.62)" }}
          >
            <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden>
              <path d="M1 0 L10 5.5 L1 11 Z" fill="#00d992" />
            </svg>
          </span>
        </span>

        <span className="block w-[120px]">
          <span className="block truncate font-chakrapetch text-[13px] font-bold leading-tight">
            {r.championName ?? "Game"}
          </span>
          <span className="block font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
            {r.win === null ? "—" : r.win ? "win" : "loss"} · {mins(r.durationMs)}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-3">
        <Tally n={kills} label="kills" colour="#00d992" />
        <Tally n={deaths} label="deaths" colour="#ff6286" />
      </div>

      <span className="ml-auto shrink-0 font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
        {gb(r.bytes)}
      </span>

      <button
        type="button"
        onClick={onWatch}
        className="win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-jade/70"
      >
        watch
      </button>

      <button
        type="button"
        onClick={() => void window.desktop.keepRecording(r.id, !r.kept)}
        title={
          r.kept
            ? "Let this one age out with the rest"
            : "Keep this one — the ten-game limit stops counting it"
        }
        className={`win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          r.kept ? "bg-jade/15 text-jade" : "text-flash/30"
        }`}
      >
        {r.kept ? "kept" : "keep"}
      </button>

      <button
        type="button"
        onClick={() => void window.desktop.revealRecording(r.id)}
        className="win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
      >
        show
      </button>

      <button
        type="button"
        onClick={() => void window.desktop.deleteRecording(r.id)}
        className="win-btn danger h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25"
      >
        delete
      </button>
    </div>
  )
}

const Tally = ({ n, label, colour }: { n: number; label: string; colour: string }) => (
  <div className="w-[38px] text-right">
    <p className="font-chakrapetch text-[13px] font-bold leading-none tabular-nums" style={{ color: n ? colour : "rgba(215,216,217,0.2)" }}>
      {n}
    </p>
    <p className="font-jetbrains text-[8px] uppercase tracking-[0.12em] text-flash/20">{label}</p>
  </div>
)

const mins = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`

const gb = (bytes: number) =>
  bytes >= 1_073_741_824
    ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
    : `${Math.round(bytes / 1_048_576)} MB`
