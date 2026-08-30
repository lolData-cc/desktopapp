// ItemStrengthPanel.tsx — "when is this item good?"
//
// A focused overlay that, for one item on the subject champion, shows the
// CONDITIONAL strengths: how the item's winrate shifts depending on the enemy
// composition (≥N of each class, ≥3 AD / AP champions). Each verdict is gated by
// a two-proportion z-test on the backend, so only statistically real shifts are
// flagged "strong"/"weak"; the rest are shown muted as "no clear effect".

import { useEffect, useState } from "react";
import { X, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { runItemStrength } from "./graph";
import { itemIcon, itemName, categoryIcon, categoryHasIcon } from "./catalog";
import type { ExplorerGraph, ItemStrengthResult, StrengthVerdict } from "./types";

// Only the 6 roster classes have icons; AD/AP/Melee/Ranged fall through to a text badge.
const isClass = categoryHasIcon;

export function ItemStrengthPanel({
  graph,
  itemId,
  onClose,
}: {
  graph: ExplorerGraph;
  itemId: number;
  onClose: () => void;
}) {
  const [res, setRes] = useState<ItemStrengthResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setRes(null);
    runItemStrength(graph, itemId)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setPhase("ready");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [graph, itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const significant = res?.verdicts.filter((v) => v.significant) ?? [];
  const rest = res?.verdicts.filter((v) => !v.significant) ?? [];

  return (
    <div className="absolute inset-0 z-[30] grid place-items-center p-4" style={{ animation: "deepDiveExpand 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-[560px] max-h-[86vh] overflow-y-auto cyber-scrollbar rounded-[14px] border border-jade/20 bg-[rgba(6,12,14,0.97)] p-5 shadow-[0_0_40px_rgba(var(--c-shadow),0.6)]">
        {/* header */}
        <div className="flex items-start gap-3 pb-4 mb-4 border-b border-hairline/[0.07]">
          <img
            src={itemIcon(itemId)}
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
            className="w-12 h-12 rounded-[7px] border border-jade/40 shrink-0"
            style={{ boxShadow: "0 0 14px rgba(0,217,146,0.22)" }}
            alt=""
          />
          <div className="min-w-0 flex-1">
            <div className="text-[8px] font-chakrapetch font-bold tracking-[0.24em] uppercase text-jade/60">Item analysis</div>
            <h3 className="font-chakrapetch font-bold text-[18px] leading-tight text-flash truncate">{itemName(itemId)}</h3>
            {res && res.builderGames > 0 && (
              <div className="mt-1 flex items-center gap-2 text-[11px] font-chakrapetch text-flash/55">
                <span className="font-bold tabular-nums text-flash">{res.builderWinrate}%</span>
                <span className="text-flash/30">base WR ·</span>
                <span className="tabular-nums">{res.builderGames.toLocaleString()}</span>
                <span className="text-flash/30">games on {graph.subject.champion}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} title="Close (Esc)" className="shrink-0 grid place-items-center w-8 h-8 rounded-[6px] border border-hairline/10 text-flash/45 hover:text-flash hover:border-hairline/25 transition-colors cursor-clicker">
            <X size={16} />
          </button>
        </div>

        {phase === "loading" && <div className="h-[160px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">analysing matchups…</div>}
        {phase === "error" && <div className="h-[120px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">Analysis unavailable.</div>}

        {phase === "ready" && res && !res.ready && (
          <div className="h-[100px] grid place-items-center text-center text-[11px] font-chakrapetch text-flash/35 px-4">
            Champion class data still loading — try again in a moment.
          </div>
        )}

        {phase === "ready" && res && res.ready && res.builderGames < 50 && (
          <div className="h-[100px] grid place-items-center text-center text-[11px] font-chakrapetch text-flash/35 px-4">
            Not enough games on {itemName(itemId)} to judge matchups ({res.builderGames} games).
          </div>
        )}

        {phase === "ready" && res && res.ready && res.builderGames >= 50 && (
          <div className="flex flex-col gap-2.5">
            {significant.length > 0 ? (
              <>
                <div className="text-[10px] font-chakrapetch font-bold uppercase tracking-[0.16em] text-flash/45">Situational verdicts</div>
                {significant.map((v) => (
                  <VerdictRow key={v.category} v={v} />
                ))}
              </>
            ) : (
              <div className="rounded-[9px] border border-hairline/[0.07] bg-filmdark/30 px-4 py-3 text-[11.5px] font-chakrapetch text-flash/55 leading-relaxed">
                No enemy-composition produced a statistically significant winrate shift for this item — it performs about the same regardless of who you face (or the per-matchup samples are still too small to call).
              </div>
            )}

            {rest.length > 0 && (
              <details className="mt-1 group">
                <summary className="cursor-clicker text-[10px] font-chakrapetch font-bold uppercase tracking-[0.14em] text-flash/35 hover:text-flash/60 transition-colors list-none">
                  + show all {res.verdicts.length} matchup splits
                </summary>
                <div className="mt-2 flex flex-col gap-1.5">
                  {rest.map((v) => (
                    <VerdictRow key={v.category} v={v} muted />
                  ))}
                </div>
              </details>
            )}

            <p className="mt-1 text-[9.5px] font-chakrapetch text-flash/25 leading-relaxed">
              "Strong/weak" requires a significant two-proportion test (95%) with ≥100 games each side — small or noisy splits are shown muted, not flagged.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictRow({ v, muted }: { v: StrengthVerdict; muted?: boolean }) {
  const strong = v.direction === "strong";
  const weak = v.direction === "weak";
  const accent = strong ? "#00d992" : weak ? "#ff6286" : "#8a9096";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[9px] border px-3 py-2.5",
        muted ? "border-hairline/[0.05] bg-filmdark/20 opacity-70" : strong ? "border-jade/25 bg-jade/[0.05]" : weak ? "border-error/25 bg-error/[0.05]" : "border-hairline/[0.07] bg-filmdark/30"
      )}
    >
      {/* category icon / badge */}
      <div className="shrink-0 w-8 grid place-items-center">
        {isClass(v.category) ? (
          <img src={categoryIcon(v.category)} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} className="w-7 h-7 object-contain" alt={v.category} />
        ) : (
          <span className="px-1.5 py-0.5 rounded-[4px] border border-hairline/15 text-[9px] font-chakrapetch font-bold text-flash/70">{v.category}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-chakrapetch font-bold text-flash truncate">{v.label}</span>
          {!muted && (strong || weak) && (
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[8px] font-chakrapetch font-bold uppercase tracking-[0.1em]", strong ? "bg-jade/15 text-jade" : "bg-error/15 text-error")}>
              {strong ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
              {strong ? "strong" : "weak"}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] font-chakrapetch text-flash/45 tabular-nums">
          {v.winrateIn}% with · {v.winrateOut}% without · n={compact(v.gamesIn)}/{compact(v.gamesOut)}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[15px] font-chakrapetch font-bold tabular-nums" style={{ color: accent }}>
          {v.delta >= 0 ? "+" : ""}
          {v.delta.toFixed(1)}
        </div>
        <div className="text-[8px] font-chakrapetch uppercase tracking-[0.1em] text-flash/30">pp shift</div>
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
