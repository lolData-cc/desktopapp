/**
 * Cyber detailing for an otherwise empty page.
 *
 * ⚠️ This replaces a champion point-field that was tried and dropped. That one
 * failed for a reason worth keeping: a background carrying a RECOGNISABLE
 * SUBJECT competes with the content, and loses either way — legible enough to
 * read is legible enough to distract, and too faint to read is just mess. So
 * this has no subject. It is rule, tick and corner: the vocabulary the rest of
 * the app already speaks, at an opacity that survives being looked past.
 *
 * Static SVG and two very slow CSS animations, deliberately. The thing it
 * replaces ran a requestAnimationFrame loop for decoration behind a game.
 * Nothing here costs a frame.
 */
export default function CyberBackdrop() {
  const line = "rgba(0,217,146,0.10)"
  const faint = "rgba(0,217,146,0.055)"

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* the measured grid: wide cells, so it reads as a coordinate space
          rather than as graph paper */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="cb-grid" width="112" height="112" patternUnits="userSpaceOnUse">
            <path d="M112 0 L0 0 0 112" fill="none" stroke={faint} strokeWidth="1" />
          </pattern>
          {/* the fade: full at the edges, gone through the middle where the
              reading happens */}
          <radialGradient id="cb-clear" cx="42%" cy="46%" r="62%">
            <stop offset="0%" stopColor="#000" stopOpacity="1" />
            <stop offset="58%" stopColor="#000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <mask id="cb-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect width="100%" height="100%" fill="url(#cb-clear)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#cb-grid)" mask="url(#cb-mask)" />
      </svg>

      {/* right-hand rail with ticks — the app's own shoulder language, stood on
          its end */}
      <svg className="absolute right-0 top-0 h-full w-[46px]" viewBox="0 0 46 800" preserveAspectRatio="none">
        <path d="M30 40 L30 760" stroke={line} strokeWidth="1" fill="none" />
        {Array.from({ length: 13 }, (_, i) => (
          <path
            key={i}
            d={`M${i % 4 === 0 ? 20 : 25} ${70 + i * 55} L30 ${70 + i * 55}`}
            stroke={i % 4 === 0 ? line : faint}
            strokeWidth="1"
            fill="none"
          />
        ))}
        <rect x="27" y="37" width="6" height="6" fill={line} transform="rotate(45 30 40)" />
      </svg>

      {/* corner brackets, bottom-right only: two would frame the page and this
          is not a frame, it is a corner that happens to be finished */}
      <svg className="absolute bottom-0 right-0 h-[120px] w-[160px]" viewBox="0 0 160 120">
        <path d="M160 46 L118 46 L96 68 L96 120" fill="none" stroke={line} strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M160 56 L124 56" fill="none" stroke={faint} strokeWidth="1" />
        <path d="M132 56 L132 62 M140 56 L140 60" fill="none" stroke={faint} strokeWidth="1" />
      </svg>

      {/* a long diagonal, low left — the one gesture that is not orthogonal, so
          the whole thing does not read as a table */}
      <svg className="absolute bottom-0 left-0 h-[240px] w-[300px]" viewBox="0 0 300 240">
        <path d="M-10 240 L120 110 L300 110" fill="none" stroke={faint} strokeWidth="1" strokeLinejoin="round" />
        <circle cx="120" cy="110" r="2.5" fill="none" stroke={line} strokeWidth="1" />
      </svg>

      {/* one slow pass, top to bottom. Long enough that you never catch it
          starting, which is the difference between atmosphere and a loop. */}
      <span
        className="cb-scan absolute inset-x-0 h-[160px]"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,217,146,0) 0%, rgba(0,217,146,0.028) 55%, rgba(0,217,146,0) 100%)",
        }}
      />
    </div>
  )
}
