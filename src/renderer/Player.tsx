import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CDN, mmss, type Highlight, type Recording } from "./types"
import { KIND, Timeline, pinsFrom } from "./PlayerMarks"
import PlayerDraw, { type Stroke } from "./PlayerDraw"

/**
 * Watching one back.
 *
 * The point of this screen is not playback — anything can play a video. It is
 * the KILLS: a recording of a twenty-five minute game is only worth keeping if
 * the eleven moments that mattered are one keypress apart, and the rest can be
 * skipped without hunting for it.
 *
 * So the timeline is the main control and the marks on it are the content.
 * Everything else gets out of the way — literally: leave the pointer alone and
 * the whole interface leaves, and it assembles itself again when you move.
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

/** How long the interface stays up with the pointer still. */
const IDLE_MS = 2800

/** A single click waits this long to see whether a second one is coming. */
const DOUBLE_MS = 230

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
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [drawing, setDrawing] = useState(false)
  /**
   * Whether playback has ever been started.
   *
   * ⚠️ The smaller controls do not exist before it. On opening there is one
   * thing to do and one control that does it; a row of five is a decision
   * nobody has been given a reason to make yet.
   */
  const [started, setStarted] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  /** Bumped every time the chrome comes back, so the assembly replays. */
  const [build, setBuild] = useState(0)

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
   * The interface comes back, and starts counting down again.
   *
   * ⚠️ It goes away whether or not the video is running. That is a change from
   * how this behaved, and it is deliberate: a still frame you are studying is
   * exactly when a control strip across the bottom is in the way. The pointer
   * moving anywhere brings everything back within one frame, and Escape always
   * closes the player whatever is on screen.
   */
  const wake = useCallback(() => {
    setChrome((was) => {
      if (!was) setBuild((n) => n + 1)
      return true
    })
    if (idle.current) clearTimeout(idle.current)
    // While drawing, the interface is the tool. It does not vanish mid-stroke.
    if (drawing) return
    idle.current = setTimeout(() => setChrome(false), IDLE_MS)
  }, [drawing])

  useEffect(() => {
    wake()
    return () => {
      if (idle.current) clearTimeout(idle.current)
    }
  }, [wake])

  /**
   * Going fullscreen, animated by us rather than by the operating system.
   *
   * ⚠️ There is no transition to hook. The browser relays the element at the
   * size of the screen between one frame and the next — it does not tween, and
   * no amount of CSS on the element will make it, because the geometry change
   * is not a style change.
   *
   * So it is measured and inverted: take the rectangle it occupied BEFORE,
   * let the jump happen, then transform the now-huge element back down onto
   * that old rectangle and animate the transform away. The eye sees the panel
   * grow out of where it was. Non-uniform scale on purpose — the two axes
   * really do change by different amounts, and matching that is what makes it
   * read as the same object rather than a new one fading in.
   */
  const grow = useCallback((from: DOMRect, to: DOMRect) => {
    const el = panel.current
    if (!el) return
    const sx = Math.max(0.01, from.width / to.width)
    const sy = Math.max(0.01, from.height / to.height)
    const dx = from.left - to.left
    const dy = from.top - to.top

    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.72 },
        { transform: "none", opacity: 1 },
      ],
      // Slower than the interface's own 320ms: this is a whole screen moving,
      // and a large object that travels at the speed of a small one looks
      // weightless.
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    )
  }, [])

  /** The rectangle we were at before the jump, kept across the event. */
  const before = useRef<DOMRect | null>(null)

  const fullscreen = useCallback(() => {
    const el = panel.current
    if (!el) return
    before.current = el.getBoundingClientRect()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void el.requestFullscreen().catch(() => undefined)
  }, [])

  useEffect(() => {
    const on = () => {
      setFull(!!document.fullscreenElement)
      const el = panel.current
      const from = before.current
      before.current = null
      if (!el || !from) return
      /**
       * ⚠️ Measured on THIS tick, not after a frame.
       *
       * The element has already been resized by the time this event fires —
       * that is what the event is for — and getBoundingClientRect forces the
       * layout it needs, so the new rectangle is available now. Waiting for a
       * frame first also made the whole effect conditional on the window being
       * on screen: requestAnimationFrame does not run for a page that is not
       * compositing, so the animation would simply not happen and nothing would
       * say why.
       */
      grow(from, el.getBoundingClientRect())
    }
    document.addEventListener("fullscreenchange", on)
    return () => document.removeEventListener("fullscreenchange", on)
  }, [grow])

  // Volume lives on the element; this keeps the two in step.
  useEffect(() => {
    const v = video.current
    if (!v) return
    v.volume = volume
    v.muted = muted
  }, [volume, muted])

  /**
   * ⚠️ A click waits to find out whether it is half of a double.
   *
   * Double-click goes fullscreen, and without this the two clicks underneath it
   * also toggle play twice — the picture stutters on its way to filling the
   * screen for no reason anyone could explain.
   */
  const onVideoClick = () => {
    if (drawing) return
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      toggle()
    }, DOUBLE_MS)
  }

  const onVideoDouble = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (!drawing) fullscreen()
  }

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
      if (e.key === "m") return void setMuted((m) => !m)
      if (e.key === "d") return void setDrawing((d) => !d)
      if (e.key === "ArrowLeft") return void (e.preventDefault(), seek(at - (e.shiftKey ? 1 : 5)))
      if (e.key === "ArrowRight") return void (e.preventDefault(), seek(at + (e.shiftKey ? 1 : 5)))
      if (e.key === "ArrowUp") return void (e.preventDefault(), step(-1))
      if (e.key === "ArrowDown") return void (e.preventDefault(), step(1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** Drawing on a moving picture is drawing on nothing. */
  const enterDrawing = () => {
    setDrawing((was) => {
      if (!was) video.current?.pause()
      else setStrokes([])
      return !was
    })
    wake()
  }

  /** What you are watching right now, when it is one of the marked moments. */
  const nearest = useMemo(() => {
    let hit: Highlight | null = null
    for (const m of marks) if (m.at / 1000 <= at + 0.5 && at * 1000 - m.at < 8000) hit = m
    return hit
  }, [marks, at])

  // Nothing hides while the recording is still being opened: an empty black
  // rectangle with no interface is indistinguishable from a crash.
  const veil = chrome || !ready || !!failed

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
      className="clip-player fixed bottom-0 left-[196px] right-0 top-11 z-50 overflow-hidden bg-black"
      /* ⚠️ The cursor belongs to the MODE, not to the canvas.
         Set on the canvas alone it changed back to an arrow over every control
         that overlapped it — which, with the strip across the bottom, was most
         of the lower third — so it flickered as the pointer crossed edges that
         were invisible. Drawing is a mode: the pointer means one thing until
         the mode ends. */
      style={drawing ? { cursor: "crosshair" } : undefined}
    >
      <video
        ref={video}
        src={window.desktop.clipUrl(rec.id)}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ opacity: ready ? 1 : 0, transition: "opacity 240ms ease" }}
        onClick={onVideoClick}
        onDoubleClick={onVideoDouble}
        onPlay={() => {
          setPlaying(true)
          setStarted(true)
        }}
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

      <PlayerDraw active={drawing} strokes={strokes} onChange={setStrokes} />

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
          className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-2 px-2.5 py-1"
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

      {ready && !playing && !failed && !drawing && <BigPlay onClick={toggle} at={at} />}

      {drawing && <DrawBanner onClear={() => setStrokes([])} onDone={enterDrawing} count={strokes.length} />}

      {/* ── the chrome ───────────────────────────────────────────────────── */}

      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3.5 px-5 py-4 transition-opacity duration-300"
        style={{
          opacity: veil && !drawing ? 1 : 0,
          background: "linear-gradient(rgba(4,10,12,0.88), rgba(4,10,12,0))",
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

        {/* ⚠️ Not in fullscreen. Keeping a recording and finding it on disk are
            things you do to a FILE, in a library — they have no business on a
            screen somebody has made as big as it goes in order to watch it. */}
        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          {!full && (
          <>
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
          <Minimal label="file" title="Show the file on disk" onClick={() => void window.desktop.revealRecording(rec.id)} />
          </>
          )}
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

      <div
        className="absolute inset-x-0 bottom-0 z-20 px-5 pb-4 pt-16 transition-opacity duration-300"
        /* ⚠️ Gone while drawing, not merely faded. The strip covers the bottom
           third of the frame and takes the pointer with it, so the part of the
           picture nearest the action was the part that could not be drawn on. */
        style={{
          opacity: veil && !drawing ? 1 : 0,
          pointerEvents: veil && !drawing ? "auto" : "none",
          background: "linear-gradient(rgba(4,10,12,0), rgba(4,10,12,0.9))",
        }}
      >
        {/* ⚠️ The cluster sits ABOVE the bar and centred, floating, rather than
            in a row beside the clock. It is the thing you reach for; the bar is
            the thing you read. Putting them on one line made both worse. */}
        {started && (
        <Cluster
          key={build}
          playing={playing}
          full={full}
          drawing={drawing}
          muted={muted}
          volume={volume}
          hasNext={pins.some((p) => p.at > at * 1000 + RUNUP + 400)}
          onToggle={toggle}
          onNext={() => step(1)}
          onFullscreen={fullscreen}
          onDraw={enterDrawing}
          onMute={() => setMuted((m) => !m)}
          onVolume={(x) => {
            setVolume(x)
            setMuted(x === 0)
          }}
        />
        )}

        <Timeline at={at} total={total} buffered={buffered} pins={pins} onSeek={seek} runup={RUNUP} />

        <div className="mt-1.5 flex items-center gap-3">
          <p className="font-jetbrains text-[10px] tabular-nums text-flash/45">
            {mmss(at)} <span className="text-flash/20">/ {mmss(total)}</span>
          </p>
          {seeking && (
            <span className="font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/25">seeking</span>
          )}
          <span className="ml-auto font-jetbrains text-[8.5px] uppercase tracking-[0.18em] text-flash/[0.18]">
            double-click for fullscreen · ↑↓ moments · d draws
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── the cluster ─────────────────────────────────────────────────────────── */

const PLATE = "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px))"

/**
 * The controls, as floating plates.
 *
 * ⚠️ Remounted whenever the interface returns, which is what replays the
 * assembly. Each plate opens from a slit of light, its top edge draws across,
 * and the glyph lands last — staggered outwards from the centre, so the thing
 * you press most arrives first.
 */
function Cluster({
  playing,
  full,
  drawing,
  muted,
  volume,
  hasNext,
  onToggle,
  onNext,
  onFullscreen,
  onDraw,
  onMute,
  onVolume,
}: {
  playing: boolean
  full: boolean
  drawing: boolean
  muted: boolean
  volume: number
  hasNext: boolean
  onToggle: () => void
  onNext: () => void
  onFullscreen: () => void
  onDraw: () => void
  onMute: () => void
  onVolume: (v: number) => void
}) {
  return (
    <div className="mb-5 flex items-end justify-center gap-2.5">
      <Plate delay={120} label={drawing ? "Stop drawing" : "Draw on the frame"} on={drawing} onClick={onDraw}>
        <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
          <path d="M2 16 L2.8 12.4 L12.2 3 L15 5.8 L5.6 15.2 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M11 4.2 L13.8 7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </Plate>

      <Volume delay={60} muted={muted} volume={volume} onMute={onMute} onVolume={onVolume} />

      {/* The one you reach for, and it is bigger for it. */}
      <Plate delay={0} big label={playing ? "Pause" : "Play"} onClick={onToggle}>
        {playing ? (
          <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden>
            <path d="M1 0h4v18H1z M10 0h4v18h-4z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden>
            <path d="M2 0 L16 9 L2 18 Z" fill="currentColor" />
          </svg>
        )}
      </Plate>

      <Plate delay={60} label="Next moment" disabled={!hasNext} onClick={onNext}>
        <svg width="17" height="15" viewBox="0 0 18 16" aria-hidden>
          <path d="M1 1 L11 8 L1 15 Z" fill="currentColor" />
          <path d="M13.5 1 h3.5 v14 h-3.5 z" fill="currentColor" />
        </svg>
      </Plate>

      <Plate delay={120} label={full ? "Leave fullscreen" : "Fullscreen"} on={full} onClick={onFullscreen}>
        {full ? (
          <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
            <path d="M7 1 v6 h-6 M11 17 v-6 h6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
            <path d="M1 7 v-6 h6 M17 11 v6 h-6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </Plate>
    </div>
  )
}

function Plate({
  children,
  label,
  onClick,
  delay,
  big,
  on,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  delay: number
  big?: boolean
  on?: boolean
  disabled?: boolean
}) {
  const size = big ? 58 : 46
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="ds-build group relative grid shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-25"
      style={{
        // ⚠️ Stated, not inherited. Buttons default to an arrow and the slider
        // inside the volume panel asks for a pointer, so crossing between them
        // flipped the cursor back and forth over invisible edges.
        cursor: "pointer",
        width: size,
        height: size,
        animationDelay: `${delay}ms`,
        clipPath: PLATE,
        background: on ? "rgba(0,217,146,0.16)" : "rgba(4,10,12,0.72)",
        color: on ? "#00d992" : "#d7d8d9",
        boxShadow: on
          ? "inset 0 0 0 1px rgba(0,217,146,0.55)"
          : "inset 0 0 0 1px rgba(215,216,217,0.14)",
        backdropFilter: "blur(6px)",
      }}
    >
      {/* The edge that draws itself, and then lives as the plate's highlight. */}
      <span
        aria-hidden
        className="ds-edge absolute left-0 top-0 h-px"
        style={{ width: `calc(100% - 9px)`, background: on ? "#00d992" : "rgba(0,217,146,0.4)", animationDelay: `${delay + 60}ms` }}
      />
      <span className="ds-glyph transition-colors group-hover:text-jade" style={{ animationDelay: `${delay + 140}ms` }}>
        {children}
      </span>
    </button>
  )
}

/**
 * The speaker, with its slider folded away until it is pointed at.
 *
 * ⚠️ There is no GAP between the button and the panel it opens. There was —
 * eight pixels of it — and moving the pointer towards the slider crossed that
 * gap, left the hover region and closed the thing being reached for. The panel
 * hangs off a wrapper whose padding IS the bridge, so the two are one
 * continuous surface however it looks.
 *
 * ⚠️ And it closes on a short delay rather than instantly. Cutting a corner on
 * the way to the slider leaves the wrapper for a frame or two, and a menu that
 * cannot survive that is a menu you have to approach carefully — which is not
 * something anyone should have to do to a volume control.
 */
function Volume({
  delay,
  muted,
  volume,
  onMute,
  onVolume,
}: {
  delay: number
  muted: boolean
  volume: number
  onMute: () => void
  onVolume: (v: number) => void
}) {
  const [open, setOpen] = useState(false)
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null)
  const level = muted ? 0 : volume

  const hold = () => {
    if (closing.current) clearTimeout(closing.current)
    setOpen(true)
  }
  const release = () => {
    if (closing.current) clearTimeout(closing.current)
    closing.current = setTimeout(() => setOpen(false), 220)
  }
  useEffect(() => () => { if (closing.current) clearTimeout(closing.current) }, [])

  return (
    <div className="relative" onMouseEnter={hold} onMouseLeave={release}>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2">
          <div
            className="ds-build flex h-[104px] w-[42px] items-center justify-center"
            style={{ background: "rgba(4,10,12,0.92)", clipPath: PLATE, boxShadow: "inset 0 0 0 1px rgba(215,216,217,0.14)" }}
          >
            {/* ⚠️ Rotated rather than a bespoke vertical control: a range input
                keeps the keyboard and the pointer behaviour the platform
                already implements correctly, which a div with a drag handler
                would have to reinvent badly, and only for the mouse. */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={level}
              aria-label="Volume"
              onChange={(e) => onVolume(Number(e.target.value))}
              className="clip-volume"
            />
          </div>
        </div>
      )}

      <Plate delay={delay} label={muted ? "Unmute" : "Mute"} on={muted} onClick={onMute}>
        <svg width="18" height="16" viewBox="0 0 20 16" aria-hidden>
          <path d="M1 5.5 h3.5 L9 1.5 v13 L4.5 10.5 H1 Z" fill="currentColor" />
          {muted ? (
            <path d="M12.5 5 L17.5 11 M17.5 5 L12.5 11" stroke="currentColor" strokeWidth="1.6" fill="none" />
          ) : (
            <>
              <path d="M12 5.6 a3.4 3.4 0 0 1 0 4.8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={level > 0.1 ? 1 : 0.25} />
              <path d="M14.6 3.4 a6.8 6.8 0 0 1 0 9.2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={level > 0.55 ? 1 : 0.25} />
            </>
          )}
        </svg>
      </Plate>
    </div>
  )
}

/* ── the rest ────────────────────────────────────────────────────────────── */

/**
 * The one control before anything has been pressed.
 *
 * ⚠️ Not a circle with a triangle in it. Every other surface in this app is
 * built from cut corners and straight lines, and a soft round button was the
 * one shape from a different set — it read as a placeholder because that is
 * what it looked like. This is a plate with the same cut, standing inside its
 * own corner brackets, and it says what it will do.
 */
function BigPlay({ onClick, at }: { onClick: () => void; at: number }) {
  const started = at > 0.6
  return (
    <button type="button" onClick={onClick} aria-label="Play" className="absolute inset-0 z-20 grid place-items-center">
      <span className="relative grid place-items-center" style={{ width: 132, height: 132 }}>
        {/* corner brackets, which pull outwards on hover */}
        {[
          { x: 0, y: 0, d: "M0 22 V0 H22" },
          { x: 1, y: 0, d: "M0 0 H22 V22" },
          { x: 0, y: 1, d: "M0 0 V22 H22" },
          { x: 1, y: 1, d: "M22 0 V22 H0" },
        ].map((c, i) => (
          <svg
            key={i}
            width="22"
            height="22"
            viewBox="0 0 22 22"
            aria-hidden
            className="absolute transition-all duration-300 group-hover:opacity-100"
            style={{
              [c.x ? "right" : "left"]: 0,
              [c.y ? "bottom" : "top"]: 0,
              opacity: 0.5,
            }}
          >
            <path d={c.d} fill="none" stroke="#00d992" strokeWidth="1.4" />
          </svg>
        ))}

        <span
          className="ds-build grid place-items-center transition-transform duration-200 hover:scale-105"
          style={{
            width: 84,
            height: 84,
            clipPath: PLATE,
            background: "rgba(4,10,12,0.7)",
            boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.5), 0 0 34px rgba(0,217,146,0.16)",
            backdropFilter: "blur(6px)",
          }}
        >
          <svg width="24" height="27" viewBox="0 0 24 27" aria-hidden>
            <path d="M3 1 L23 13.5 L3 26 Z" fill="#00d992" />
          </svg>
        </span>

        <span className="absolute -bottom-1 font-jetbrains text-[9px] uppercase tracking-[0.34em] text-jade/60">
          {started ? "resume" : "play"}
        </span>
      </span>
    </button>
  )
}

/** While drawing, what the pointer is for and how to stop. */
function DrawBanner({ onClear, onDone, count }: { onClear: () => void; onDone: () => void; count: number }) {
  return (
    <div className="pointer-events-auto absolute right-5 top-5 z-20 flex items-center gap-2 px-3 py-2"
      style={{ background: "rgba(4,10,12,0.9)", boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.35)" }}>
      <span className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-jade">drawing</span>
      <Minimal label="clear" title="Wipe the frame" onClick={onClear} on={false} />
      <Minimal label="done" title="Stop drawing and wipe" onClick={onDone} on={count > 0} />
    </div>
  )
}

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
