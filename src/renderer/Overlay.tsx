import { useEffect, useRef, useState } from "react"
import { abilityBox, type Ability, type HudNudge } from "../data/hud"
import { dragonIcon, dragonLabel, elementGlyph, elementName, soulLabel } from "./dragonIcon"
import { soulPoint, SOUL_AT, type DragonElement, type DragonTally } from "../data/objectives"

/**
 * The notification that sits over the game.
 *
 * It is on screen for a few seconds and then gone. An overlay that lives there
 * for a whole match stops being read after the first two minutes and is in the
 * way for the other thirty-eight.
 *
 * It is still a COUNTDOWN rather than an alarm — the number keeps running while
 * the card is up, so what arrives is a reading, not a klaxon. The window
 * underneath is click-through, so none of this may look interactive.
 */
type Notice = {
  kind: "dragon" | "elder"
  inSeconds: number
  raisedAt: number
  /** Null until the Rift's element is knowable — see objectives.ts. */
  element: DragonElement | null
  /** Who has taken which drakes so far. */
  tally: DragonTally
}
type HudPlacement = { scale: number; nudge: HudNudge; source: string | null }
type AppState = {
  notice: Notice | null
  levelHint: Ability | null
  hud: HudPlacement
}

const clock = (s: number) => {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
}

export default function Overlay() {
  const [notice, setNotice] = useState<Notice | null>(null)
  // Kept separate from `notice` so the card can animate OUT before it is
  // unmounted; dropping it the instant state clears would make it vanish.
  const [visible, setVisible] = useState(false)
  const [hint, setHint] = useState<Ability | null>(null)
  const [hud, setHud] = useState<HudPlacement | null>(null)

  useEffect(() => {
    const report = () =>
      window.desktop.report?.({
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio,
      })
    report()
    window.addEventListener("resize", report)
    return () => window.removeEventListener("resize", report)
  }, [])

  useEffect(() => {
    const apply = (s: AppState) => {
      if (s.notice) { setNotice(s.notice); setVisible(true) }
      else setVisible(false)
      setHint(s.levelHint ?? null)
      setHud(s.hud ?? null)
    }
    void window.desktop.getState().then(apply as never)
    return window.desktop.onState(apply as never)
  }, [])

  return (
    <div className="pointer-events-none h-full w-full bg-transparent">
      {hint && hud && <AbilityOutline ability={hint} hud={hud} />}
      {notice && <Card n={notice} visible={visible} />}
    </div>
  )
}

/**
 * The ring around the ability to level.
 *
 * Static advice: which ability comes next is the skill order we already publish
 * for this champion, known before the game began. It marks a button the player
 * is already looking at rather than telling them something about the match.
 *
 * Drawn as a frame with corner ticks rather than a filled highlight — the icon
 * underneath has to stay readable, and a wash over it would fight the art.
 */
function AbilityOutline({ ability, hud }: { ability: Ability; hud: HudPlacement }) {
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const box = abilityBox(ability, screen, hud)
  const pad = 3 // sit just outside the icon, not on top of its edge

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.left - pad,
        top: box.top - pad,
        width: box.size + pad * 2,
        height: box.size + pad * 2,
      }}
    >
      <span
        className="absolute inset-0 rounded-[3px]"
        style={{
          border: "2px solid #00d992",
          boxShadow: "0 0 14px rgba(0,217,146,0.75), inset 0 0 10px rgba(0,217,146,0.25)",
          animation: "abilityPulse 1.6s ease-in-out infinite",
        }}
      />
      {/* corner ticks, the same mark the app's panels use */}
      {[
        "top-[-3px] left-[-3px] border-t-2 border-l-2",
        "top-[-3px] right-[-3px] border-t-2 border-r-2",
        "bottom-[-3px] left-[-3px] border-b-2 border-l-2",
        "bottom-[-3px] right-[-3px] border-b-2 border-r-2",
      ].map((cls) => (
        <span key={cls} className={`absolute h-2.5 w-2.5 border-jade ${cls}`} />
      ))}
    </div>
  )
}

/**
 * One team's drakes, as four slots rather than a number.
 *
 * Four because that is the soul, so the empty slots carry the information a
 * bare count does not: how close either side is to ending the dragon game. The
 * filled ones use the element SYMBOLS — at this size a portrait is a smudge.
 *
 * Ours reads in jade, theirs in plain grey. No light outlines anywhere: the
 * slots are fills, which is also what keeps them legible over bright terrain.
 */
function TeamTally({
  label,
  taken,
  ours = false,
  accent,
}: {
  label: string
  taken: DragonElement[]
  ours?: boolean
  /** Set when THIS team is one drake from the soul; marks the slot that ends it. */
  accent?: string
}) {
  const plate = ours ? "bg-jade/[0.10]" : "bg-flash/[0.07]"
  const empty = ours ? "bg-jade/[0.05]" : "bg-flash/[0.035]"
  const decisive = accent ? taken.length : -1

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30">
        {label}
      </span>
      <span
        className={`font-chakrapetch text-[15px] font-bold leading-none tabular-nums ${
          ours ? "text-jade" : "text-flash/70"
        }`}
      >
        {taken.length}
      </span>
      <span className="ml-0.5 flex items-center gap-[3px]">
        {Array.from({ length: SOUL_AT }, (_, i) => {
          const el = taken[i]
          return el ? (
            <span key={i} className={`grid h-[19px] w-[19px] place-items-center rounded-[2px] ${plate}`}>
              <img src={elementGlyph(el)} alt={elementName(el)} title={elementName(el)} className="h-[15px] w-[15px]" />
            </span>
          ) : i === decisive ? (
            // The one that would end it. A fill and a ring, never a pale
            // outline — this has to hold up over a bright dragon pit.
            <span
              key={i}
              className="soul-pulse h-[19px] w-[19px] rounded-[2px]"
              style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}` }}
            />
          ) : (
            <span key={i} className={`h-[19px] w-[19px] rounded-[2px] ${empty}`} />
          )
        })}
      </span>
    </span>
  )
}

function Card({ n, visible }: { n: Notice; visible: boolean }) {
  const [left, setLeft] = useState(n.inSeconds)
  const base = useRef({ at: n.raisedAt, value: n.inSeconds })

  useEffect(() => {
    base.current = { at: n.raisedAt, value: n.inSeconds }
    setLeft(n.inSeconds)
  }, [n.raisedAt, n.inSeconds])

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(base.current.value - (Date.now() - base.current.at) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [])

  const elder = n.kind === "elder"

  // At three, the next drake is not one of four — it is the last one, and that
  // changes the decision rather than the description. Citrine when the enemy
  // can end it, because then the reading is "stop them", not "go get it".
  const soul = n.kind === "dragon" ? soulPoint(n.tally) : null
  const accent = elder || (soul && soul !== "ours") ? "#FFB615" : "#00d992"

  // Riot's base dragon portrait is a dark red head with a glowing mouth — all
  // but identical to the Infernal one. Drawn as-is it makes "we do not know yet"
  // look exactly like one of the six specific answers, which is worse than
  // saying nothing. Colour means the element is known; grey means it is not.
  const unknownElement = n.kind === "dragon" && !n.element

  return (
    <div
      className="absolute right-0 top-[13%] w-[440px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        // In from the right edge, out the same way. One movement, reversed.
        transform: visible ? "translateX(0)" : "translateX(105%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Feathered darkening rather than a plate: its alpha reaches zero well
          inside its own box, so there is no edge to notice over the art. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-12 -inset-y-10 blur-[10px]"
        style={{
          background:
            "radial-gradient(58% 62% at 54% 50%," +
            " rgba(4,10,12,0.90) 0%," +
            " rgba(4,10,12,0.66) 24%," +
            " rgba(4,10,12,0.36) 40%," +
            " rgba(4,10,12,0.13) 52%," +
            " rgba(4,10,12,0) 62%)",
        }}
      />

      {/* the rail, running in off the right edge */}
      <svg
        aria-hidden
        viewBox="0 0 440 12"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[12px] w-full overflow-visible"
        style={{ filter: `drop-shadow(0 0 5px ${accent}88)` }}
      >
        <path d="M 2 11 L 11 2 L 440 2" fill="none" stroke={accent} strokeWidth="1"
              vectorEffect="non-scaling-stroke" opacity="0.9" />
        <rect x="358" y="-2.5" width="9" height="9" transform="rotate(45 362.5 2)" fill={accent} />
      </svg>

      <div
        className="relative pl-5 pr-3 pt-[15px]"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.85)" }}
      >
        <div className="flex items-center gap-3.5">
          <img
            src={dragonIcon(n.kind, n.element)}
            alt=""
            // A solid portrait now, not a transparent glyph, so it takes the
            // squared corner and hairline the rest of the app uses.
            className="h-11 w-11 shrink-0 rounded-[3px] ring-1 ring-jade/25"
            style={{
              boxShadow: `0 0 14px ${accent}33, 0 2px 8px rgba(0,0,0,0.9)`,
              filter: unknownElement ? "grayscale(1) brightness(1.12) contrast(0.92)" : undefined,
            }}
          />

          <div className="min-w-0">
            <p
              className={`font-jetbrains text-[9px] uppercase tracking-[0.28em] ${soul ? "soul-pulse" : ""}`}
              style={{ color: accent }}
            >
              {soul === "ours"
                ? "soul point · yours"
                : soul === "theirs"
                  ? "soul point · enemy"
                  : soul === "both"
                    ? "soul point · contested"
                    : "lolData"}
            </p>
            <p className="whitespace-nowrap font-chakrapetch text-[19px] font-bold leading-tight text-flash">
              {soul ? soulLabel(n.element) : dragonLabel(n.kind, n.element)} is spawning in{" "}
              <span className="tabular-nums" style={{ color: accent }}>{clock(left)}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-jade/[0.14] pt-2.5">
          <span className="font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/35">
            drakes
          </span>
          <TeamTally
            label="you"
            taken={n.tally.ours}
            ours
            accent={soul === "ours" || soul === "both" ? accent : undefined}
          />
          <span aria-hidden className="h-5 w-px bg-jade/15" />
          <TeamTally
            label="enemy"
            taken={n.tally.theirs}
            accent={soul === "theirs" || soul === "both" ? accent : undefined}
          />
        </div>

      </div>
    </div>
  )
}
