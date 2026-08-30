import { cn } from "@/lib/utils"

const COLOR_MAP = {
  jade: {
    border: "border-jade/40",
    hoverBorder: "group-hover:border-jade/80",
    hoverBg: "group-hover:bg-jade/10",
    hoverShadow: "group-hover:shadow-[0_0_18px_rgba(0,217,146,0.35),inset_0_0_8px_rgba(0,217,146,0.08)]",
    shadow: "shadow-[0_0_8px_rgba(0,217,146,0.15)]",
    scanline: "rgba(0,217,146,0.5)",
    icon: "text-jade",
    label: "text-jade/50",
  },
  citrine: {
    border: "border-citrine/40",
    hoverBorder: "group-hover:border-citrine/80",
    hoverBg: "group-hover:bg-citrine/10",
    hoverShadow: "group-hover:shadow-[0_0_18px_rgba(255,182,21,0.35),inset_0_0_8px_rgba(255,182,21,0.08)]",
    shadow: "shadow-[0_0_8px_rgba(255,182,21,0.15)]",
    scanline: "rgba(255,182,21,0.5)",
    icon: "text-citrine",
    label: "text-citrine/50",
  },
  red: {
    border: "border-[#c93232]/40",
    hoverBorder: "group-hover:border-[#c93232]/80",
    hoverBg: "group-hover:bg-[#c93232]/10",
    hoverShadow: "group-hover:shadow-[0_0_18px_rgba(201,50,50,0.35),inset_0_0_8px_rgba(201,50,50,0.08)]",
    shadow: "shadow-[0_0_8px_rgba(201,50,50,0.15)]",
    scanline: "rgba(201,50,50,0.5)",
    icon: "text-[#c93232]",
    label: "text-[#c93232]/50",
  },
  // Light blue — used by the lobby-verify FAB. Pulled from the cyber
  // palette so it harmonises with jade/citrine without competing.
  blue: {
    border: "border-[#5bb8ff]/40",
    hoverBorder: "group-hover:border-[#5bb8ff]/80",
    hoverBg: "group-hover:bg-[#5bb8ff]/10",
    hoverShadow: "group-hover:shadow-[0_0_18px_rgba(91,184,255,0.35),inset_0_0_8px_rgba(91,184,255,0.08)]",
    shadow: "shadow-[0_0_8px_rgba(91,184,255,0.18)]",
    scanline: "rgba(91,184,255,0.5)",
    icon: "text-[#5bb8ff]",
    label: "text-[#5bb8ff]/55",
  },
} as const

export type DiamondColor = keyof typeof COLOR_MAP

const ICON_MAP = {
  back: (
    <svg viewBox="0 0 10 10" className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-translate-x-[2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="7,1 3,5 7,9" />
    </svg>
  ),
  top: (
    <svg viewBox="0 0 10 6" className="w-3 h-3 transition-transform duration-300 group-hover:-translate-y-[2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,5 5,1 9,5" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
      <path d="M9.5 3.5l3 3" />
    </svg>
  ),
  upvote: (
    <svg viewBox="0 0 16 16" className="w-4 h-4 transition-transform duration-300 group-hover:-translate-y-[1px] group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14h-.5a1.5 1.5 0 01-1.5-1.5v-3A1.5 1.5 0 014.5 8H5" />
      <path d="M5 14V8l1.5-4.5a1 1 0 011-.7h.2a1 1 0 011 1.2L8 6h3.5a1.5 1.5 0 011.4 2l-1.2 5a1.5 1.5 0 01-1.4 1H5z" />
    </svg>
  ),
} as const

export type DiamondIcon = keyof typeof ICON_MAP

interface DiamondButtonProps {
  color?: DiamondColor
  icon?: DiamondIcon | React.ReactNode
  label?: string
  onClick?: () => void
  className?: string
  "aria-label"?: string
}

export function DiamondButton({
  color = "jade",
  icon = "back",
  label,
  onClick,
  className,
  "aria-label": ariaLabel,
}: DiamondButtonProps) {
  const c = COLOR_MAP[color]
  const iconContent = typeof icon === "string" ? ICON_MAP[icon as DiamondIcon] : icon

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        onClick={onClick}
        className="group relative w-10 h-10 cursor-pointer"
      >
        <span className={cn(
          "absolute inset-0 rotate-45 rounded-[4px] border transition-all duration-300",
          "bg-black/60",
          c.border, c.hoverBorder, c.hoverBg, c.hoverShadow, c.shadow,
        )}>
          <span
            className="absolute inset-0 rounded-[3px] opacity-20 group-hover:opacity-30 transition-opacity duration-300"
            style={{ background: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${c.scanline} 3px, ${c.scanline} 4px)` }}
          />
        </span>
        <span className={cn("absolute inset-0 flex items-center justify-center", c.icon)}>
          {iconContent}
        </span>
      </button>
      {label && (
        <span className={cn("font-mono text-[8px] tracking-[0.2em] uppercase select-none", c.label)}>
          {label}
        </span>
      )}
    </div>
  )
}
