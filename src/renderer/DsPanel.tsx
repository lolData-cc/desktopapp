import type { ReactNode } from "react"

/**
 * The frame the overlay's notification wears, made reusable for the window.
 *
 * The app had two visual languages: a considered one on the overlay — rails
 * that run in on a diagonal, a diamond where a line changes its mind, a
 * feathered ground instead of a plate — and a rounded rectangle with a faint
 * gradient everywhere else. This is the first one, brought inside.
 *
 * Three rules it keeps from the overlay, because they are what make that card
 * read as engineered rather than decorated:
 *
 *  · A line that turns is MARKED at the turn. The diamond is not ornament, it
 *    is the one place the shape does something.
 *  · Nothing is symmetrical. The top rail runs the full width and the bottom
 *    one stops short; the ticks are on one side. A mirrored frame reads as a
 *    border, which is the thing this is trying not to be.
 *  · The ground is FEATHERED, reaching zero inside its own box, so there is no
 *    plate edge — the panel sits on the page instead of on top of it.
 */
export default function DsPanel({
  children,
  accent = "#00d992",
  className = "",
  eyebrow,
}: {
  children: ReactNode
  accent?: string
  className?: string
  /** Small text riding the top rail, as the notification's does. */
  eyebrow?: string
}) {
  const dim = `${accent}44`

  return (
    <div className={`relative ${className}`}>
      {/* the ground: no edge to notice, because there is no edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-6 blur-[10px]"
        style={{
          background:
            "radial-gradient(62% 66% at 46% 50%," +
            " rgba(0,217,146,0.055) 0%," +
            " rgba(0,217,146,0.028) 34%," +
            " rgba(0,217,146,0.010) 52%," +
            " rgba(0,217,146,0) 66%)",
        }}
      />

      {/* The top rail, in two parts on purpose.
          ⚠️ A stretched viewBox with preserveAspectRatio="none" DISTORTS
          diagonals — the corner would get steeper or flatter with the width of
          the panel. So the shaped end is a fixed-size SVG that never scales,
          and the long run is a plain div. Only the straight part stretches,
          and a straight line cannot be distorted. */}
      <svg
        aria-hidden
        width="60"
        height="14"
        viewBox="0 0 60 14"
        className="absolute left-0 top-0 overflow-visible"
        style={{ filter: `drop-shadow(0 0 6px ${accent}55)` }}
      >
        <path d="M 1 13 L 12 2 L 60 2" fill="none" stroke={accent} strokeWidth="1" strokeLinejoin="round" opacity="0.75" />
        {/* Rotation on the GROUP, never on the rect: an animated transform
            replaces the attribute rather than composing with it, which is how
            this diamond became a square the first time it moved. */}
        <g transform="rotate(45 44 2)">
          <rect x="40.5" y="-1.5" width="7" height="7" fill={accent} opacity="0.9" />
        </g>
      </svg>
      <span
        aria-hidden
        className="absolute left-[60px] right-0 top-[2px] h-px"
        style={{ background: accent, opacity: 0.75, boxShadow: `0 0 6px ${accent}55` }}
      />

      {/* the bottom counter-rule: short of the corner, and asymmetric on
          purpose — a mirrored frame reads as a border */}
      <span aria-hidden className="absolute bottom-[6px] left-0 right-[26px] h-px" style={{ background: dim }} />
      <svg aria-hidden width="26" height="12" viewBox="0 0 26 12" className="absolute bottom-0 right-0 overflow-visible">
        <path d="M 0 6 L 14 12" fill="none" stroke={dim} strokeWidth="1" />
      </svg>
      <svg aria-hidden width="70" height="8" viewBox="0 0 70 8" className="absolute bottom-[6px] left-[24px]">
        <path d="M 4 8 L 4 3 M 20 8 L 20 4.5 M 36 8 L 36 5.5" stroke={dim} strokeWidth="1" fill="none" />
      </svg>

      {/* the left shoulder: a short run with its own turn */}
      <span aria-hidden className="absolute bottom-[52px] left-0 top-[18px] w-px" style={{ background: dim }} />
      <svg aria-hidden width="12" height="16" viewBox="0 0 12 16" className="absolute bottom-[38px] left-0 overflow-visible">
        <path d="M 0.5 0 L 8 14" fill="none" stroke={dim} strokeWidth="1" />
      </svg>

      {eyebrow && (
        <p
          className="absolute -top-[7px] right-4 px-2 font-jetbrains text-[8.5px] uppercase tracking-[0.28em]"
          style={{ color: accent, background: "#040a0c" }}
        >
          {eyebrow}
        </p>
      )}

      <div className="relative">{children}</div>
    </div>
  )
}
