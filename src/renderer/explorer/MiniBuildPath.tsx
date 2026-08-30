// MiniBuildPath.tsx — a one-line "core build" strip for the result sidebar.
// Shows the most-picked item at each slot (1st → 2nd → 3rd …) compactly; the full
// path + alternatives + matchups live in the Deep dive.

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { runBuildPath } from "./graph";
import { itemIcon, itemName } from "./catalog";
import { CyberTip } from "./CyberTip";
import type { ExplorerGraph, BuildPathResult } from "./types";

export function MiniBuildPath({ graph }: { graph: ExplorerGraph }) {
  const [res, setRes] = useState<BuildPathResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setRes(null);
    runBuildPath(graph)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setPhase(r.slots.some((s) => s.length > 0) ? "ready" : "empty");
      })
      .catch(() => !cancelled && setPhase("empty"));
    return () => {
      cancelled = true;
    };
  }, [graph]);

  if (phase === "loading")
    return <div className="h-[52px] grid place-items-center text-[10px] font-chakrapetch text-flash/30">tracing build…</div>;
  if (phase === "empty" || !res) return null;

  const path = res.slots.map((s) => s[0]).filter(Boolean).slice(0, 5);
  if (path.length === 0) return null;

  return (
    <div className="mb-3 pb-3 border-b border-hairline/[0.06]">
      <div className="text-[8px] font-chakrapetch font-bold uppercase tracking-[0.16em] text-flash/40 mb-1.5">Core build</div>
      <div className="flex items-center gap-1">
        {path.map((it, i) => (
          <div key={it.item} className="flex items-center gap-1">
            <CyberTip
              tip={
                <>
                  <b className="text-flash">{itemName(it.item)}</b>
                  <br />
                  {it.winrate}% winrate · {it.pickrate}% bought here · {it.games.toLocaleString()} games
                </>
              }
            >
              <div className="flex flex-col items-center cursor-help">
                <img
                  src={itemIcon(it.item)}
                  onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  className={cn("w-8 h-8 rounded-[5px] border", it.winrate >= 50 ? "border-jade/40" : "border-error/40")}
                  alt=""
                />
                <span className={cn("text-[8px] font-chakrapetch font-bold tabular-nums mt-0.5", it.winrate >= 50 ? "text-jade" : "text-error")}>
                  {it.winrate}%
                </span>
              </div>
            </CyberTip>
            {i < path.length - 1 && <ChevronRight size={11} className="text-jade/45 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
