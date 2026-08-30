"use client"

/**
 * The site's toast.
 *
 * Rebuilt in the language the desktop overlay uses: Death Stranding's interface
 * does not fade things in or flicker them, it BUILDS them. A rail draws itself,
 * a marker snaps onto it, the title uncovers left to right, and the rest
 * arrives after. Every step is short — the whole assembly is under 500ms,
 * because a notification that takes a second to appear has spent a third of its
 * life arriving.
 *
 * What went, and why: scanlines, a sweeping scan beam, a glitch flicker on the
 * title, four bracket corners and a column of decorative dashes. That is arcade
 * cyberpunk — busy on purpose. Death Stranding is the opposite: thin, precise,
 * mostly empty. Nine decorations competing for attention is not a style, it is
 * noise, and none of them said anything about the message.
 *
 * The progress line now tracks the REAL dismiss duration. It was hardcoded to
 * 3s while callers pass anything from 2s to 8s, so it had been lying about how
 * long you had to read.
 */
type CyberToastAction = {
  label: string
  onClick: () => void
}

type CyberToastProps = {
  title: string
  description?: string
  tag?: string
  variant?: "status" | "error"
  action?: CyberToastAction
  onDismiss?: () => void
  /** Milliseconds the toast will actually live, so the line can be honest. */
  duration?: number
}

export function CyberToast({
  title,
  description,
  tag = "SYS",
  variant = "status",
  action,
  onDismiss,
  duration = 3000,
}: CyberToastProps) {
  const error = variant === "error"
  const ac = error ? "#ff6286" : "#00d992"

  return (
    <div className="ctd-in relative w-[340px] select-none pb-3">
      {/* A RAISED surface, not a darkened one.
          The overlay version feathers dark into the game behind it, which works
          because the game is bright. On the site the page is already #040A0C,
          so darkening it separated nothing — the toast and the background were
          the same colour, which is exactly how it read. Lifted a few points
          instead, with a jade hairline and a real shadow underneath: no pale
          border anywhere, which the design system rules out. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[3px]"
        style={{
          background: "linear-gradient(180deg, #0d181b 0%, #091214 100%)",
          boxShadow:
            `inset 0 0 0 1px ${ac}22, 0 1px 0 0 rgba(255,255,255,0.02) inset,` +
            " 0 12px 28px -8px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.6)",
        }}
      />

      {/* The rail, drawing itself in from the left. pathLength=1 keeps the draw
          in fractions rather than in the user units of a stretched viewBox. */}
      <svg
        aria-hidden
        viewBox="0 0 340 10"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[10px] w-full overflow-visible"
        style={{ filter: `drop-shadow(0 0 5px ${ac}66)` }}
      >
        <path
          className="ctd-rail"
          d="M 0 2 L 329 2 L 338 9"
          fill="none"
          stroke={ac}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity="0.9"
          pathLength={1}
          strokeDasharray={1}
        />
        {/* Rotation on the group, scale on the rect — an animated transform
            REPLACES an SVG transform attribute rather than composing with it,
            which is how a diamond quietly becomes a square. */}
        <g transform="rotate(45 16 2)">
          <rect className="ctd-mark" x="12" y="-2" width="8" height="8" fill={ac} />
        </g>
      </svg>

      <div className="relative pl-6 pr-4 pt-[14px]">
        <div className="ctd-tag flex items-center gap-2.5">
          <span
            className="font-jetbrains text-[9px] uppercase leading-none tracking-[0.28em]"
            style={{ color: ac }}
          >
            {tag}
          </span>
          <span
            aria-hidden
            className="h-px flex-1"
            style={{ background: `linear-gradient(90deg, ${ac}33, transparent)` }}
          />
        </div>

        <p
          className="ctd-title mt-2 font-chakrapetch text-[15px] font-bold leading-tight text-flash"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
        >
          {title}
        </p>

        {description && (
          <p className="ctd-body mt-1.5 font-chakrapetch text-[12px] leading-relaxed text-flash/45">
            {description}
          </p>
        )}

        {(action || onDismiss) && (
          <div className="ctd-body mt-3 flex items-center gap-2 pb-1">
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className="ctd-btn relative overflow-hidden rounded-[2px] px-3 py-1 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: ac, background: `${ac}1a`, boxShadow: `inset 2px 0 0 0 ${ac}` }}
              >
                {action.label}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-[2px] px-2.5 py-1 font-jetbrains text-[10px] uppercase tracking-[0.14em] text-flash/30 transition-colors hover:text-flash/60"
              >
                dismiss
              </button>
            )}
          </div>
        )}

        {/* The time you have left, drawn as the thing it is. Runs for the real
            duration rather than a fixed three seconds. */}
        <span
          aria-hidden
          className="ctd-timer absolute bottom-0 left-6 right-4 h-px origin-left"
          style={{ background: `linear-gradient(90deg, ${ac}, ${ac}22)`, animationDuration: `${duration}ms` }}
        />
      </div>

      <style>{`
        /* The card arrives from slightly above and settles. One movement. */
        @keyframes ctd-arrive {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes ctd-draw   { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes ctd-snap {
          0%   { opacity: 0; transform: scale(0.3); }
          65%  { opacity: 1; transform: scale(1.18); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ctd-wipe   { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 -2% 0 0); } }
        @keyframes ctd-lift   { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes ctd-timer  { from { transform: scaleX(1); } to { transform: scaleX(0); } }

        .ctd-in    { animation: ctd-arrive 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ctd-rail  { animation: ctd-draw 340ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ctd-mark  { animation: ctd-snap 260ms cubic-bezier(0.34, 1.56, 0.64, 1) 170ms both;
                     transform-box: fill-box; transform-origin: center; }
        .ctd-tag   { animation: ctd-lift 220ms cubic-bezier(0.16, 1, 0.3, 1) 150ms both; }
        .ctd-title { animation: ctd-wipe 300ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both; }
        .ctd-body  { animation: ctd-lift 240ms cubic-bezier(0.16, 1, 0.3, 1) 290ms both; }
        .ctd-timer { animation-name: ctd-timer; animation-timing-function: linear;
                     animation-fill-mode: both; animation-delay: 340ms; }

        .ctd-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
          transition: transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ctd-btn:hover::after { transform: translateX(100%); }

        @media (prefers-reduced-motion: reduce) {
          .ctd-in, .ctd-rail, .ctd-mark, .ctd-tag, .ctd-title, .ctd-body { animation: none; }
          .ctd-btn::after { display: none; }
        }
      `}</style>
    </div>
  )
}
