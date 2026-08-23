import { useEffect, useRef, useState } from "react"

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
type Spell = { name: string; icon: string }
type Notice = {
  kind: "dragon" | "elder"
  inSeconds: number
  raisedAt: number
  spells: Spell[]
}
type AppState = { notice: Notice | null }

const DRAGON_ICON = "/img/dragon.png"

const clock = (s: number) => {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
}

export default function Overlay() {
  const [notice, setNotice] = useState<Notice | null>(null)
  // Kept separate from `notice` so the card can animate OUT before it is
  // unmounted; dropping it the instant state clears would make it vanish.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const apply = (s: AppState) => {
      if (s.notice) { setNotice(s.notice); setVisible(true) }
      else setVisible(false)
    }
    void window.desktop.getState().then(apply as never)
    return window.desktop.onState(apply as never)
  }, [])

  return (
    <div className="pointer-events-none h-full w-full bg-transparent">
      {notice && <Card n={notice} visible={visible} />}
    </div>
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
  const accent = elder ? "#FFB615" : "#00d992"

  return (
    <div
      className="absolute right-0 top-[13%] w-[400px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
        viewBox="0 0 400 12"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[12px] w-full overflow-visible"
        style={{ filter: `drop-shadow(0 0 5px ${accent}88)` }}
      >
        <path d="M 2 11 L 11 2 L 400 2" fill="none" stroke={accent} strokeWidth="1"
              vectorEffect="non-scaling-stroke" opacity="0.9" />
        <rect x="318" y="-2.5" width="9" height="9" transform="rotate(45 322.5 2)" fill={accent} />
      </svg>

      <div
        className="relative pl-5 pr-3 pt-[15px]"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.85)" }}
      >
        <div className="flex items-center gap-3.5">
          <img
            src={DRAGON_ICON}
            alt=""
            className="h-11 w-11 shrink-0"
            style={{ filter: `drop-shadow(0 0 10px ${accent}55) drop-shadow(0 2px 6px rgba(0,0,0,0.9))` }}
          />

          <div className="min-w-0">
            <p className="font-jetbrains text-[9px] uppercase tracking-[0.28em]" style={{ color: accent }}>
              lolData
            </p>
            <p className="font-chakrapetch text-[19px] font-bold leading-tight text-flash">
              {elder ? "Elder" : "Drake"} is spawning in{" "}
              <span className="tabular-nums" style={{ color: accent }}>{clock(left)}</span>
            </p>
          </div>
        </div>

        {n.spells.length > 0 && (
          <div className="mt-3 flex items-center gap-2.5 border-t border-jade/[0.14] pt-2.5">
            <span className="font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/35">
              your spells
            </span>
            {n.spells.map((sp) => (
              <span key={sp.name} className="flex items-center gap-1.5">
                <img
                  src={sp.icon}
                  alt=""
                  className="h-7 w-7 rounded-[3px] ring-1 ring-flash/15"
                  style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.9))" }}
                />
                <span className="font-chakrapetch text-[12px] font-semibold text-flash/70">
                  {sp.name}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
