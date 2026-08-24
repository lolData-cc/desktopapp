import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CDN, mmss, type Highlight, type Recording } from "./types"

/**
 * Watching one back.
 *
 * The point of this screen is not playback — anything can play a video. It is
 * the KILLS: a recording of a twenty-five minute game is only worth keeping if
 * the eleven moments that mattered are one keypress apart, and the rest can be
 * skipped without hunting for it.
 *
 * So the timeline is the main control and the marks on it are the content.
 * Play, pause and a clock are the small print.
 */

/**
 * How far BEFORE a marked moment a jump lands, in milliseconds.
 *
 * A kill dropped on the frame it happens explains nothing — the fight that
 * produced it is the part worth seeing. Exported because the recap jumps into
 * the same recording and the two must agree: a moment that lands somewhere
 * else depending on which screen you clicked it from reads as a bug.
 */
export const RUNUP = 2000

/** What each kind of moment looks like, everywhere it is drawn. */
const KIND: Record<Highlight["kind"], { colour: string; label: string }> = {
  kill: { colour: "#00d992", label: "kill" },
  multi: { colour: "#FFB615", label: "multi" },
  death: { colour: "#ff6286", label: "death" },
  assist: { colour: "rgba(215,216,217,0.55)", label: "assist" },
}

export default function Player({
  rec,
  startAt,
  patch,
  onClose,
}: {
  rec: Recording
  /** Open here, in milliseconds — a kill clicked in the recap. */
  startAt?: number
  patch: string
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement | null>(null)

  /**
   * ⚠️ The length comes from the SHELL, not from the file.
   *
   * A MediaRecorder writes a live stream: there is no duration in the header,
   * so `video.duration` is Infinity until the whole file has been probed. The
   * shell timed the recording with a clock and already knows the answer, which
   * means the timeline can be drawn correctly on the first frame instead of
   * appearing once the video has been read to its end.
   */
  const total = Math.max(1, rec.durationMs / 1000)

  const [at, setAt] = useState((startAt ?? 0) / 1000)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [buffered, setBuffered] = useState(0)

  const marks = useMemo(
    () => [...rec.highlights].sort((a, b) => a.at - b.at),
    [rec.highlights]
  )

  const seek = useCallback((seconds: number) => {
    const v = video.current
    if (!v) return
    const t = Math.max(0, Math.min(total - 0.25, seconds))
    setAt(t)
    setSeeking(true)
    v.currentTime = t
  }, [total])

  /**
   * ⚠️ The file has to be read to its end before it can be seeked in.
   *
   * A MediaRecorder file carries no index, so Chromium reports Infinity and
   * refuses to land anywhere until it has found the last cluster. Asking to
   * seek past the end is the way to make it go and look — after which the real
   * duration is known and the positions in between become reachable.
   *
   * It is done BEFORE the video is shown, because it flings the picture to the
   * final frame on the way through, and a player that opens on the end of the
   * game and jumps backwards looks broken.
   */
  useEffect(() => {
    const v = video.current
    if (!v) return
    let alive = true

    const onMeta = () => {
      if (isFinite(v.duration)) return void arrive()
      const done = () => {
        if (!isFinite(v.duration)) return
        v.removeEventListener("durationchange", done)
        arrive()
      }
      v.addEventListener("durationchange", done)
      v.currentTime = 1e101
    }

    const arrive = () => {
      if (!alive) return
      // startAt already carries its run-up: the caller chose the moment.
      seek(Math.max(0, (startAt ?? 0) / 1000))
      setReady(true)
    }

    v.addEventListener("loadedmetadata", onMeta)
    return () => {
      alive = false
      v.removeEventListener("loadedmetadata", onMeta)
    }
  }, [rec.id, startAt, seek])

  // Escape, space, arrows. A player without them is a player nobody uses twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = video.current
      if (!v) return
      if (e.key === "Escape") return onClose()
      if (e.key === " ") { e.preventDefault(); return void toggle() }
      if (e.key === "ArrowLeft") { e.preventDefault(); return seek(at - (e.shiftKey ? 1 : 5)) }
      if (e.key === "ArrowRight") { e.preventDefault(); return seek(at + (e.shiftKey ? 1 : 5)) }
      if (e.key === "ArrowUp") { e.preventDefault(); return step(-1) }
      if (e.key === "ArrowDown") { e.preventDefault(); return step(1) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }

  /**
   * The previous or next marked moment.
   *
   * ⚠️ Measured from the MOMENT being watched, not from the playhead. A jump
   * lands a run-up early, so a search from the playhead finds the mark we just
   * jumped to and lands on it again — pressing "next" repeatedly went nowhere.
   */
  const step = (dir: 1 | -1) => {
    if (!marks.length) return
    const now = at * 1000 + RUNUP
    const next =
      dir === 1
        ? marks.find((m) => m.at > now + 400)
        : [...marks].reverse().find((m) => m.at < now - 400)
    if (next) seek(Math.max(0, (next.at - RUNUP) / 1000))
  }

  const nearest = useMemo(() => {
    let hit: Highlight | null = null
    for (const m of marks) if (m.at / 1000 <= at + 0.5 && at * 1000 - m.at < 8000) hit = m
    return hit
  }, [marks, at])

  /**
   * ⚠️ Rendered into the BODY, not where it sits in the tree.
   *
   * This is positioned against the window: below the title bar, beside the
   * menu. `position: fixed` only means that when no ancestor is a containing
   * block — and <main> is one, because its entrance animation touches
   * `transform` and fills forwards, which Chromium honours even once the
   * computed value is back to `none`. So the panel was measuring itself
   * against a box that starts below the section's own padding, and landed
   * fifty pixels low.
   *
   * Worse, it was CONDITIONAL: with reduced motion the animation is off, the
   * containing block disappears, and the same markup lands somewhere else. A
   * portal takes the question away rather than answering it.
   */
  return createPortal(
    /* Below the title bar and BESIDE the menu, not over either. The window
       still has to be draggable and closable while a game plays, and the
       navigation has to stay reachable — a player that swallows the whole
       window is a mode you have to escape from rather than a screen you are
       on. */
    <div className="fixed bottom-0 left-[196px] right-0 top-11 z-50 flex flex-col" style={{ background: "rgba(4,10,12,0.93)", backdropFilter: "blur(10px)" }}>
      <Head rec={rec} patch={patch} onClose={onClose} />

      {/* the picture */}
      {/* ⚠️ Sized by the SPACE, not by the recording. Letting the frame drive
          the layout means a 21:9 monitor's capture decides how tall this
          screen is, and object-contain already keeps the picture honest
          inside whatever room is left. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-8">
        <div className="relative h-full w-full">
          <video
            ref={video}
            src={window.desktop.clipUrl(rec.id)}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: ready ? 1 : 0, transition: "opacity 240ms ease" }}
            onClick={toggle}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeked={() => setSeeking(false)}
            onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
            onProgress={(e) => {
              const b = e.currentTarget.buffered
              setBuffered(b.length ? b.end(b.length - 1) : 0)
            }}
            onError={() =>
              setFailed("This recording could not be opened. The file may have been moved or deleted.")
            }
          />

          {!ready && !failed && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="font-jetbrains text-[10px] uppercase tracking-[0.22em] text-flash/35">
                reading the recording…
              </p>
            </div>
          )}

          {failed && (
            <div className="absolute inset-0 grid place-items-center px-10">
              <p className="max-w-[40ch] text-center font-chakrapetch text-[13px] leading-snug text-citrine/70">
                {failed}
              </p>
            </div>
          )}

          {/* What you are looking at, when it is one of the marked moments. */}
          {ready && nearest && (
            <div
              className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 px-2.5 py-1"
              style={{ background: "rgba(4,10,12,0.72)", boxShadow: `inset 2px 0 0 0 ${KIND[nearest.kind].colour}` }}
            >
              <span className="font-jetbrains text-[9px] uppercase tracking-[0.2em]" style={{ color: KIND[nearest.kind].colour }}>
                {KIND[nearest.kind].label}
              </span>
              {nearest.label && (
                <span className="font-chakrapetch text-[12px] font-bold text-flash/80">{nearest.label}</span>
              )}
            </div>
          )}

          {ready && !playing && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Play"
              className="absolute inset-0 grid place-items-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "rgba(4,10,12,0.6)", boxShadow: "0 0 0 1px rgba(0,217,146,0.35)" }}>
                <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden>
                  <path d="M2 1 L19 11 L2 21 Z" fill="#00d992" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </div>

      <Transport
        at={at}
        total={total}
        buffered={buffered}
        marks={marks}
        playing={playing}
        seeking={seeking}
        onToggle={toggle}
        onSeek={seek}
        onStep={step}
      />
    </div>,
    document.body
  )
}

/* ── the header ──────────────────────────────────────────────────────────── */

function Head({ rec, patch, onClose }: { rec: Recording; patch: string; onClose: () => void }) {
  const kills = rec.highlights.filter((h) => h.kind === "kill").length
  const deaths = rec.highlights.filter((h) => h.kind === "death").length

  return (
    <header className="flex shrink-0 items-center gap-3.5 px-7 py-4">
      {rec.championId && (
        <img
          src={`${CDN}/${patch}/img/champion/${rec.championId}.png`}
          alt=""
          className="h-10 w-10 rounded-[3px] ring-1 ring-jade/20"
        />
      )}
      <div className="min-w-0">
        <p className="font-chakrapetch text-[17px] font-bold leading-none">
          {rec.championName ?? "Recording"}
        </p>
        <p className="mt-1 font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/30">
          {rec.win === null ? "result unknown" : rec.win ? "victory" : "defeat"}
          {rec.queue ? ` · ${rec.queue}` : ""} · {kills} kills · {deaths} deaths
        </p>
      </div>

      <button
        type="button"
        onClick={() => void window.desktop.keepRecording(rec.id, !rec.kept)}
        title={rec.kept ? "Let this one age out with the rest" : "Keep this one — the ten-game limit stops counting it"}
        className={`win-btn ml-auto h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          rec.kept ? "bg-jade/15 text-jade" : "text-flash/35"
        }`}
      >
        {rec.kept ? "kept" : "keep"}
      </button>
      <button
        type="button"
        onClick={() => void window.desktop.revealRecording(rec.id)}
        className="win-btn h-7 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/35"
      >
        show file
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="win-btn danger grid h-7 w-7 place-items-center rounded-[3px] text-flash/40"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
          <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </svg>
      </button>
    </header>
  )
}

/* ── the timeline ────────────────────────────────────────────────────────── */

function Transport({
  at,
  total,
  buffered,
  marks,
  playing,
  seeking,
  onToggle,
  onSeek,
  onStep,
}: {
  at: number
  total: number
  buffered: number
  marks: Highlight[]
  playing: boolean
  seeking: boolean
  onToggle: () => void
  onSeek: (s: number) => void
  onStep: (dir: 1 | -1) => void
}) {
  const bar = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const fromX = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * total
  }

  return (
    <div className="shrink-0 px-7 pb-6 pt-2">
      {/* ⚠️ The bar is 22px tall, not the usual 4. The marks ARE the interface
          here — a hairline with dots on it would make the one thing worth
          clicking the hardest thing to hit. */}
      <div
        ref={bar}
        className="relative h-[22px] cursor-pointer"
        onMouseMove={(e) => setHover(fromX(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onSeek(fromX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) onSeek(fromX(e.clientX))
        }}
      >
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2" style={{ background: "rgba(215,216,217,0.08)" }} />
        <span
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2"
          style={{ width: `${(buffered / total) * 100}%`, background: "rgba(215,216,217,0.14)" }}
        />
        <span
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2"
          style={{ width: `${(at / total) * 100}%`, background: "#00d992" }}
        />

        {marks.map((m, i) => (
          <span
            key={i}
            title={`${KIND[m.kind].label}${m.label ? " · " + m.label : ""} — ${mmss(m.at / 1000)}`}
            className="absolute top-1/2 h-[15px] w-[2px] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.min(100, (m.at / 1000 / total) * 100)}%`, background: KIND[m.kind].colour }}
          />
        ))}

        {/* the head */}
        <span
          aria-hidden
          className="absolute top-1/2 h-[13px] w-[3px] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(at / total) * 100}%`, background: "#d7d8d9", boxShadow: "0 0 8px rgba(0,217,146,0.6)" }}
        />

        {hover !== null && (
          <span
            className="pointer-events-none absolute -top-5 -translate-x-1/2 font-jetbrains text-[9px] tabular-nums text-flash/45"
            style={{ left: `${(hover / total) * 100}%` }}
          >
            {mmss(hover)}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2.5">
        <button type="button" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} className="win-btn grid h-8 w-8 place-items-center rounded-[3px]">
          {playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden><path d="M0 0h3v12H0z M7 0h3v12H7z" fill="#00d992" /></svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden><path d="M1 0 L11 6 L1 12 Z" fill="#00d992" /></svg>
          )}
        </button>

        <p className="font-jetbrains text-[10px] tabular-nums text-flash/40">
          {mmss(at)} <span className="text-flash/20">/ {mmss(total)}</span>
          {seeking && <span className="ml-2 text-flash/25">seeking…</span>}
        </p>

        <div className="ml-auto flex items-center gap-1.5">
          <Nav onClick={() => onStep(-1)} label="◤ previous" hint="↑" disabled={!marks.length} />
          <Nav onClick={() => onStep(1)} label="next ◥" hint="↓" disabled={!marks.length} />
        </div>
      </div>

      {/* Every marked moment, in a row. The bar is for scrubbing; this is for
          reading — "what happened in this game" as a list you can click. */}
      {marks.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {marks.map((m, i) => {
            const live = at * 1000 >= m.at - 2200 && at * 1000 - m.at < 6000
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSeek(Math.max(0, (m.at - RUNUP) / 1000))}
                className="shrink-0 px-2.5 py-1.5 text-left transition"
                style={{
                  background: live ? "rgba(0,217,146,0.09)" : "rgba(215,216,217,0.03)",
                  boxShadow: `inset 2px 0 0 0 ${live ? KIND[m.kind].colour : "transparent"}`,
                }}
              >
                <span className="block font-jetbrains text-[8.5px] uppercase tracking-[0.16em]" style={{ color: KIND[m.kind].colour }}>
                  {KIND[m.kind].label}
                </span>
                <span className="block font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/70">
                  {mmss(m.at / 1000)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Nav = ({ onClick, label, hint, disabled }: { onClick: () => void; label: string; hint: string; disabled: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="win-btn flex h-8 items-center gap-2 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40 disabled:opacity-30"
  >
    {label}
    <span className="text-flash/20">{hint}</span>
  </button>
)
