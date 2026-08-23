import { useEffect } from "react"

/**
 * VICTORY or DEFEAT, before the recap.
 *
 * The one moment in this app that is allowed to be loud. Everywhere else the
 * rule is "do not compete with the game"; here the game is over, the player is
 * sitting still, and the result is the only thing on their mind — so the word
 * arrives with the full apparatus: rails drawn from both edges, a diamond
 * landing on each, ticks, and a scanning band. Then it gets out of the way.
 *
 * ⚠️ Every animated property is transform or opacity. A sequence this dense
 * animating width or filter would be recomputing layout or re-rasterising forty
 * times a second, which is exactly what made the boot animation stutter.
 *
 * ⚠️ It calls back on a TIMER, not on animationend. Several elements finish at
 * different times and one of them being interrupted — by a reduced-motion
 * setting, by a re-render — would leave the recap never arriving. A timer that
 * always fires beats an event that usually does.
 */
export default function Verdict({
  won,
  remake,
  onDone,
}: {
  won: boolean
  remake: boolean
  onDone: () => void
}) {
  useEffect(() => {
    const id = setTimeout(onDone, 2600)
    return () => clearTimeout(id)
  }, [onDone])

  const accent = remake ? "#d7d8d9" : won ? "#00d992" : "#ff6286"
  const word = remake ? "REMAKE" : won ? "VICTORY" : "DEFEAT"

  return (
    <div className="verdict absolute inset-0 z-40 grid place-items-center overflow-hidden">
      {/* the ground, feathered as everything else in this app is */}
      <span
        aria-hidden
        className="verdict-ground pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(58% 52% at 50% 50%, ${accent}1f 0%, ${accent}0d 34%, rgba(4,10,12,0) 70%)`,
        }}
      />

      <div className="relative w-full max-w-[620px] px-8">
        {/* upper rail, drawn from the left */}
        <svg
          aria-hidden
          viewBox="0 0 620 20"
          preserveAspectRatio="none"
          className="verdict-rail-a absolute inset-x-8 top-[-26px] h-[20px] overflow-visible"
          style={{ filter: `drop-shadow(0 0 8px ${accent}66)` }}
        >
          <path d="M 0 18 L 620 18" stroke={accent} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" opacity="0.8" />
          <path d="M 0 18 L 0 8 M 40 18 L 40 12 M 80 18 L 80 14" stroke={accent} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" opacity="0.45" />
        </svg>

        {/* lower rail, drawn from the right — never a mirror of the upper one */}
        <svg
          aria-hidden
          viewBox="0 0 620 20"
          preserveAspectRatio="none"
          className="verdict-rail-b absolute inset-x-8 bottom-[-26px] h-[20px] overflow-visible"
          style={{ filter: `drop-shadow(0 0 8px ${accent}66)` }}
        >
          <path d="M 0 2 L 620 2" stroke={accent} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" opacity="0.8" />
          <path d="M 620 2 L 620 12 M 580 2 L 580 8 M 540 2 L 540 6" stroke={accent} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" opacity="0.45" />
        </svg>

        {/* the marks that land on the rails */}
        <span className="verdict-mark absolute left-6 top-[-32px] h-[9px] w-[9px] rotate-45" style={{ background: accent }} />
        <span className="verdict-mark absolute right-6 bottom-[-32px] h-[9px] w-[9px] rotate-45" style={{ background: accent, animationDelay: "260ms" }} />

        <p className="verdict-eyebrow text-center font-jetbrains text-[10px] uppercase tracking-[0.42em]" style={{ color: accent }}>
          {remake ? "no result" : won ? "the rift is yours" : "the rift is theirs"}
        </p>

        {/* The word, wiped in rather than faded: a clip is a compositor
            operation and reads as something being revealed, where a fade reads
            as something being switched on. */}
        <h1
          className="verdict-word mt-2 text-center font-chakrapetch font-bold leading-none tracking-tight"
          style={{ color: accent, fontSize: 88, textShadow: `0 0 42px ${accent}55` }}
        >
          {word}
        </h1>

        {/* one band passing across the word */}
        <span
          aria-hidden
          className="verdict-scan pointer-events-none absolute inset-x-0 top-[38%] h-[64px]"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}22, transparent)` }}
        />
      </div>
    </div>
  )
}
