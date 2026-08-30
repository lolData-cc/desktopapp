// BuildPathViz.tsx — the cyber "core build path".
//
// Renders the cohort's most-common completed-item sequence as a row of slots
// (1st → 2nd → 3rd …), the top item of each slot wired to the next by a glowing
// jade connector, with situational alternatives stacked under each slot. Each item
// is clickable → opens its conditional strength panel in the parent.
//
// Data: GET-style POST to /api/explorer/buildpath (runBuildPath). Item winrate is
// per-slot (survivorship-correct); lift is vs the cohort baseline.

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { runBuildPath } from "./graph";
import { itemIcon, itemName } from "./catalog";
import { CyberTip } from "./CyberTip";
import type { ExplorerGraph, BuildPathResult, BuildSlotItem } from "./types";

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

export function BuildPathViz({
  graph,
  onSelectItem,
  selectedItem,
  bare,
}: {
  graph: ExplorerGraph;
  onSelectItem?: (id: number) => void;
  selectedItem?: number | null;
  bare?: boolean; // drop the card chrome (border/bg/title) so the items float
}) {
  const [res, setRes] = useState<BuildPathResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setRes(null);
    runBuildPath(graph)
      .then((r) => {
        if (cancelled) return;
        const has = r.slots.some((s) => s.length > 0);
        setRes(r);
        setPhase(has ? "ready" : "empty");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [graph]);

  if (phase === "loading")
    return (
      <Shell bare={bare}>
        <div className="h-[150px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">
          tracing the build path…
        </div>
      </Shell>
    );
  if (phase === "error")
    return (
      <Shell bare={bare}>
        <div className="h-[110px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">
          Build path unavailable for this query.
        </div>
      </Shell>
    );
  if (phase === "empty" || !res)
    return (
      <Shell bare={bare}>
        <div className="h-[110px] grid place-items-center text-center text-[11px] font-chakrapetch text-flash/35 px-6">
          No item-order data for this cohort yet — build paths need timeline-covered games.
        </div>
      </Shell>
    );

  // Dedup: each slot's "main" = its most-picked item NOT already used earlier.
  // You can't build the same item twice, so an item can't headline two slots.
  const usedMain = new Set<number>();
  const mains = res.slots.map((slot) => {
    const m = slot.find((it) => !usedMain.has(it.item)) ?? null;
    if (m) usedMain.add(m.item);
    return m;
  });

  return (
    <Shell bare={bare} coverage={res.coverage} covered={res.coveredGames}>
      <div className="overflow-x-auto cyber-scrollbar pb-2 -mx-1 px-1">
        <div className="flex items-start gap-7 min-w-min pt-1">
          {res.slots.map((slot, i) => {
            const main = mains[i];
            if (!main) return null;
            const alts = slot.filter((a) => a.item !== main.item).slice(0, 3); // top alternatives (excl. the main)
            const last = i === res.slots.length - 1;
            return (
              <div key={i} className="relative shrink-0 w-[116px]">
                {/* connector to the next slot's main item (centered on the icon row) */}
                {!last && mains[i + 1] && (
                  <div className="pointer-events-none absolute right-[-28px] top-[34px] w-[28px] flex items-center">
                    <span
                      className="block h-[2px] flex-1 rounded-full"
                      style={{
                        background: "linear-gradient(90deg, rgba(0,217,146,0.15), rgba(0,217,146,0.85))",
                        boxShadow: "0 0 8px rgba(0,217,146,0.55)",
                      }}
                    />
                    <ChevronRight size={14} className="text-jade -ml-1 shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(0,217,146,0.7))" }} />
                  </div>
                )}

                <div className="text-center text-[9px] font-chakrapetch font-bold uppercase tracking-[0.18em] text-jade/60 mb-1.5">
                  {ORD[i] ?? `${i + 1}th`}
                </div>

                <ItemNode item={main} big selected={selectedItem === main.item} onClick={() => onSelectItem?.(main.item)} />

                {alts.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <div className="text-center text-[8px] font-chakrapetch uppercase tracking-[0.16em] text-flash/25">alt</div>
                    {alts.map((alt) => (
                      <ItemNode key={alt.item} item={alt} selected={selectedItem === alt.item} onClick={() => onSelectItem?.(alt.item)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function ItemNode({
  item,
  big,
  selected,
  onClick,
}: {
  item: BuildSlotItem;
  big?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const wr = item.winrate;
  const good = wr >= 50;
  const size = big ? "w-14 h-14" : "w-9 h-9";
  return (
    <CyberTip
      className="w-full align-top"
      tip={
        <div className="flex flex-col gap-0.5">
          <b className="text-flash text-[11px]">{itemName(item.item)}</b>
          <span>
            <b className={good ? "text-jade" : "text-error"}>{wr}% winrate</b> at this slot
          </span>
          <span>
            <b className={item.lift >= 0 ? "text-jade" : "text-error"}>{item.lift >= 0 ? "+" : ""}{item.lift.toFixed(1)} lift</b> vs champ average
          </span>
          <span className="text-flash/55">{item.pickrate}% bought it here · {item.games.toLocaleString()} games</span>
          <span className="text-jade/70 mt-0.5">▸ click for matchup analysis</span>
        </div>
      }
    >
      <button
        onClick={onClick}
        className={cn(
          "group w-full flex flex-col items-center rounded-[9px] border px-1.5 py-2 transition-all cursor-clicker",
          selected
            ? "border-citrine/60 bg-citrine/[0.06]"
            : big
              ? "border-jade/25 bg-jade/[0.04] hover:border-jade/45"
              : "border-hairline/[0.07] bg-filmdark/30 hover:border-hairline/20"
        )}
      >
        <div className="relative">
          <img
            src={itemIcon(item.item)}
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
            className={cn("rounded-[6px] border", size, good ? "border-jade/40" : "border-error/40")}
            style={{ boxShadow: big ? `0 0 12px ${good ? "rgba(0,217,146,0.3)" : "rgba(255,98,134,0.25)"}` : undefined }}
            alt=""
          />
        </div>
        {big && (
          <span className="mt-1 text-[10px] leading-tight font-chakrapetch font-bold text-flash/80 text-center line-clamp-2 h-[26px]">
            {itemName(item.item)}
          </span>
        )}
        <div className="mt-1 flex items-baseline gap-1">
          <span className={cn("font-chakrapetch font-bold tabular-nums", big ? "text-[14px]" : "text-[11px]", good ? "text-jade" : "text-error")}>
            {wr}%
          </span>
          <LiftBadge lift={item.lift} small={!big} />
        </div>
        <span className={cn("font-chakrapetch tabular-nums text-flash/35", big ? "text-[9px]" : "text-[8px]")}>
          {item.pickrate}% · {compact(item.games)}
        </span>
      </button>
    </CyberTip>
  );
}

function LiftBadge({ lift, small }: { lift: number; small?: boolean }) {
  if (Math.abs(lift) < 0.05) return null;
  const up = lift > 0;
  return (
    <span
      className={cn(
        "font-chakrapetch font-bold tabular-nums",
        small ? "text-[8px]" : "text-[9px]",
        up ? "text-jade/70" : "text-error/70"
      )}
    >
      {up ? "+" : ""}
      {lift.toFixed(1)}
    </span>
  );
}

function Shell({
  children,
  coverage,
  covered,
  bare,
}: {
  children: React.ReactNode;
  coverage?: number;
  covered?: number;
  bare?: boolean;
}) {
  return (
    <div className={cn("deep-section", !bare && "rounded-[12px] border border-hairline/[0.08] bg-[rgba(6,12,14,0.55)] p-4 md:p-5")} style={{ animationDelay: "150ms" }}>
      {(!bare || coverage != null) && (
      <div className="flex items-center justify-between gap-3 mb-3.5">
        {bare ? <span /> : (
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 bg-jade rounded-full" />
          <span className="text-[11px] font-chakrapetch font-bold tracking-[0.2em] uppercase text-flash/55">Core build path</span>
        </div>
        )}
        {coverage != null && (
          <CyberTip side="bottom" tip={<>Build order is only known for games that have <b className="text-flash">match-timeline</b> data — <b className="text-jade">{coverage}%</b> of this cohort. The path is computed from those <b className="text-flash">{compact(covered ?? 0)}</b> games.</>}>
            <span className="flex items-center gap-1.5 text-[10px] font-chakrapetch text-flash/55 tabular-nums cursor-help whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-jade/50 shrink-0" />
              <b className="text-flash/80">{compact(covered ?? 0)}</b> games · {coverage}% with build data
            </span>
          </CyberTip>
        )}
      </div>
      )}
      {/* legend — what the two numbers under each item mean */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3.5 text-[9px] font-chakrapetch text-flash/40">
        <span><b className="text-jade">52%</b> winrate at this slot</span>
        <span><b className="text-jade">+0.3</b> lift vs champ average</span>
        <span><b className="text-flash/55">59% · 2.9k</b> bought here · games</span>
        <span className="text-flash/25">— click an item for its matchup analysis</span>
      </div>
      {children}
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
