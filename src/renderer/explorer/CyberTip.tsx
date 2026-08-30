// CyberTip.tsx — a cyber-styled hover tooltip used across the Explorer result views
// to explain every metric (lift, pick rate, coverage, significance) in plain words.
//
// It renders the bubble in a PORTAL to <body> with fixed positioning, so it always
// floats above everything (no z-index battles with the deep-dive sections) and is
// never clipped by an overflow/scroll container (e.g. the horizontal build path).

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function CyberTip({
  children,
  tip,
  className,
  side = "top",
}: {
  children: React.ReactNode;
  tip: React.ReactNode;
  className?: string;
  side?: "top" | "bottom";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const top = side === "top";

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: top ? r.top : r.bottom });
  };

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-max max-w-[260px]"
            style={{
              left: pos.x,
              top: pos.y,
              transform: top ? "translate(-50%, calc(-100% - 8px))" : "translate(-50%, 8px)",
            }}
          >
            <div className="relative rounded-[8px] border border-jade/30 bg-[rgba(4,10,12,0.98)] px-3 py-2 text-[10.5px] leading-relaxed font-chakrapetch text-flash/85 shadow-[0_0_26px_rgba(var(--c-shadow),0.72),0_0_14px_rgba(0,217,146,0.16)]">
              {tip}
              <span
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[rgba(4,10,12,0.98)] border-jade/30",
                  top ? "top-full -mt-1 border-r border-b" : "bottom-full -mb-1 border-l border-t"
                )}
              />
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}

/** A bare info dot that reveals `tip` on hover — for section headers. */
export function InfoDot({ tip, side = "top" }: { tip: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <CyberTip tip={tip} side={side} className="cursor-help align-middle">
      <Info size={12} className="text-flash/30 hover:text-jade transition-colors" />
    </CyberTip>
  );
}
