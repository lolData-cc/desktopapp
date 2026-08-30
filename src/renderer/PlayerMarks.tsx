import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { mmss, type Highlight } from "./types"

/**
 * The timeline, and the marks on it.
 *
 * ⚠️ The marks are the CONTENT of this screen, not decoration on a scrub bar.
 * A recording of a twenty-five minute game is worth keeping only because the
 * eleven moments that mattered can be reached without hunting, so the thing
 * that shows where they are gets the care.
 *
 * ⚠️ Shape carries the meaning, not just colour. A kill points UP and is
 * filled; a death points DOWN and is hollow. Colour agrees with the shape but
 * is never the only thing saying it — a red tick and a green tick are the same
 * tick to a red-green colourblind player, and this app has a lot of both.
 *
 * The words live in the card that appears on hover. Cramming "kill" into
 * seventeen pixels produced a letter in a box, which is what a marker looks
 * like when nobody has decided what it should look like.
 */

export const KIND: Record<Highlight["kind"], { colour: string; label: string }> = {
  kill: { colour: "#00d992", label: "kill" },
  multi: { colour: "#FFB615", label: "multikill" },
  death: { colour: "#ff6286", label: "death" },
  assist: { colour: "#7f8386", label: "assist" },
}

/**
 * Marks closer together than this are ONE moment.
 *
 * A teamfight is not four things that happened; it is one thing, and four
 * marks smeared across four pixels can be neither read nor hit. The pin keeps
 * the time of the FIRST mark — a fight starts where it starts — and says how
 * many.
 */
const CLUSTER_MS = 10_000

/**
 * ⚠️ `labels` is a LIST, and that is the whole point of it.
 *
 * A pin that swallowed three kills used to carry the first one's name, so
 * hovering a triple showed a single victim and looked like a mistake — the
 * count said three and the card named one. Everyone who was in the fight is in
 * the fight.
 */
export type Pin = { at: number; kind: Highlight["kind"]; count: number; labels: string[] }

export function pinsFrom(marks: Highlight[]): Pin[] {
  const out: Pin[] = []
  for (const m of marks) {
    // ⚠️ Only the same KIND merges. A kill and a death in one fight are the two
    // halves of the story, and collapsing them into "4 things happened" throws
    // away which way it went.
    const open = [...out].reverse().find((p) => p.kind === m.kind)
    if (open && m.at - open.at < CLUSTER_MS) {
      open.count++
      if (m.label) open.labels.push(m.label)
      continue
    }
    out.push({ at: m.at, kind: m.kind, count: 1, labels: m.label ? [m.label] : [] })
  }
  return out
}

export function Timeline({
  at,
  total,
  buffered,
  pins,
  onSeek,
  runup,
}: {
  at: number
  total: number
  buffered: number
  pins: Pin[]
  onSeek: (seconds: number) => void
  runup: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [over, setOver] = useState<Pin | null>(null)
  const [bar, setBar] = useState<HTMLDivElement | null>(null)

  const fromX = (clientX: number) => {
    const box = bar?.getBoundingClientRect()
    if (!box) return 0
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * total
  }

  const pct = (ms: number) => Math.min(100, Math.max(0, (ms / 1000 / total) * 100))

  /**
   * How far each mark has to climb to be seen.
   *
   * ⚠️ Two marks from the SAME FIGHT are seconds apart, which over a
   * twenty-five minute bar is four pixels — and four pixels is one shape drawn
   * on top of another. That is not a case to design away, it is the most
   * interesting moment in the game: the fight you won three of and died in.
   *
   * So a mark that lands on top of its neighbour steps up instead, and a busy
   * fight reads as a little staircase. Measured in pixels off the real width,
   * because "close" is a fact about the screen and not about the clock — the
   * same two marks are far apart in a five-minute remake and touching in a
   * fifty-minute game.
   */
  const width = bar?.clientWidth ?? 0
  const lifts = useMemo(() => {
    const out: number[] = []
    let lastX = -Infinity
    let level = 0
    pins.forEach((p, i) => {
      const x = (p.at / 1000 / total) * width
      // ⚠️ Alternating, not a growing staircase. Stacking a third and fourth
      // step needs vertical room the bar does not have, and a mark forty pixels
      // in the air has stopped pointing at anything on the track.
      level = x - lastX < 17 ? (level === 0 ? 1 : 0) : 0
      out[i] = level
      lastX = x
    })
    return out
  }, [pins, total, width])

  return (
    <div className="relative">
      {/**
        * What the mark under the pointer actually is.
        *
        * ⚠️ A WASH, not a box. Death Stranding 2 almost never puts a label in a
        * bordered container: it lays a band of colour that is opaque at the
        * leading edge and fades to nothing across its length, and sets the text
        * on that. A box with corners here would be the one framed thing on a
        * screen that has no other frames.
        *
        * The band grows from the mark rather than being centred on it, so it
        * reads as belonging to that mark and never runs off the left end of the
        * bar at 0:12.
        */}
      {over && <Wash over={over} bar={bar} total={total} />}

      <div
        ref={setBar}
        className="relative h-[58px] cursor-pointer"
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
        {/* the track, at the very bottom so the marks have room to stand on it */}
        {/* ⚠️ 2px, and the PLAYED portion is near-white rather than the accent.
            DS2's sliders read as a bright run against a dark one; giving the
            played part the accent instead turns the bar into a progress meter
            and leaves the marks competing with it for the same colour. */}
        <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: "rgba(255,255,255,0.1)" }} />
        <span
          className="absolute bottom-0 left-0 h-[2px]"
          style={{ width: `${(buffered / total) * 100}%`, background: "rgba(255,255,255,0.18)" }}
        />
        <span
          className="absolute bottom-0 left-0 h-[2px]"
          style={{ width: `${(at / total) * 100}%`, background: "rgba(255,255,255,0.92)", boxShadow: "0 0 10px rgba(0,217,146,0.4)" }}
        />

        {pins.map((p, i) => (
          <Mark
            key={i}
            p={p}
            left={pct(p.at)}
            lift={lifts[i] ?? 0}
            live={at * 1000 >= p.at - runup && at * 1000 - p.at < 8000}
            onEnter={() => setOver(p)}
            onLeave={() => setOver(null)}
            onSeek={() => onSeek(Math.max(0, (p.at - runup) / 1000))}
          />
        ))}

        {/* ⚠️ The playhead is a square-ended WHITE BAR — the shape DS2 puts on
            every slider it has. Not a knob, not a diamond, no radius. */}
        <span
          aria-hidden
          className="absolute bottom-[-8px] h-[19px] w-[5px] -translate-x-1/2"
          style={{
            left: `${(at / total) * 100}%`,
            background: "#ffffff",
            boxShadow: "0 0 12px rgba(0,217,146,0.75), 0 0 3px 1px rgba(0,0,0,0.8)",
          }}
        />

        {hover !== null && !over && (
          <span
            className="pointer-events-none absolute -top-[9px] -translate-x-1/2 font-jetbrains text-[9px] tabular-nums text-flash/45"
            style={{ left: `${(hover / total) * 100}%` }}
          >
            {mmss(hover)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The label for the mark under the pointer.
 *
 * WARNING: a WASH, not a box. Death Stranding 2 almost never puts a label in a
 * bordered container: it lays a band of colour that is opaque at the leading
 * edge and fades to nothing across its length, and sets the text on that. A box
 * with corners here would be the one framed thing on a screen with no frames.
 *
 * WARNING: which way it grows is MEASURED, not guessed. It used to flip past a
 * fixed 62% of the bar, which knows nothing about how wide this particular
 * label is - so a cluster carrying three names sat at 60%, declined to flip,
 * and ran off the end of the bar. Its own width is the only thing that can
 * answer the question, and that is knowable only after it is laid out.
 *
 * WARNING: nothing here uses `transform`. The mirroring this replaces was a
 * `scaleX(-1)` with a second `scaleX(-1)` inside to stand the words back up,
 * and the outer one never applied - `.clip-arrive` animates `transform`, and a
 * CSS ANIMATION OVERRIDES AN INLINE STYLE. The wash stayed where it was, the
 * counter-flip fired alone, and every mark past 62% printed its label in mirror
 * writing.
 */
function Wash({ over, bar, total }: { over: Pin; bar: HTMLDivElement | null; total: number }) {
  const box = useRef<HTMLDivElement | null>(null)
  const [back, setBack] = useState(false)

  const x = Math.min(100, Math.max(0, (over.at / 1000 / total) * 100))

  useLayoutEffect(() => {
    const w = bar?.clientWidth ?? 0
    const mine = box.current?.getBoundingClientRect().width ?? 0
    if (!w || !mine) return
    const at = (x / 100) * w
    // Forward unless it would not fit - and if it fits neither way, forward,
    // because running off the END of a bar is easier to read past than running
    // off the start, where the controls are.
    setBack(at + mine > w && at - mine >= 0)
  }, [x, total, bar, over])

  const c = KIND[over.kind].colour

  return (
    <div
      ref={box}
      className="clip-arrive pointer-events-none absolute -top-[30px] z-10 flex items-baseline whitespace-nowrap py-1.5"
      style={{
        [back ? "right" : "left"]: `${back ? 100 - x : x}%`,
        // The tail is the long side and always points AWAY from the mark, so it
        // still reads as growing out of it.
        paddingLeft: back ? 64 : 12,
        paddingRight: back ? 12 : 64,
        // Opaque at the leading edge, whichever edge the mark is on.
        background: `linear-gradient(${back ? 270 : 90}deg, ${c}2e 0%, ${c}14 42%, transparent 100%)`,
      }}
    >
      <span
        className="font-jetbrains text-[9px] tracking-[0.24em]"
        style={{ color: c, filter: `drop-shadow(0 0 8px ${c}88)` }}
      >
        {over.count > 1 ? `${over.count} × ${KIND[over.kind].label}` : KIND[over.kind].label}
      </span>
      <span className="ml-2.5 font-jetbrains text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
        {mmss(over.at / 1000)}
      </span>
      {/* WARNING: every name in the cluster. A pin that swallowed three kills
          used to print the first one and looked like a mistake: the count said
          three and the card named one. */}
      {over.labels.map((l, i) => (
        <span key={i} className="ml-3 font-chakrapetch text-[12.5px] font-bold text-white">
          {l}
        </span>
      ))}
    </div>
  )
}

/**
 * One moment.
 *
 * A stem standing on the track, with a head whose shape says which way the
 * fight went: up and filled for a kill, down and hollow for a death. An assist
 * is a dot, because it is the most numerous thing on the bar and the least
 * worth stopping for. A run of them carries its count in the stem's height and
 * a numeral above.
 */
function Mark({
  p,
  left,
  lift,
  live,
  onEnter,
  onLeave,
  onSeek,
}: {
  p: Pin
  left: number
  /** Steps up out of the way of the mark before it: 0, 1 or 2. */
  lift: number
  live: boolean
  onEnter: () => void
  onLeave: () => void
  onSeek: () => void
}) {
  const { colour } = KIND[p.kind]
  const many = p.count > 1
  const assist = p.kind === "assist"
  const down = p.kind === "death"

  // Room to click that the drawn shape does not need: the head is eight pixels
  // and the target is twenty-two, which is the difference between a bar you
  // can use and one you fight.
  const glyph = useMemo(() => {
    if (assist) return <circle cx="7" cy="7" r="2.6" fill={colour} opacity="0.75" />
    if (down)
      return (
        <path d="M2 3.5 L12 3.5 L7 11.5 Z" fill="none" stroke={colour} strokeWidth="1.6" strokeLinejoin="round" />
      )
    return <path d="M7 2.5 L12 10.5 L2 10.5 Z" fill={colour} stroke={colour} strokeWidth="1.4" strokeLinejoin="round" />
  }, [assist, down, colour])

  // 22px clears a 14px glyph with room to spare, which is what "these are two
  // marks" has to look like at a glance.
  const stem = (assist ? 5 : many ? 13 : 9) + lift * 22

  return (
    <button
      type="button"
      aria-label={`${KIND[p.kind].label} at ${mmss(p.at / 1000)}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onSeek()
      }}
      className="group absolute bottom-0 flex w-[22px] -translate-x-1/2 flex-col items-center justify-end"
      style={{ left: `${left}%`, height: 58 }}
    >
      {many && (
        <span
          className="mb-[1px] font-jetbrains text-[8px] font-bold leading-none tabular-nums transition-opacity"
          style={{ color: colour, opacity: 0.9 }}
        >
          {p.count}
        </span>
      )}

      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        aria-hidden
        className="transition-transform duration-150 group-hover:-translate-y-[2px] group-hover:scale-125"
        // ⚠️ A dark shadow UNDER the coloured bloom. The glow alone is light on
        // light over a bright frame, and a jade triangle on a lit lane is the
        // same problem the white icons had.
        style={{
          filter: live
            ? `drop-shadow(0 0 7px ${colour}) drop-shadow(0 1px 2px rgba(0,0,0,0.9))`
            : `drop-shadow(0 0 3px ${colour}${assist ? "44" : "88"}) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`,
        }}
      >
        {glyph}
      </svg>

      {/* the stem, which is what makes it land ON the bar rather than float
          above it */}
      <span
        aria-hidden
        style={{
          width: 1,
          height: stem,
          background: `linear-gradient(${colour}${assist ? "55" : "cc"}, ${colour}22)`,
        }}
      />
    </button>
  )
}
