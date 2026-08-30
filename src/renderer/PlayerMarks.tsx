import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { CDN, mmss, type Highlight } from "./types"
import { championByName } from "../data/champions"

/**
 * The timeline, and the marks on it.
 *
 * ⚠️ The marks are the CONTENT of this screen, not decoration on a scrub bar.
 * A recording of a twenty-five minute game is worth keeping only because the
 * eleven moments that mattered can be reached without hunting, so the thing
 * that shows where they are gets the care.
 *
 * ⚠️ Shape carries the meaning, not just colour. A kill is crossed swords, a
 * death is a golem's face, an assist is a dot. Colour agrees with the shape but
 * is never the only thing saying it — a red tick and a green tick are the same
 * tick to a red-green colourblind player, and this app has a lot of both, and
 * two triangles that differed only in which way up they were asked more of a
 * glance than a glance gives.
 *
 * The words live in the card that appears on hover. Cramming "kill" into
 * seventeen pixels produced a letter in a box, which is what a marker looks
 * like when nobody has decided what it should look like.
 */

export const KIND: Record<
  Highlight["kind"],
  { colour: string; label: string; /** Says which way it went, in a word. */ relation?: string }
> = {
  kill: { colour: "#00d992", label: "kill" },
  multi: { colour: "#FFB615", label: "multikill" },
  death: { colour: "#ff6286", label: "death", relation: "by" },
  assist: { colour: "#7f8386", label: "assist", relation: "on" },
}

/**
 * ⚠️ WHO KILLED WHOM IS ALWAYS KNOWN, and the word above is how it gets said.
 *
 * Every mark is about YOU - events you are not in are never marked - so the
 * mark names only the other player, and the kind carries the direction: a kill
 * names the victim, a death names the killer, an assist names the victim.
 *
 * That was true before this word existed and it was still unreadable, because
 * nothing SAID it: "death 6:42 Kha'Zix" can be read as Kha'Zix having died. The
 * colour and the glyph both carried the direction and neither of them is a
 * word. "death by Kha'Zix" cannot be read the wrong way round.
 */

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
/**
 * One player named on a mark, and what they were playing.
 *
 * ⚠️ An OBJECT, where this used to be a bare string. `Pin` is a projection of
 * the marks, and a projection quietly drops anything it was not told to keep -
 * so a champion added to `Highlight` reaches the file, the index and the tag
 * over the video, and then stops dead at the timeline.
 */
export type Mention = { name: string; champion?: string }

export type Pin = { at: number; kind: Highlight["kind"]; count: number; labels: Mention[] }

export function pinsFrom(marks: Highlight[]): Pin[] {
  const out: Pin[] = []
  for (const m of marks) {
    // ⚠️ Only the same KIND merges. A kill and a death in one fight are the two
    // halves of the story, and collapsing them into "4 things happened" throws
    // away which way it went.
    const open = [...out].reverse().find((p) => p.kind === m.kind)
    const said: Mention[] = m.label || m.champion ? [{ name: m.label, champion: m.champion }] : []
    if (open && m.at - open.at < CLUSTER_MS) {
      open.count++
      open.labels.push(...said)
      continue
    }
    out.push({ at: m.at, kind: m.kind, count: 1, labels: said })
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
  patch,
}: {
  at: number
  total: number
  buffered: number
  pins: Pin[]
  onSeek: (seconds: number) => void
  runup: number
  /** ⚠️ Champion art is served UNDER A PATCH - `/16.16.1/img/champion/Nami.png`.
   *  There is no unversioned copy; asking for one is a 404 that `onError` then
   *  hides, which reads as "no icon" rather than "wrong URL". */
  patch: string
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
      {over && <Wash over={over} bar={bar} total={total} patch={patch} />}

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
function Wash({
  over,
  bar,
  total,
  patch,
}: {
  over: Pin
  bar: HTMLDivElement | null
  total: number
  patch: string
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [back, setBack] = useState(false)
  /** Fits neither way, so it stands at the start of the bar instead of leaving
   *  it. Detached from its mark, which is a smaller lie than half a label. */
  const [pinned, setPinned] = useState(false)

  const x = Math.min(100, Math.max(0, (over.at / 1000 / total) * 100))
  // ⚠️ Declared BEFORE the measurement below, which depends on it: the wash
  // must not choose which way to grow while it is still a champion name short
  // of its final width.
  const names = useChampionNames(over.labels)

  useLayoutEffect(() => {
    const w = bar?.clientWidth ?? 0
    const mine = box.current?.getBoundingClientRect().width ?? 0
    if (!w || !mine) return
    const at = (x / 100) * w
    const forward = at + mine <= w
    const backward = at - mine >= 0
    setBack(!forward && backward)
    setPinned(!forward && !backward)
  }, [x, total, bar, over, names])

  const c = KIND[over.kind].colour

  return (
    <div
      ref={box}
      className="clip-arrive pointer-events-none absolute -top-[52px] z-10 flex flex-col gap-[3px] whitespace-nowrap py-1.5"
      style={{
        [back ? "right" : "left"]: pinned ? 0 : `${back ? 100 - x : x}%`,
        // The tail is the long side and always points AWAY from the mark, so it
        // still reads as growing out of it.
        paddingLeft: back ? 64 : 12,
        paddingRight: back ? 12 : 64,
        // Opaque at the leading edge, whichever edge the mark is on.
        background: `linear-gradient(${back ? 270 : 90}deg, ${c}2e 0%, ${c}14 42%, transparent 100%)`,
      }}
    >
      {/* ── WHO. The champion, at the top and at the largest size on the card.
             ⚠️ It leads because it is what gets RECOGNISED: a face is known
             before a summoner name is read, and this card is looked at for a
             moment while a video plays behind it. Everything that was on one
             line before is on two now, and the line that survived intact is
             this one. */}
      <div className="flex items-center gap-2">
        {/* WARNING: every name in the cluster. A pin that swallowed three kills
            used to print the first one and looked like a mistake: the count
            said three and the card named one. */}
        {over.labels.map((l, i) => (
          // ⚠️ A CLUSTER SHOWS CHAMPIONS ONLY. Three icons, three champions and
          // three summoner names is wider than the bar it has to sit on, and a
          // label that leaves the bar has stopped labelling anything. In a
          // teamfight the champion is the answer anyway — the count above the
          // mark already says how many.
          <Who key={i} m={l} patch={patch} names={names} terse={over.labels.length > 1} />
        ))}
        {/* Nothing to name — a turret execute, a withheld player, a recording
            made before marks carried a champion. The row below still says what
            happened and when, which is the whole card's minimum. */}
        {!over.labels.length && (
          <span className="font-chakrapetch text-[13px] font-bold text-white/45">unknown</span>
        )}
      </div>

      {/* ── WHAT, and WHEN. The mark's own sign, then the words, quieter than
             the line above so the two read in order rather than competing. */}
      <div className="flex items-center gap-1.5">
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          aria-hidden
          className="shrink-0"
          style={{ filter: `drop-shadow(0 0 4px ${c}99)` }}
        >
          {/* ⚠️ THE SAME DRAWING the mark on the bar uses, from one function.
              The label points at a mark you can see; giving it a different
              picture of the same thing would be the one place a reader has to
              work out that they match. */}
          {kindShapes(over.kind, c)}
        </svg>
        <span className="font-jetbrains text-[9px] tracking-[0.22em]" style={{ color: c }}>
          {over.count > 1 ? `${over.count} × ${KIND[over.kind].label}` : KIND[over.kind].label}
        </span>
        <span className="font-jetbrains text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>
          {mmss(over.at / 1000)}
        </span>
        {/* The direction, in a word — see KIND. Only alongside a name it can
            point at: "death by" with nobody named is a dangling preposition. */}
        {KIND[over.kind].relation && over.labels.some((l) => l.name && l.champion) && (
          <span className="font-jetbrains text-[9px] lowercase" style={{ color: "rgba(255,255,255,0.3)" }}>
            {KIND[over.kind].relation}
          </span>
        )}
        {/* ⚠️ The summoner name moved DOWN here, out of the champion's line. It
            is the least recognised thing on the card and it was sitting next to
            the most. A cluster drops it entirely — three of these is wider than
            the bar. */}
        {/* ⚠️ Only when the row above showed a CHAMPION. With no champion that
            row falls back to this very name, and printing it again here put it
            on the card twice. */}
        {over.labels.length === 1 && over.labels[0]?.champion && over.labels[0]?.name && (
          <span className="font-jetbrains text-[9px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {over.labels[0].name}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * One player on a mark: what they were playing, then who they are.
 *
 * ⚠️ The CHAMPION leads. A marker that said only "Caoskhimera" asked you to
 * remember which of ten strangers that was; the picture answers it before the
 * word is read, which is the whole reason it is here.
 *
 * ⚠️ Everything degrades one step at a time. No champion on the mark - an old
 * recording, a turret execute, a withheld player - and it is the name alone,
 * exactly as before. A champion whose display name has not resolved yet shows
 * the slug, which is the same word for all but a handful of champions. A name
 * that is empty leaves the champion standing on its own.
 */
function Who({
  m,
  patch,
  names,
  terse,
}: {
  m: Mention
  patch: string
  names: Map<string, string>
  /** The pin holds more than one player, so the row is tighter. */
  terse?: boolean
}) {
  return (
    <span className={`flex items-center gap-1.5 ${terse ? "mr-1.5" : ""}`}>
      {m.champion && (
        <img
          src={`${CDN}/${patch}/img/champion/${m.champion}.png`}
          alt=""
          className="h-[18px] w-[18px] rounded-[2px]"
          style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.55)" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
        />
      )}
      {m.champion && (
        <span className="font-chakrapetch text-[13.5px] font-bold leading-none text-white">
          {names.get(m.champion) ?? m.champion}
        </span>
      )}
      {/* ⚠️ Only when there is no champion to show instead. The summoner name
          lives on the row BELOW now — beside the kind and the time, where the
          least-recognised thing on the card belongs. It appears here only as
          the fallback for a mark that has no champion at all, so that row one
          is never empty. */}
      {!m.champion && m.name && (
        <span className="font-chakrapetch text-[13px] font-bold text-white/80">{m.name}</span>
      )}
    </span>
  )
}

/**
 * Slugs -> the names people say out loud.
 *
 * ⚠️ The mark stores the SLUG, because that is what the art is keyed on and the
 * one spelling that does not move. It is not always the name: "LeeSin" is "Lee
 * Sin" and "Kaisa" is "Kai'Sa". For most champions the two are identical, which
 * is exactly why printing the slug is a safe thing to do while this resolves,
 * and a bad thing to settle for.
 */
function useChampionNames(mentions: Mention[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const slugs = mentions.map((m) => m.champion).filter(Boolean) as string[]
  const key = slugs.join(",")

  useEffect(() => {
    let alive = true
    void Promise.all(
      slugs.map((s) =>
        championByName(s)
          .then((c) => [s, c?.name] as const)
          .catch(() => [s, undefined] as const)
      )
    ).then((pairs) => {
      if (!alive) return
      setNames(new Map(pairs.filter((p): p is readonly [string, string] => !!p[1])))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return names
}

/**
 * The shapes a mark is drawn from, without the <svg> around them.
 *
 * ⚠️ Shared with the hover label, which is the whole reason it is a function and
 * not markup inside `Mark`. The label names the same moment the mark does, and
 * two hand-copied drawings of one idea drift the first time either is touched.
 *
 * ⚠️ Authored for FOURTEEN units, centred on (7,7). Every caller must give it a
 * `viewBox="0 0 14 14"`, whatever pixel size it renders at.
 */
function kindShapes(kind: Highlight["kind"], colour: string) {
  // The most numerous thing on the bar and the least worth stopping for, so it
  // stays the quietest mark there is.
  if (kind === "assist") return <circle cx="7" cy="7" r="2.6" fill={colour} opacity="0.75" />

  if (kind === "death")
    return (
      <>
        {/* A golem's head: a heavy brow, a slot of dark, and a wide blocky jaw
            under it. The gap between the two is what makes it read as machine
            rather than bone — plates that were assembled, not a skull that
            grew. */}
        <path d="M2.5 5.5 L4.3 2.4 L9.7 2.4 L11.5 5.5 Z" fill={colour} />
        <path
          d="M3.4 6.6 L10.6 6.6 L10.6 9.6 L9 11.7 L5 11.7 L3.4 9.6 Z"
          fill="none"
          stroke={colour}
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        {/* ⚠️ The eyes are LIT, not coloured, and they are the reason this still
            reads at fourteen pixels: two bright points under a heavy brow are a
            face long before the outline around them is legible. */}
        <g style={{ filter: `drop-shadow(0 0 2.5px ${colour})` }}>
          <rect x="4.5" y="7.4" width="1.9" height="1.7" fill="#fff5f7" />
          <rect x="7.6" y="7.4" width="1.9" height="1.7" fill="#fff5f7" />
        </g>
      </>
    )

  return (
    <>
      {/* Two blades, and the crossguards that stop an X reading as a
          multiplication sign. Filled rather than outlined: at this size an
          outlined blade is two hairlines a pixel apart, which is a smudge. */}
      <path d="M11.9 1.6 L12.4 3.4 L4.6 11.9 L3.1 10.5 Z" fill={colour} />
      <path d="M2.1 1.6 L1.6 3.4 L9.4 11.9 L10.9 10.5 Z" fill={colour} opacity="0.92" />
      <path d="M2 8.2 L5.4 11.6 M12 8.2 L8.6 11.6" stroke={colour} strokeWidth="1.5" strokeLinecap="round" />
    </>
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

  // Room to click that the drawn shape does not need: the head is eight pixels
  // and the target is twenty-two, which is the difference between a bar you
  // can use and one you fight.
  /**
   * ⚠️ Drawn for FOURTEEN PIXELS, and checked at that size rather than at the
   * size it is comfortable to draw at. Everything here is authored in the
   * 14-unit box the <svg> below sets, centred on (7,7); a detail that survives
   * at 72px and dies at 14 is a detail that does not exist.
   */
  const glyph = useMemo(() => kindShapes(p.kind, colour), [p.kind, colour])



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
