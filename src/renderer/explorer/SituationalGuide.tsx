// SituationalGuide.tsx — "ADAPT YOUR BUILD".
//
// The clear answer to "when do I build item A instead of B?". Runs the conditional
// item-strength analysis for the build's top items, keeps only the statistically
// significant verdicts, and GROUPS them by enemy situation (vs ≥3 AD, vs ≥2
// Assassins, …) — so each card says "against THIS comp, build THESE items".
//
// Significance gating is done backend-side (two-proportion z-test); we only show
// what survived it, so this never invents a matchup edge that isn't real.

import { useEffect, useState } from "react";
import { Swords, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { runItemStrength } from "./graph";
import { itemIcon, itemName, categoryIcon, categoryHasIcon } from "./catalog";
import { CyberTip, InfoDot } from "./CyberTip";
import type { ExplorerGraph, StrengthVerdict } from "./types";

const MAX_ITEMS = 5; // top items to analyse (pool cap = 6, leave one free)
// Only the 6 roster classes have icons; AD/AP/Melee/Ranged fall through to a text badge.
const isClass = categoryHasIcon;

type Pick = { item: number; delta: number; gamesIn: number };
type Group = {
  key: string;
  category: string;
  label: string;
  strong: Pick[];
  weak: Pick[];
  maxDelta: number;
};

export function SituationalGuide({ graph, items }: { graph: ExplorerGraph; items: number[] }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");

  const ids = items.slice(0, MAX_ITEMS).join(",");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setGroups(null);
    const list = ids ? ids.split(",").map(Number) : [];
    if (list.length === 0) {
      setPhase("empty");
      return;
    }
    Promise.all(
      list.map((id) =>
        runItemStrength(graph, id)
          .then((r) => ({ id, verdicts: r.verdicts.filter((v) => v.significant) }))
          .catch(() => ({ id, verdicts: [] as StrengthVerdict[] }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        const byCond = new Map<string, Group>();
        for (const { id, verdicts } of results) {
          for (const v of verdicts) {
            const key = `${v.category}:${v.threshold}`;
            if (!byCond.has(key))
              byCond.set(key, { key, category: v.category, label: v.label, strong: [], weak: [], maxDelta: 0 });
            const g = byCond.get(key)!;
            const pick: Pick = { item: id, delta: v.delta, gamesIn: v.gamesIn };
            if (v.direction === "strong") {
              g.strong.push(pick);
              g.maxDelta = Math.max(g.maxDelta, v.delta);
            } else if (v.direction === "weak") {
              g.weak.push(pick);
            }
          }
        }
        // keep only conditions that recommend at least one item; strongest edge first
        const list2 = [...byCond.values()]
          .filter((g) => g.strong.length > 0)
          .map((g) => ({
            ...g,
            strong: g.strong.sort((a, b) => b.delta - a.delta),
            weak: g.weak.sort((a, b) => a.delta - b.delta),
          }))
          .sort((a, b) => b.maxDelta - a.maxDelta);
        setGroups(list2);
        setPhase(list2.length ? "ready" : "empty");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [graph, ids]);

  return (
    <div className="deep-section rounded-[12px] border border-hairline/[0.08] bg-[rgba(6,12,14,0.55)] p-4 md:p-5" style={{ animationDelay: "180ms" }}>
      <div className="flex items-center gap-2 mb-1">
        <Swords size={14} className="text-citrine" />
        <span className="text-[11px] font-chakrapetch font-bold tracking-[0.2em] uppercase text-flash/65">Adapt your build</span>
        <InfoDot tip="Items whose winrate shifts significantly with the enemy team's composition (two-proportion z-test, 95%, ≥100 games each side). Pick the build that fits who you're against." />
      </div>
      <p className="text-[10px] font-chakrapetch text-flash/35 mb-3.5">Against these comps, lean into the items on the right.</p>

      {phase === "loading" && (
        <div className="h-[120px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">reading the matchups…</div>
      )}
      {phase === "error" && (
        <div className="h-[90px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">Matchup analysis unavailable.</div>
      )}
      {phase === "empty" && (
        <div className="rounded-[9px] border border-hairline/[0.07] bg-filmdark/25 px-4 py-3.5 text-[11.5px] font-chakrapetch text-flash/55 leading-relaxed">
          No item in this build shifts winrate enough with the enemy comp to call it situational — the core build holds up regardless of who you face (or the per-matchup samples are still too small to be sure).
        </div>
      )}

      {phase === "ready" && groups && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {groups.map((g) => (
            <div key={g.key} className="rounded-[10px] border border-hairline/[0.08] bg-filmdark/30 p-3">
              <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-hairline/[0.06]">
                {isClass(g.category) ? (
                  <img src={categoryIcon(g.category)} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} className="w-6 h-6 object-contain shrink-0" alt="" />
                ) : (
                  <span className="px-1.5 py-0.5 rounded-[4px] border border-citrine/30 text-[9px] font-chakrapetch font-bold text-citrine shrink-0">{g.category}</span>
                )}
                <span className="text-[12.5px] font-chakrapetch font-bold text-flash leading-tight">{g.label}</span>
              </div>

              <Line icon={<ChevronUp size={12} className="text-jade" />} label="Build" picks={g.strong} tone="strong" />
              {g.weak.length > 0 && (
                <Line icon={<ChevronDown size={12} className="text-error" />} label="Drops off" picks={g.weak} tone="weak" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ icon, label, picks, tone }: { icon: React.ReactNode; label: string; picks: Pick[]; tone: "strong" | "weak" }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="flex items-center gap-1 shrink-0 w-[68px] text-[9px] font-chakrapetch font-bold uppercase tracking-[0.1em] text-flash/40 pt-1.5">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {picks.map((p) => (
          <CyberTip
            key={p.item}
            tip={
              <>
                <b className="text-flash">{itemName(p.item)}</b> — {p.delta >= 0 ? "+" : ""}
                {p.delta.toFixed(1)} pp winrate {tone === "strong" ? "stronger" : "weaker"} here ({p.gamesIn.toLocaleString()} games in this matchup)
              </>
            }
          >
            <span
              className={cn(
                "flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-[6px] border cursor-help",
                tone === "strong" ? "border-jade/30 bg-jade/[0.06]" : "border-error/25 bg-error/[0.05]"
              )}
            >
              <img src={itemIcon(p.item)} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} className="w-5 h-5 rounded-[4px] border border-hairline/10" alt="" />
              <span className={cn("text-[10px] font-chakrapetch font-bold tabular-nums", tone === "strong" ? "text-jade" : "text-error")}>
                {p.delta >= 0 ? "+" : ""}
                {p.delta.toFixed(1)}
              </span>
            </span>
          </CyberTip>
        ))}
      </div>
    </div>
  );
}
