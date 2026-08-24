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
  inline,
}: {
  rec: Recording
  /** Open here, in milliseconds — a kill clicked in the recap. */
  startAt?: number
  patch: string
  onClose: () => void
  /**
   * Render in place rather than over the window.
   *
   * ⚠️ The difference is the PORTAL, not the styling. Over the window this has
   * to escape its ancestors to be positioned against the viewport; inside a
   * page it must not, or it would tear itself out of the layout it was put in.
   */
  inline?: boolean
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
      // Slower than the interface's own 170ms: this is a whole screen moving,
      // and a large object that travels at the speed of a small one looks
      // weightless. Ease-out with no overshoot — nothing in this language
      // bounces.
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
  const frame = (
    <div
      ref={panel}
      onMouseMove={wake}
      className={
        inline
          ? "clip-player relative w-full overflow-hidden bg-black"
          : "clip-player fixed bottom-0 left-[196px] right-0 top-11 z-50 overflow-hidden bg-black"
      }
      /* ⚠️ The cursor belongs to the MODE, not to the canvas.
         Set on the canvas alone it changed back to an arrow over every control
         that overlapped it — which, with the strip across the bottom, was most
         of the lower third — so it flickered as the pointer crossed edges that
         were invisible. Drawing is a mode: the pointer means one thing until
         the mode ends. */
      style={{
        ...(drawing ? { cursor: "crosshair" } : null),
        // Inline it has no fixed edges to stretch to, so the shape is stated.
        ...(inline ? { aspectRatio: `${rec.width || 16} / ${rec.height || 9}` } : null),
      }}
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
                : "Keep this one — the size limit stops counting it, so it is never discarded"
            }
            on={rec.kept}
            onClick={() => void window.desktop.keepRecording(rec.id, !rec.kept)}
          />
          <Minimal label="file" title="Show the file on disk" onClick={() => void window.desktop.revealRecording(rec.id)} />
          </>
          )}
          {!inline && (
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
          )}
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
          /**
           * ⚠️ Weighted UP the strip, not just at its foot.
           *
           * The controls sit at the TOP of this band, which under a plain
           * two-stop gradient is its most transparent part — so the one row
           * that had to stay readable was standing in the thinnest scrim there
           * was. Four stops put real cover where the buttons are and still let
           * it reach nothing at the top edge.
           */
          background:
            "linear-gradient(to top, rgba(1,11,13,0.95) 0%, rgba(1,11,13,0.86) 38%, rgba(1,11,13,0.5) 66%, rgba(1,11,13,0) 100%)",
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

        <div className="mt-1.5 flex items-center gap-3" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
          <Clock at={at} total={total} />
          {seeking && (
            <span className="font-jetbrains text-[9px] tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.45)" }}>
              seeking
            </span>
          )}
          {/* The system micro-label, in wide-tracked monospace with a morse run
              leading into it. DS2 marks every component this way — it is the
              cheapest and most recognisable thing in its whole vocabulary. */}
          <span className="ml-auto flex items-center gap-2 font-jetbrains text-[8.5px] tracking-[0.26em]" style={{ color: "rgba(255,255,255,0.28)" }}>
            <i aria-hidden className="flex items-center gap-[3px]">
              <b className="block h-[2px] w-[2px] bg-white/40" />
              <b className="block h-[2px] w-[7px] bg-white/25" />
              <b className="block h-[2px] w-[2px] bg-white/40" />
            </i>
            dbl-click fullscreen · ↑↓ moments · d draws
          </span>
        </div>
      </div>
    </div>
  )

  return inline ? frame : createPortal(frame, document.body)
}


/* ── the controls ────────────────────────────────────────────────────────── */

/**
 * Built from measurements off Death Stranding 2 rather than from memory of it,
 * and the headline finding reversed the plan: the boxy, bracketed look is
 * Death Stranding ONE. DS2 deleted it.
 *
 * What DS2 actually does, and what is copied here:
 *
 * - **Icons are bare.** No plate behind a glyph, anywhere in its interface
 *   except the controller face buttons. Focus is a thin ring, not a fill.
 * - **Nothing is rounded** — every radius in this file is zero. DS2's one
 *   exception is a rounded corner on the SELECTED card, which is why the
 *   focused thing here is the only thing allowed to round.
 * - **A press is a spike in LUMINANCE.** The whole interface composites
 *   additively, so it answers with light. Nothing in DS2 scales, bounces or
 *   ripples, and anything that does belongs to a different game.
 * - **The light-ribbon** — a luminous streak travelling across the thing being
 *   pointed at — is its single most recognisable device. It builds the row on
 *   arrival, and it answers a press.
 *
 * The one thing deliberately NOT copied is the colour. DS2 is blue into cyan
 * and dropped Death Stranding 1's amber entirely; this app is jade, and jade
 * plays exactly the role DS2 gives its cyan. Borrowing the hue as well would
 * make one screen of a jade application belong to something else.
 */

/** Fully white, or 45% — DS2 has no middle tier of grey text. */
const DIM = "rgba(255,255,255,0.45)"
const JADE = "#00d992"

/**
 * The five controls, as bare glyphs.
 *
 * ⚠️ Remounted whenever the interface returns, which is what replays the
 * arrival: each icon slides a few pixels and fades, staggered, while a ribbon
 * travels across the row and leaves them behind it.
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
    <div className="relative mb-4 flex items-center justify-center gap-1">
      <Glyph delay={140} label={drawing ? "Stop drawing" : "Draw on the frame"} on={drawing} onClick={onDraw}>
        <path d="M3 21 L4 16 L16.5 3.5 L20.5 7.5 L8 20 Z" />
        <path d="M15 5 L19 9" />
      </Glyph>

      <Volume delay={70} muted={muted} volume={volume} onMute={onMute} onVolume={onVolume} />

      <Glyph delay={0} big label={playing ? "Pause" : "Play"} onClick={onToggle}>
        {playing ? (
          <path d="M7 4 h3.4 v16 h-3.4 z M13.6 4 h3.4 v16 h-3.4 z" fill="currentColor" stroke="none" />
        ) : (
          <path d="M6 3.5 L20 12 L6 20.5 Z" fill="currentColor" stroke="none" />
        )}
      </Glyph>

      <Glyph delay={70} label="Next moment" disabled={!hasNext} onClick={onNext}>
        <path d="M4 4 L15 12 L4 20 Z" fill="currentColor" stroke="none" />
        <path d="M17.5 4 h3 v16 h-3 z" fill="currentColor" stroke="none" />
      </Glyph>

      <Glyph delay={140} label={full ? "Leave fullscreen" : "Fullscreen"} on={full} onClick={onFullscreen}>
        {full ? (
          <path d="M9 3 v6 h-6 M15 21 v-6 h6" />
        ) : (
          <path d="M3 9 v-6 h6 M21 15 v6 h-6" />
        )}
      </Glyph>
    </div>
  )
}

/**
 * One control: a line icon with nothing behind it.
 *
 * ⚠️ The hit area is far larger than the drawn glyph, which is the only reason
 * bare icons are usable at all — without it every press becomes an aiming
 * exercise at a 20px target.
 *
 * ⚠️ The press is a flash, re-armed each time by remounting the animation. A
 * class that is merely toggled on plays once and then sits there inert, so the
 * second press does nothing and the control feels broken from then on.
 */
function Glyph({
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
  const [hit, setHit] = useState(0)
  const size = big ? 30 : 21

  return (
    <button
      key={hit}
      type="button"
      onClick={() => {
        setHit((n) => n + 1)
        onClick()
      }}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="clip-arrive group relative grid shrink-0 place-items-center disabled:pointer-events-none disabled:opacity-20"
      style={{ width: big ? 66 : 52, height: 52, animationDelay: `${delay}ms`, cursor: "pointer" }}
    >
      {/**
        * ⚠️ Ground, not a container.
        *
        * A white line icon over a bright frame is nearly invisible, and the
        * obvious fix — a plate behind it — is the thing this design took OUT.
        * So the glyph gets DARKNESS instead of a surface: a radial fade with no
        * edge anywhere, which reads as the picture being quieter here rather
        * than as a box sitting on it. Death Stranding's icons are bare because
        * they sit on dark ground; over a video that ground has to be made.
        */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(closest-side, rgba(1,11,13,0.72) 0%, rgba(1,11,13,0.5) 48%, rgba(1,11,13,0) 100%)",
        }}
      />
      <span className={hit ? "clip-spike" : undefined} style={{ display: "grid", placeItems: "center" }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth={big ? 1.7 : 1.6}
          strokeLinecap="square"
          strokeLinejoin="miter"
          style={{
            color: on ? JADE : "#ffffff",
            opacity: on ? 1 : 0.82,
            /**
             * ⚠️ A WHITE glyph gets a DARK shadow. It had a white bloom, which
             * on a dark frame looked like light and on a bright one — a
             * teamfight, a lit lane — was white spreading into white, so the
             * icon dissolved exactly when the picture was busiest.
             *
             * The lit bloom is kept only for the ON state, where the glyph is
             * jade and reads as something switched on rather than as a shape
             * that needs to be legible against anything.
             */
            filter: on
              ? `drop-shadow(0 0 8px ${JADE}bb) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`
              : "drop-shadow(0 1px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 7px rgba(0,0,0,0.75))",
            transition: "opacity 140ms linear, color 140ms linear",
          }}
          className="group-hover:!opacity-100"
        >
          {children}
        </svg>
      </span>

      {/* focus ring: thin, broken, and only on hover — DS2 rings its focused
          item rather than filling it */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[7px] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{
          boxShadow: `inset 0 0 0 1px ${JADE}66, inset 0 0 12px ${JADE}22`,
          clipPath: "polygon(0 0, 32% 0, 32% 100%, 0 100%, 0 0, 68% 0, 100% 0, 100% 100%, 68% 100%, 68% 0)",
        }}
      />
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
 * cannot survive that is one you have to approach carefully — which is not
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1">
          <div
            className="clip-arrive flex h-[110px] w-[44px] items-center justify-center"
            style={{
              background: "rgba(1,11,13,0.92)",
              // Hairline, square, and lit from the inside — never an outward glow.
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 0 14px ${JADE}1c`,
            }}
          >
            {/* ⚠️ A rotated range input rather than a bespoke vertical control:
                it keeps the keyboard and pointer behaviour the platform already
                implements correctly, which a div with a drag handler would have
                to reinvent badly, and only for the mouse. */}
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

      <Glyph delay={delay} label={muted ? "Unmute" : "Mute"} on={muted} onClick={onMute}>
        <path d="M3 9 h3.6 L12 4.2 v15.6 L6.6 15 H3 Z" fill="currentColor" stroke="none" />
        {muted ? (
          <path d="M15.5 9 L20.5 15 M20.5 9 L15.5 15" />
        ) : (
          <>
            <path d="M15.4 9.4 a3.6 3.6 0 0 1 0 5.2" opacity={level > 0.1 ? 1 : 0.25} />
            <path d="M18.2 6.6 a7.4 7.4 0 0 1 0 10.8" opacity={level > 0.55 ? 1 : 0.25} />
          </>
        )}
      </Glyph>
    </div>
  )
}

/* ── the one control before anything has been pressed ────────────────────── */

/**
 * A rhombus with a play mark in it, and nothing else.
 *
 * ⚠️ Everything else went. It had a chevron-tag silhouette, a gradient, a
 * hairline rule, a morse run, a word and a timestamp — six devices arguing on
 * one button, when a button that exists to be pressed once has one thing to
 * say. The aria-label still carries what the label used to.
 *
 * ⚠️ Drawn as SVG rather than a rotated box. A box turned 45° takes its
 * children with it, so the play mark would need counter-rotating, and an inset
 * shadow on a clipped box still follows the BOX's edges rather than the
 * diamond's — the glow would sit in the corners of a shape with no corners.
 * Two paths and a gradient are simpler than either workaround, and they stay
 * crisp at any size.
 */
function BigPlay({ onClick, at }: { onClick: () => void; at: number }) {
  const [hit, setHit] = useState(0)
  const started = at > 0.6

  return (
    <button
      type="button"
      onClick={() => {
        setHit((n) => n + 1)
        // Let the flash be seen before the frame starts moving under it.
        setTimeout(onClick, 90)
      }}
      aria-label={started ? `Resume at ${mmss(at)}` : "Play from the start"}
      title={started ? `Resume at ${mmss(at)}` : "Play from the start"}
      className="absolute inset-0 z-20 grid place-items-center"
      style={{ cursor: "pointer" }}
    >
      <span key={hit} className={`clip-arrive group ${hit ? "clip-spike" : ""}`}>
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden className="transition-opacity duration-150">
          <defs>
            {/* The lit rim: DS2's surfaces glow from the INSIDE EDGE inwards,
                never outwards. Transparent at the centre so the picture behind
                still reads through the button. */}
            <radialGradient id="clip-rim" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="#00d992" stopOpacity="0" />
              <stop offset="100%" stopColor="#00d992" stopOpacity="0.22" />
            </radialGradient>
          </defs>

          <path d="M66 5 L127 66 L66 127 L5 66 Z" fill="rgba(1,11,13,0.72)" />
          <path d="M66 5 L127 66 L66 127 L5 66 Z" fill="url(#clip-rim)" />
          <path
            d="M66 5 L127 66 L66 127 L5 66 Z"
            fill="none"
            stroke="#00d992"
            strokeWidth="1.5"
            className="transition-[stroke-width] duration-150 group-hover:[stroke-width:2.5]"
          />

          {/* ⚠️ Nudged right of the geometric centre. A triangle balanced on its
              bounding box reads as sitting too far left, because the eye
              centres on its mass and the mass is behind the point. */}
          <path
            d="M56 47 L88 66 L56 85 Z"
            fill="#ffffff"
            style={{ filter: "drop-shadow(0 0 9px rgba(255,255,255,0.5))" }}
          />
        </svg>
      </span>
    </button>
  )
}

/* ── the rest ────────────────────────────────────────────────────────────── */

/** While drawing, what the pointer is for and how to stop. */
function DrawBanner({ onClear, onDone, count }: { onClear: () => void; onDone: () => void; count: number }) {
  return (
    <div
      className="pointer-events-auto absolute right-5 top-5 z-20 flex items-center gap-2 px-3 py-2"
      style={{ background: "rgba(1,11,13,0.9)", boxShadow: `inset 0 0 0 1px ${JADE}55, inset 0 0 14px ${JADE}1c` }}
    >
      <span className="font-jetbrains text-[9px] uppercase tracking-[0.2em]" style={{ color: JADE }}>
        drawing
      </span>
      <Minimal label="clear" title="Wipe the frame" onClick={onClear} />
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
    className="win-btn h-7 px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em]"
    style={{ color: on ? JADE : DIM, cursor: "pointer" }}
  >
    {label}
  </button>
)

/**
 * The clock, with its leading zeros dimmed.
 *
 * ⚠️ This is DS2's most recognisable typographic habit and it costs nothing:
 * every value it prints keeps the insignificant characters — leading zeros,
 * separators, hyphens — a tier down from the digits that carry the meaning, so
 * a number reads as its magnitude first and its formatting second.
 */
export function Clock({ at, total }: { at: number; total: number }) {
  const cut = (s: string) => {
    const i = s.search(/[1-9]/)
    return i <= 0 ? ["", s] : [s.slice(0, i), s.slice(i)]
  }
  const [dead, live] = cut(mmss(at))

  return (
    <p className="font-jetbrains text-[11px] tabular-nums tracking-[0.06em]">
      <span style={{ color: "rgba(255,255,255,0.3)" }}>{dead}</span>
      <span className="text-white">{live}</span>
      <span style={{ color: "rgba(255,255,255,0.3)" }}> / {mmss(total)}</span>
    </p>
  )
}
