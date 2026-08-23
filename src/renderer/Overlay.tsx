import { useEffect, useRef, useState } from "react"

/**
 * What sits over the game.
 *
 * The build half is static: the champion locked before the match and what we
 * already publish for it. The objective clock is derived from the public game
 * clock and kill events — it is a COUNTDOWN, shown continuously, that becomes
 * prominent as it runs out. Deliberately not a notification: Riot's prohibited
 * list names alerts that fire on game state, and a thing that appears when
 * something is about to happen is an alert however it is dressed. A number that
 * was always on screen and grew louder is a display.
 *
 * The window underneath is click-through, so none of this may look interactive.
 */
type Champion = { slug: string; key: number; name: string }
type Objective = { kind: "dragon" | "elder"; inSeconds: number; taken: number }
type AppState = {
  client: "waiting" | "attached"
  phase: string | null
  patch: string | null
  select: { champion: Champion | null; role: string | null } | null
  objective: Objective | null
}

const CDN = "https://cdn2.loldata.cc"
const LOUD_AT = 120 // seconds — where the clock stops being background

const clock = (s: number) => {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
}

export default function Overlay() {
  const [s, setS] = useState<AppState | null>(null)

  useEffect(() => {
    void window.desktop.getState().then(setS as never)
    return window.desktop.onState(setS as never)
  }, [])

  const champ = s?.select?.champion ?? null

  return (
    // Transparent everywhere except the callout: the rest of the screen is the
    // game, and the window is only a carrier.
    <div className="pointer-events-none h-full w-full bg-transparent">
      <div className="absolute right-0 top-[9%] w-[384px]">
        {/* Feathered darkening rather than a plate. Its alpha reaches zero well
            inside its own box, so there is no edge to notice over the art. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-12 -inset-y-10 blur-[10px]"
          style={{
            background:
              "radial-gradient(58% 62% at 52% 50%," +
              " rgba(4,10,12,0.86) 0%," +
              " rgba(4,10,12,0.62) 24%," +
              " rgba(4,10,12,0.34) 40%," +
              " rgba(4,10,12,0.12) 52%," +
              " rgba(4,10,12,0) 62%)",
          }}
        />

        {/* the rail, running in off the right edge */}
        <svg
          aria-hidden
          viewBox="0 0 384 12"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 h-[12px] w-full overflow-visible"
          style={{ filter: "drop-shadow(0 0 4px rgba(0,217,146,0.5))" }}
        >
          <path
            d="M 2 11 L 11 2 L 384 2"
            fill="none"
            stroke="#00d992"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            opacity="0.9"
          />
          <rect x="305" y="-2.5" width="9" height="9" transform="rotate(45 309.5 2)" fill="#00d992" />
        </svg>

        <div
          className="relative pl-5 pr-2 pt-[14px]"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.85)" }}
        >
          <div className="flex items-center gap-3">
            {champ && (
              <img
                src={`${CDN}/16.16.1/img/champion/${champ.slug}.png`}
                alt=""
                className="h-12 w-12 shrink-0 rounded-[3px] ring-1 ring-jade/30"
                style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.9))" }}
              />
            )}

            <div className="min-w-0">
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.28em] text-jade/85">
                lolData · build
              </p>
              <p className="font-chakrapetch text-[21px] font-bold leading-tight text-flash">
                {champ?.name ?? "No champion"}
              </p>
              <p className="font-jetbrains text-[10px] leading-tight text-flash/50">
                {s?.select?.role ?? "role not assigned"}
                {s?.patch ? ` · patch ${s.patch}` : ""}
              </p>
            </div>
          </div>

          {s?.objective && <ObjectiveClock o={s.objective} />}
        </div>
      </div>
    </div>
  )
}

/**
 * The countdown.
 *
 * The shell refreshes every two seconds, which would make the number jump in
 * steps. It ticks down locally between refreshes and resnaps whenever a fresh
 * reading arrives, so the seconds run smoothly without drifting away from the
 * game clock.
 */
function ObjectiveClock({ o }: { o: Objective }) {
  const [left, setLeft] = useState(o.inSeconds)
  const base = useRef({ at: Date.now(), value: o.inSeconds })

  useEffect(() => {
    base.current = { at: Date.now(), value: o.inSeconds }
    setLeft(o.inSeconds)
  }, [o.inSeconds, o.kind])

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - base.current.at) / 1000
      setLeft(base.current.value - elapsed)
    }, 250)
    return () => clearInterval(id)
  }, [])

  const up = left <= 0
  const loud = left <= LOUD_AT
  const elder = o.kind === "elder"

  // One accent decides the whole row, so the state reads before the words do.
  const accent = up ? "#ff6286" : loud ? "#FFB615" : "#00d992"

  return (
    <div className="mt-3 flex items-baseline gap-2.5 border-t border-jade/[0.14] pt-2.5">
      <span
        className="font-jetbrains text-[9px] uppercase tracking-[0.24em]"
        style={{ color: accent, opacity: loud ? 0.95 : 0.6 }}
      >
        {elder ? "elder" : "dragon"}
      </span>

      <span
        className="font-chakrapetch font-bold tabular-nums leading-none transition-all duration-500"
        style={{
          color: accent,
          fontSize: loud ? 26 : 18,
          textShadow: loud ? `0 0 16px ${accent}66, 0 1px 6px rgba(0,0,0,0.95)` : "0 1px 6px rgba(0,0,0,0.95)",
        }}
      >
        {up ? "UP" : clock(left)}
      </span>

      {o.taken > 0 && (
        <span className="ml-auto font-jetbrains text-[9px] tabular-nums text-flash/35">
          {o.taken} taken
        </span>
      )}
    </div>
  )
}
