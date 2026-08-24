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
 * Everything else gets out of the way — literally: once the video is running
 * the chrome fades out, and a movement of the mouse brings it back.
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

/** How long the controls stay up once the video is running and the mouse is
 *  still. Long enough to aim at a button, short enough to stop being furniture. */
const CHROME_MS = 2600

/**
 * Marks closer together than this are ONE moment.
 *
 * A teamfight is not four things that happened; it is one thing, and drawing it
 * as four marks a few pixels apart makes a smear you can neither read nor hit.
 * The pin keeps the time of the FIRST mark — a fight starts where it starts —
 * and says how many.
 */
const CLUSTER_MS = 10_000

/** What each kind of moment looks like, everywhere it is drawn. */
const KIND: Record<Highlight["kind"], { colour: string; label: string; letter: string }> = {
  kill: { colour: "#00d992", label: "kill", letter: "K" },
  multi: { colour: "#FFB615", label: "multi", letter: "M" },
  death: { colour: "#ff6286", label: "death", letter: "D" },
  assist: { colour: "#8f9295", label: "assist", letter: "A" },
}

/** One box on the timeline: a moment, or a run of them too close to separate. */
type Pin = { at: number; kind: Highlight["kind"]; count: number; label: string }

function pinsFrom(marks: Highlight[]): Pin[] {
  const out: Pin[] = []
  for (const m of marks) {
    // ⚠️ Only the same KIND merges. A kill and a death in one fight are the two
    // halves of the story, and collapsing them into "3 things happened" throws
    // away which way it went.
    const open = [...out].reverse().find((p) => p.kind === m.kind)
    if (open && m.at - open.at < CLUSTER_MS) {
      open.count++
      continue
    }
    out.push({ at: m.at, kind: m.kind, count: 1, label: m.label })
  }
  return out
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
  const panel = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [chrome, setChrome] = useState(true)
  const [full, setFull] = useState(false)

  const marks = useMemo(() => [...rec.highlights].sort((a, b) => a.at - b.at), [rec.highlights])
  const pins = useMemo(() => pinsFrom(marks), [marks])

  const seek = useCallback(
    (seconds: number) => {
      const v = video.current
      if (!v) return
      const t = Math.max(0, Math.min(total - 0.25, seconds))
      setAt(t)
      setSeeking(true)
      v.currentTime = t
    },
    [total]
  )

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

    const arrive = () => {
      if (!alive) return
      // startAt already carries its run-up: the caller chose the moment.
      seek(Math.max(0, (startAt ?? 0) / 1000))
      setReady(true)
    }

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

    v.addEventListener("loadedmetadata", onMeta)
    return () => {
      alive = false
      v.removeEventListener("loadedmetadata", onMeta)
    }
  }, [rec.id, startAt, seek])

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }, [])

  /**
   * The previous or next marked moment.
   *
   * ⚠️ Measured from the MOMENT being watched, not from the playhead. A jump
   * lands a run-up early, so a search from the playhead finds the mark we just
   * jumped to and lands on it again — pressing "next" repeatedly went nowhere.
   */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!pins.length) return
      const now = at * 1000 + RUNUP
      const next =
        dir === 1
          ? pins.find((p) => p.at > now + 400)
          : [...pins].reverse().find((p) => p.at < now - 400)
      if (next) seek(Math.max(0, (next.at - RUNUP) / 1000))
    },
    [pins, at, seek]
  )

  /**
   * The controls, and when they are not there.
   *
   * ⚠️ Only ever hidden while the video is RUNNING. A paused player with no
   * controls is a picture you cannot get out of, and every second spent
   * waggling a mouse to find the close button is a second of thinking the app
   * has frozen.
   */
  const wake = useCallback(() => {
    setChrome(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (!playing) return
    hideTimer.current = setTimeout(() => setChrome(false), CHROME_MS)
  }, [playing])

  useEffect(() => {
    wake()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [wake])

  const fullscreen = useCallback(() => {
    const el = panel.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void el.requestFullscreen().catch(() => undefined)
  }, [])

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", on)
    return () => document.removeEventListener("fullscreenchange", on)
  }, [])

  // Escape, space, arrows. A player without them is a player nobody uses twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!video.current) return
      wake()
      // ⚠️ In fullscreen, Escape belongs to fullscreen. Closing the player as
      // well would take two screens away for one keypress.
      if (e.key === "Escape") return void (document.fullscreenElement ? undefined : onClose())
      if (e.key === " ") return void (e.preventDefault(), toggle())
      if (e.key === "f") return void fullscreen()
      if (e.key === "ArrowLeft") return void (e.preventDefault(), seek(at - (e.shiftKey ? 1 : 5)))
      if (e.key === "ArrowRight") return void (e.preventDefault(), seek(at + (e.shiftKey ? 1 : 5)))
      if (e.key === "ArrowUp") return void (e.preventDefault(), step(-1))
      if (e.key === "ArrowDown") return void (e.preventDefault(), step(1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** What you are watching right now, when it is one of the marked moments. */
  const nearest = useMemo(() => {
    let hit: Highlight | null = null
    for (const m of marks) if (m.at / 1000 <= at + 0.5 && at * 1000 - m.at < 8000) hit = m
    return hit
  }, [marks, at])

  const veil = chrome || !playing

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
    <div
      ref={panel}
      onMouseMove={wake}
      /* Below the title bar and BESIDE the menu, not over either — the window
         still has to be draggable and closable while a game plays, and the
         navigation has to stay reachable. Fullscreen overrides both, in
         index.css. */
      className="clip-player fixed bottom-0 left-[196px] right-0 top-11 z-50 overflow-hidden bg-black"
    >
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

      {/* The moment you are in, named. Stays while the chrome is gone — it is
          the one thing worth reading mid-fight, and it is not a control. */}
      {ready && nearest && (
        <div
          className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 px-2.5 py-1"
          style={{
            background: "rgba(4,10,12,0.72)",
            boxShadow: `inset 2px 0 0 0 ${KIND[nearest.kind].colour}`,
          }}
        >
          <span
            className="font-jetbrains text-[9px] uppercase tracking-[0.2em]"
            style={{ color: KIND[nearest.kind].colour }}
          >
            {KIND[nearest.kind].label}
          </span>
          {nearest.label && (
            <span className="font-chakrapetch text-[12px] font-bold text-flash/80">{nearest.label}</span>
          )}
        </div>
      )}

      {/* The one big control, until it has been used. */}
      {ready && !playing && !failed && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute inset-0 grid place-items-center"
        >
          <span
            className="grid h-16 w-16 place-items-center rounded-full transition-transform hover:scale-110"
            style={{ background: "rgba(4,10,12,0.6)", boxShadow: "0 0 0 1px rgba(0,217,146,0.35)" }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden>
              <path d="M2 1 L19 11 L2 21 Z" fill="#00d992" />
            </svg>
          </span>
        </button>
      )}

      {/* ── the chrome, which comes and goes ─────────────────────────────── */}

      <header
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3.5 px-5 py-4 transition-opacity duration-300"
        style={{
          opacity: veil ? 1 : 0,
          background: "linear-gradient(rgba(4,10,12,0.85), rgba(4,10,12,0))",
        }}
      >
        {rec.championId && (
          <img
            src={`${CDN}/${patch}/img/champion/${rec.championId}.png`}
            alt=""
            className="h-9 w-9 rounded-[3px] ring-1 ring-jade/20"
          />
        )}
        <div className="min-w-0">
          <p className="font-chakrapetch text-[15px] font-bold leading-none">
            {rec.championName ?? "Recording"}
          </p>
          <p className="mt-1 font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/35">
            {rec.win === null ? "result unknown" : rec.win ? "victory" : "defeat"}
            {rec.queue ? ` · ${rec.queue}` : ""}
          </p>
        </div>

        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          <Minimal
            label={rec.kept ? "kept" : "keep"}
            title={
              rec.kept
                ? "Let this one age out with the rest"
                : "Keep this one — the ten-game limit stops counting it"
            }
            on={rec.kept}
            onClick={() => void window.desktop.keepRecording(rec.id, !rec.kept)}
          />
          <Minimal
            label="file"
            title="Show the file on disk"
            onClick={() => void window.desktop.revealRecording(rec.id)}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="win-btn danger grid h-7 w-7 place-items-center rounded-[3px] text-flash/45"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          </button>
        </div>
      </header>

      <Transport
        at={at}
        total={total}
        buffered={buffered}
        pins={pins}
        playing={playing}
        seeking={seeking}
        full={full}
        visible={veil}
        hasNext={pins.some((p) => p.at > at * 1000 + RUNUP + 400)}
        onToggle={toggle}
        onSeek={seek}
        onNext={() => step(1)}
        onFullscreen={fullscreen}
      />
    </div>,
    document.body
  )
}

/* ── the chrome ──────────────────────────────────────────────────────────── */

const Minimal = ({
  label,
  title,
  on,
  onClick,
}: {
  label: string
  title: string
  on?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`win-btn h-7 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
      on ? "bg-jade/15 text-jade" : "text-flash/40"
    }`}
  >
    {label}
  </button>
)

/**
 * The timeline, and the three things you actually press.
 *
 * ⚠️ Over the picture, not under it. A control strip that holds its own row
 * takes that height from the video for the whole session; one that floats is
 * only there while it is wanted. It fades with the rest of the chrome.
 */
function Transport({
  at,
  total,
  buffered,
  pins,
  playing,
  seeking,
  full,
  visible,
  hasNext,
  onToggle,
  onSeek,
  onNext,
  onFullscreen,
}: {
  at: number
  total: number
  buffered: number
  pins: Pin[]
  playing: boolean
  seeking: boolean
  full: boolean
  visible: boolean
  hasNext: boolean
  onToggle: () => void
  onSeek: (s: number) => void
  onNext: () => void
  onFullscreen: () => void
}) {
  const bar = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const fromX = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * total
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 px-5 pb-4 pt-10 transition-opacity duration-300"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        background: "linear-gradient(rgba(4,10,12,0), rgba(4,10,12,0.88))",
      }}
    >
      {/* ⚠️ Tall enough to hold the pins. They ARE the interface here — a
          hairline with dots on it would make the one thing worth clicking the
          hardest thing to hit. */}
      <div
        ref={bar}
        className="relative h-[30px] cursor-pointer"
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
        <span
          className="absolute inset-x-0 bottom-[6px] h-[3px]"
          style={{ background: "rgba(215,216,217,0.10)" }}
        />
        <span
          className="absolute bottom-[6px] left-0 h-[3px]"
          style={{ width: `${(buffered / total) * 100}%`, background: "rgba(215,216,217,0.18)" }}
        />
        <span
          className="absolute bottom-[6px] left-0 h-[3px]"
          style={{ width: `${(at / total) * 100}%`, background: "#00d992" }}
        />

        {pins.map((p, i) => (
          <PinBox key={i} p={p} left={Math.min(100, (p.at / 1000 / total) * 100)} onSeek={onSeek} />
        ))}

        {/* the head */}
        <span
          aria-hidden
          className="absolute bottom-[2px] h-[11px] w-[3px] -translate-x-1/2"
          style={{
            left: `${(at / total) * 100}%`,
            background: "#d7d8d9",
            boxShadow: "0 0 8px rgba(0,217,146,0.7)",
          }}
        />

        {hover !== null && (
          <span
            className="pointer-events-none absolute -top-[2px] -translate-x-1/2 font-jetbrains text-[9px] tabular-nums text-flash/50"
            style={{ left: `${(hover / total) * 100}%` }}
          >
            {mmss(hover)}
          </span>
        )}
      </div>

      {/* ⚠️ Three controls, and no more. Everything else this player does is on
          a key, and a row of eight buttons is how a video player stops feeling
          like part of the app it is in. */}
      <div className="mt-2 flex items-center gap-2">
        <Control onClick={onToggle} label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
              <path d="M0 0h3v12H0z M7 0h3v12H7z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden>
              <path d="M1 0 L11 6 L1 12 Z" fill="currentColor" />
            </svg>
          )}
        </Control>

        <Control onClick={onNext} label="Next moment" disabled={!hasNext}>
          <svg width="13" height="12" viewBox="0 0 13 12" aria-hidden>
            <path d="M0 0 L7 6 L0 12 Z" fill="currentColor" />
            <path d="M9 0 h3 v12 h-3 z" fill="currentColor" />
          </svg>
        </Control>

        <Control onClick={onFullscreen} label={full ? "Leave fullscreen" : "Fullscreen"}>
          {full ? (
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              <path d="M5 1 v4 h-4 M8 12 v-4 h4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              <path d="M1 5 v-4 h4 M12 8 v4 h-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          )}
        </Control>

        <p className="ml-1 font-jetbrains text-[10px] tabular-nums text-flash/45">
          {mmss(at)} <span className="text-flash/20">/ {mmss(total)}</span>
        </p>
        {seeking && (
          <span className="font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/25">
            seeking
          </span>
        )}
      </div>
    </div>
  )
}

/** ⚠️ Ghost buttons. A filled control over a picture is a hole punched in the
 *  frame; these read as an overlay because they barely exist until pointed at. */
const Control = ({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    disabled={disabled}
    className="grid h-8 w-8 place-items-center text-flash/55 transition-colors hover:text-jade disabled:pointer-events-none disabled:text-flash/15"
    style={{
      background: "rgba(215,216,217,0.05)",
      clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
    }}
  >
    {children}
  </button>
)

/**
 * One moment on the timeline, as a box rather than a tick.
 *
 * ⚠️ It has to say WHAT happened, not just that something did. A row of
 * identical hairlines makes you click every one to find out which was the kill
 * and which was the death you would rather not watch again — so each pin
 * carries its letter and its colour, and a run of them carries the count.
 *
 * The corner is cut on the same diagonal as the rest of this app's plates, and
 * the box sits ON the track rather than beside it, so the bar still reads as a
 * bar.
 */
function PinBox({ p, left, onSeek }: { p: Pin; left: number; onSeek: (s: number) => void }) {
  const { colour, label, letter } = KIND[p.kind]
  const many = p.count > 1
  // Assists are the most numerous and the least worth stopping for. They are
  // here, but they do not get to shout over the kills.
  const quiet = p.kind === "assist"

  return (
    <button
      type="button"
      title={`${many ? `${p.count} × ` : ""}${label}${p.label ? ` · ${p.label}` : ""} — ${mmss(p.at / 1000)}`}
      onClick={(e) => {
        e.stopPropagation()
        onSeek(Math.max(0, (p.at - RUNUP) / 1000))
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-[6px] grid -translate-x-1/2 place-items-center transition-transform hover:scale-[1.18]"
      style={{
        left: `${left}%`,
        height: quiet ? 13 : 17,
        width: many ? 25 : quiet ? 13 : 17,
        color: colour,
        background: many ? `${colour}26` : "rgba(4,10,12,0.9)",
        boxShadow: `0 0 0 1px ${colour}${quiet ? "55" : "cc"}${many ? `, 0 0 9px ${colour}66` : ""}`,
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)",
        opacity: quiet ? 0.65 : 1,
      }}
    >
      {!quiet && (
        <span className="font-jetbrains text-[9px] font-bold leading-none tracking-tight">
          {letter}
          {many && <span className="text-[8px]">{p.count}</span>}
        </span>
      )}
    </button>
  )
}
