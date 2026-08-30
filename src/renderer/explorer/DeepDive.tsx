// DeepDive.tsx — the expanded, in-depth analysis a query opens into.
//
// Fills the canvas with a glowy loldata-style read of the result: a winrate ring,
// KDA / CS / gold, and the centrepiece — the PATCH VARIATION explained: a glowing
// area chart of the chosen metric across recent patches, a plain-language trend
// verdict, and per-patch deltas. For ranking outputs it shows the full ranked
// board. The expansion itself is animated (deepDiveExpand) for a fluid feel.

import { useEffect, useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown, Minus as MinusIcon, ChevronRight, BookmarkPlus, Check } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { runPatchVariation } from "./graph";
import { champIcon, itemIcon, itemName, categoryIcon, categoryHasIcon, CATEGORY_LABEL } from "./catalog";
import { BuildPathViz } from "./BuildPathViz";
import { ItemStrengthPanel } from "./ItemStrengthPanel";
import { SituationalGuide } from "./SituationalGuide";
import { CyberTip } from "./CyberTip";
import type { ExplorerGraph, QueryResult, PatchVariationRow } from "./types";

type Metric = "winrate" | "kda" | "cs" | "gold";
const METRICS: {
  key: Metric; label: string; get: (r: PatchVariationRow) => number; fmt: (v: number) => string; pad: number; eps: number; suffix: string;
}[] = [
  { key: "winrate", label: "Winrate", get: (r) => Number(r.winrate ?? 0), fmt: (v) => `${v.toFixed(1)}%`, pad: 1.5, eps: 0.05, suffix: "pt" },
  { key: "kda", label: "KDA", get: (r) => { const d = Number(r.avg_deaths ?? 0), ka = Number(r.avg_kills ?? 0) + Number(r.avg_assists ?? 0); return d > 0 ? ka / d : ka; }, fmt: (v) => v.toFixed(2), pad: 0.15, eps: 0.02, suffix: "" },
  { key: "cs", label: "CS", get: (r) => Number(r.avg_cs ?? 0), fmt: (v) => v.toFixed(0), pad: 6, eps: 0.5, suffix: "" },
  { key: "gold", label: "Gold", get: (r) => Number(r.avg_gold ?? 0), fmt: (v) => `${(v / 1000).toFixed(2)}k`, pad: 200, eps: 50, suffix: "g" },
];

export function DeepDive({ data, graph, onClose, onSave, canSave, saved }: { data: QueryResult; graph: ExplorerGraph; onClose: () => void; onSave?: () => void; canSave?: boolean; saved?: boolean }) {
  const isRank = data.columns.includes("dimension");
  const isItemDim = isRank && graph.output.kind === "rank" && graph.output.dimension === "item";
  const stat = data.rows[0] as Record<string, number | null> | undefined;
  const [strengthItem, setStrengthItem] = useState<number | null>(null);
  // top build items (for the situational guide) + the champ's baseline WR (so "lift" reads clearly)
  const topItems = useMemo(
    () => (isItemDim ? data.rows.slice(0, 5).map((r) => Number(r.dimension)).filter(Boolean) : []),
    [data, isItemDim]
  );
  const baseline = isItemDim && data.rows[0]?.baseline != null ? Number(data.rows[0].baseline) : null;

  const rank = useMemo(() => {
    const t = graph.filters?.tiers;
    if (!t?.length) return null;
    const s = new Set(t);
    if (s.has("MASTER")) return "Master+";
    if (s.has("GRANDMASTER")) return "GM+";
    if (s.has("CHALLENGER")) return "Challenger";
    return t[0];
  }, [graph]);

  // esc to collapse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wr = Number(stat?.winrate ?? 0);
  const k = Number(stat?.avg_kills ?? 0), d = Number(stat?.avg_deaths ?? 0), a = Number(stat?.avg_assists ?? 0);
  const kda = d > 0 ? (k + a) / d : k + a;

  return (
    <div className="absolute inset-0 z-[20]" style={{ animation: "deepDiveExpand 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
      {/* static backdrop + ambient decoration — blankets the whole panel and never scrolls,
          so there's no colour seam at the fold and the item overlay dims the full area */}
      <div className="absolute inset-0 bg-[rgba(3,7,9,0.985)] backdrop-blur-2xl" />
      <div className="pointer-events-none absolute -top-40 left-1/4 w-[640px] h-[640px] rounded-full" style={{ background: "radial-gradient(circle, rgba(0,217,146,0.08), transparent 60%)" }} />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)" }} />

      {/* scrolling content layer (transparent — the backdrop above shows through) */}
      <div className="absolute inset-0 overflow-y-auto cyber-scrollbar">
        <div className="relative max-w-[1080px] mx-auto px-3 sm:px-6 md:px-10 py-7">
        {/* slim action bar — save + close, sitting just above the header */}
        <div className="deep-section flex items-center justify-end gap-2 mb-2.5">
          {onSave && canSave && (
            <button
              onClick={() => !saved && onSave()}
              disabled={saved}
              title={saved ? "Already saved — find it in Snapshots" : "Save this exact query; re-open it any day for fresh numbers"}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-[6px] border text-[10px] font-chakrapetch font-bold uppercase tracking-[0.12em] transition-colors",
                saved
                  ? "border-jade/45 bg-jade/15 text-jade cursor-default"
                  : "border-jade/30 bg-jade/[0.06] text-jade/85 hover:bg-jade/[0.13] hover:border-jade/55 hover:text-jade cursor-clicker"
              )}
            >
              {saved ? <Check size={13} /> : <BookmarkPlus size={13} />}
              {saved ? "Saved" : "Save snapshot"}
            </button>
          )}
          <button onClick={onClose} title="Collapse (Esc)" className="grid place-items-center w-8 h-8 rounded-[6px] text-flash/45 hover:text-flash hover:bg-filmlight/[0.06] transition-colors cursor-clicker">
            <X size={17} />
          </button>
        </div>

        {/* header — champion + a light, inline query recap, all on the left */}
        <div className="deep-section flex items-start gap-3.5 pb-5 mb-6 border-b border-hairline/[0.07]" style={{ animationDelay: "40ms" }}>
          {graph.subject.champion && (
            <img src={champIcon(graph.subject.champion)} className="w-14 h-14 rounded-[7px] border border-jade/40 shrink-0" style={{ boxShadow: "0 0 18px rgba(0,217,146,0.25)" }} alt="" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-chakrapetch font-bold tracking-[0.28em] uppercase text-jade/70">Deep dive</span>
              <span className="text-[9px] font-chakrapetch text-flash/30">::</span>
              <span className="text-[9px] font-chakrapetch text-flash/35 truncate">{summarise(graph)}</span>
            </div>
            <h2 className="font-chakrapetch font-bold text-[26px] leading-none text-flash truncate">
              {graph.subject.champion || "Result"}
              {graph.subject.role && <span className="text-flash/35 text-[16px] ml-2">{graph.subject.role}</span>}
            </h2>
            <QueryRecapInline graph={graph} data={data} rank={rank} baseline={baseline} />
          </div>
        </div>

        {/* core build path — the showcase for item-ranking queries */}
        {isItemDim && <BuildPathViz graph={graph} onSelectItem={setStrengthItem} selectedItem={strengthItem} />}

        {/* adapt your build — situational conditional item strengths (the "when to build X vs Y") */}
        {isItemDim && topItems.length > 0 && (
          <div className="mt-5">
            <SituationalGuide graph={graph} items={topItems} />
          </div>
        )}

        {/* stats hero (non-rank) */}
        {!isRank && stat && Number(stat.games) > 0 && (
          <div className="deep-section grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 mb-6" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center justify-center rounded-[10px] border border-jade/15 bg-jade/[0.03] py-4">
              <Ring value={wr} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BigStat label="KDA" value={kda.toFixed(2)} accent={kda >= 3 ? "#00d992" : kda >= 2 ? "#d7d8d9" : "#ff6286"} sub={`${k.toFixed(1)} / ${d.toFixed(1)} / ${a.toFixed(1)}`} />
              <BigStat label="Avg CS" value={Number(stat.avg_cs ?? 0).toFixed(0)} accent="#d7d8d9" />
              <BigStat label="Avg Gold" value={`${(Number(stat.avg_gold ?? 0) / 1000).toFixed(1)}k`} accent="#FFB615" />
              <BigStat label="Games" value={Number(stat.games).toLocaleString()} accent="#36d3ff" />
            </div>
          </div>
        )}

        {/* ranking board (rank output) — items are weighted by lift × confidence */}
        {isRank && data.rows.length > 0 && (
          <div className="deep-section mt-6" style={{ animationDelay: "120ms" }}>
            <SectionTitle>{isItemDim ? "Item value · ranked by weighted lift" : `Ranking · top ${data.rows.length} by winrate`}</SectionTitle>
            {isItemDim && (
              <p className="text-[10px] font-chakrapetch text-flash/35 mt-1.5 mb-1">
                Ranked by how much each item raises {graph.subject.champion}'s winrate above baseline, weighted by sample size — not raw winrate. Click any item for its matchup analysis.
              </p>
            )}
            <div className="flex flex-col gap-2 mt-2.5">
              {isItemDim && (
                <div className="flex items-center gap-3 px-3 pb-0.5 text-[8px] font-chakrapetch font-bold uppercase tracking-[0.12em] text-flash/30">
                  <span className="w-6 shrink-0" />
                  <span className="w-9 shrink-0" />
                  <span className="flex-1">Item · pick · games</span>
                  <CyberTip tip={<><b className="text-flash">Lift</b> = winrate above {graph.subject.champion}'s {baseline ?? "~"}% baseline. Positive = the item helps more than an average game; the ranking weights this by sample size so a proven build beats a high-variance niche pick.</>}>
                    <span className="w-12 text-right cursor-help text-flash/45 hover:text-jade transition-colors">Lift</span>
                  </CyberTip>
                  <span className="w-[26%] max-w-[300px] shrink-0" />
                  <span className="w-14 text-right">Winrate</span>
                  <span className="w-[15px] shrink-0" />
                </div>
              )}
              {data.rows.map((r, i) => {
                const raw = r.dimension as string | number;
                const icon = isItemDim ? itemIcon(Number(raw)) : champIcon(String(raw));
                const label = isItemDim ? itemName(Number(raw)) : String(raw);
                const w = Number(r.winrate);
                const lift = r.lift != null ? Number(r.lift) : null;
                const pick = r.pickrate != null ? Number(r.pickrate) : null;
                const games = Number(r.games);
                const lowSample = isItemDim && games < 100;
                return (
                  <div
                    key={String(raw)}
                    onClick={isItemDim ? () => setStrengthItem(Number(raw)) : undefined}
                    title={isItemDim ? "Matchup analysis" : undefined}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-[8px] border",
                      i < 3 ? "border-jade/20 bg-jade/[0.04]" : "border-hairline/[0.06] bg-filmdark/30",
                      isItemDim && "cursor-clicker hover:border-jade/40 transition-colors"
                    )}
                  >
                    <span className={cn("w-6 text-center text-[13px] font-chakrapetch font-bold tabular-nums", i === 0 ? "text-citrine" : i < 3 ? "text-jade" : "text-flash/30")}>{i + 1}</span>
                    <img src={icon} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} className="w-9 h-9 rounded-[5px] border border-hairline/10 shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[14px] font-chakrapetch font-bold text-flash truncate">{label}</span>
                      {isItemDim && (
                        <span className="block text-[9px] font-chakrapetch text-flash/35 tabular-nums">
                          {pick != null && <>{pick}% pick · </>}{games.toLocaleString()} games{lowSample && <span className="text-citrine/65"> · low sample</span>}
                        </span>
                      )}
                    </div>
                    {isItemDim && lift != null && (
                      <div className="shrink-0 w-12 text-right">
                        <span className={cn("text-[14px] font-chakrapetch font-bold tabular-nums", lift > 0.05 ? "text-jade" : lift < -0.05 ? "text-error" : "text-flash/50")}>{lift > 0 ? "+" : ""}{lift.toFixed(1)}</span>
                        <span className="block text-[7px] font-chakrapetch uppercase tracking-[0.1em] text-flash/30 -mt-0.5">lift pp</span>
                      </div>
                    )}
                    <div className="w-[26%] max-w-[300px] h-2.5 rounded-full bg-filmlight/[0.06] overflow-hidden shrink-0">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, w)}%`, background: w >= 50 ? "linear-gradient(90deg,#00a070,#00d992)" : "linear-gradient(90deg,#b53b54,#ff6286)", boxShadow: w >= 50 ? "0 0 10px rgba(0,217,146,0.5)" : "0 0 10px rgba(255,98,134,0.4)" }} />
                    </div>
                    <span className={cn("w-14 text-right text-[15px] font-chakrapetch font-bold tabular-nums", w >= 50 ? "text-jade" : "text-error")}>{w}%</span>
                    {!isItemDim && <span className="w-14 text-right text-[10px] font-chakrapetch text-flash/35 tabular-nums">{Number(r.games).toLocaleString()}g</span>}
                    {isItemDim && <ChevronRight size={15} className="shrink-0 text-flash/25 group-hover:text-jade/70 transition-colors" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* how it's drifting across recent patches */}
        <div className="mt-6">
          <PatchTrend graph={graph} />
        </div>

        <p className="deep-section mt-8 text-[10px] font-chakrapetch text-flash/25 leading-relaxed" style={{ animationDelay: "180ms" }}>
          {isItemDim
            ? "Item value weights each item's winrate lift over baseline by sample size, so a proven core build outranks a high-variance niche pick. Build path, “adapt your build” and matchup analysis use timeline build-order data."
            : "Patch trend is the champion at this role/rank across recent patches (instant). Save this combo as a snapshot to recheck it any day with fresh data."}
        </p>
        </div>
      </div>

      {strengthItem != null && (
        <ItemStrengthPanel graph={graph} itemId={strengthItem} onClose={() => setStrengthItem(null)} />
      )}
    </div>
  );
}

// ── patch trend (the explained chart) ──
function PatchTrend({ graph }: { graph: ExplorerGraph }) {
  const [rows, setRows] = useState<PatchVariationRow[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty">("loading");
  const [metric, setMetric] = useState<Metric>("winrate");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading"); setRows(null);
    runPatchVariation(graph, false)
      .then((r) => { if (cancelled) return; setRows(r.rows); setPhase(r.rows.length >= 2 ? "ready" : "empty"); })
      .catch(() => { if (!cancelled) setPhase("empty"); });
    return () => { cancelled = true; };
  }, [graph]);

  const m = METRICS.find((x) => x.key === metric)!;

  const { chartData, domain, verdict } = useMemo(() => {
    if (!rows || rows.length < 2) return { chartData: [], domain: [0, 1] as [number, number], verdict: null };
    const cd = rows.map((r) => ({ patch: r.patch, value: m.get(r), games: r.games }));
    const vals = cd.map((d) => d.value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const dom: [number, number] = [lo - m.pad, hi + m.pad];
    const first = vals[0], last = vals[vals.length - 1], delta = last - first;
    const dir = Math.abs(delta) < m.eps ? "stable" : delta > 0 ? "up" : "down";
    return { chartData: cd, domain: dom, verdict: { first, last, delta, dir, from: cd[0].patch, to: cd[cd.length - 1].patch } };
  }, [rows, m]);

  return (
    <div className="deep-section rounded-[12px] border border-hairline/[0.08] bg-[rgba(6,12,14,0.55)] p-4 md:p-5" style={{ animationDelay: "90ms" }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <SectionTitle>Patch variation</SectionTitle>
        <div className="flex gap-1">
          {METRICS.map((x) => (
            <button key={x.key} onClick={() => setMetric(x.key)}
              className={cn("px-2.5 py-1 rounded-[5px] text-[10px] font-chakrapetch font-bold uppercase tracking-[0.08em] transition-colors cursor-clicker",
                metric === x.key ? "bg-jade/15 text-jade border border-jade/35" : "text-flash/40 border border-hairline/[0.07] hover:text-flash/70")}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {phase === "loading" && <div className="h-[240px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">loading patch trend…</div>}
      {phase === "empty" && <div className="h-[120px] grid place-items-center text-[11px] font-chakrapetch text-flash/35">Not enough patches to chart a trend.</div>}

      {phase === "ready" && verdict && (
        <>
          {/* verdict sentence */}
          <div className="flex items-center gap-2.5 mb-3">
            <span className={cn("grid place-items-center w-7 h-7 rounded-[6px] border",
              verdict.dir === "up" ? "text-jade border-jade/30 bg-jade/10" : verdict.dir === "down" ? "text-error border-error/30 bg-error/10" : "text-flash/50 border-hairline/10 bg-filmlight/[0.04]")}>
              {verdict.dir === "up" ? <TrendingUp size={15} /> : verdict.dir === "down" ? <TrendingDown size={15} /> : <MinusIcon size={15} />}
            </span>
            <p className="text-[12.5px] font-chakrapetch text-flash/80 leading-snug">
              {m.label}{" "}
              <span className={cn("font-bold", verdict.dir === "up" ? "text-jade" : verdict.dir === "down" ? "text-error" : "text-flash")}>
                {verdict.dir === "up" ? "trending up" : verdict.dir === "down" ? "trending down" : "holding steady"}
              </span>{" "}
              — {m.fmt(verdict.first)} → {m.fmt(verdict.last)}{" "}
              <span className={cn("font-bold", verdict.dir === "up" ? "text-jade" : verdict.dir === "down" ? "text-error" : "text-flash/50")}>
                ({verdict.delta >= 0 ? "+" : ""}{deltaFmt(verdict.delta, m)})
              </span>{" "}
              across {verdict.from} → {verdict.to}.
            </p>
          </div>

          {/* the chart */}
          <div className="w-full h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d992" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#00d992" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="patch" tick={{ fill: "#d7d8d9", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
                <YAxis domain={domain} tick={{ fill: "#8a9096", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => m.fmt(v)} />
                {metric === "winrate" && <ReferenceLine y={50} stroke="rgba(215,216,217,0.25)" strokeDasharray="4 4" />}
                <Tooltip
                  cursor={{ stroke: "rgba(0,217,146,0.3)", strokeWidth: 1 }}
                  contentStyle={{ background: "rgba(6,12,14,0.96)", border: "1px solid rgba(0,217,146,0.25)", borderRadius: 7, fontFamily: "chakrapetch", fontSize: 12 }}
                  labelStyle={{ color: "#d7d8d9" }}
                  formatter={(v: any, _n: any, p: any) => [`${m.fmt(Number(v))}  ·  ${Number(p?.payload?.games ?? 0).toLocaleString()} games`, m.label]}
                />
                <Area type="monotone" dataKey="value" stroke="#00d992" strokeWidth={2.5} fill="url(#pvFill)"
                  dot={{ r: 4, fill: "#00d992", stroke: "#03110c", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#00d992", stroke: "#03110c", strokeWidth: 2 }}
                  isAnimationActive style={{ filter: "drop-shadow(0 0 6px rgba(0,217,146,0.55))" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* per-patch deltas */}
          <div className="flex flex-wrap gap-2 mt-3">
            {chartData.map((c, i) => {
              const prev = i > 0 ? chartData[i - 1].value : null;
              const dl = prev == null ? null : c.value - prev;
              return (
                <div key={c.patch} className="flex items-center gap-1.5 px-2 py-1 rounded-[5px] border border-hairline/[0.07] bg-filmdark/30">
                  <span className="text-[10px] font-chakrapetch tabular-nums text-flash/55">{c.patch}</span>
                  <span className="text-[11px] font-chakrapetch font-bold tabular-nums text-flash">{m.fmt(c.value)}</span>
                  {dl != null && Math.abs(dl) >= m.eps && (
                    <span className={cn("text-[9px] font-chakrapetch tabular-nums", dl > 0 ? "text-jade/80" : "text-error/80")}>
                      {dl > 0 ? "▲" : "▼"}{deltaFmt(Math.abs(dl), m)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function deltaFmt(v: number, m: { key: Metric }): string {
  if (m.key === "winrate") return v.toFixed(1);
  if (m.key === "kda") return v.toFixed(2);
  if (m.key === "gold") return Math.round(v).toString();
  return v.toFixed(0);
}

function Ring({ value }: { value: number }) {
  const r = 48, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 50 ? "#00d992" : "#ff6286";
  return (
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
      <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 66 66)"
        style={{ filter: `drop-shadow(0 0 7px ${color})`, transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
      <text x="66" y="64" textAnchor="middle" className="font-chakrapetch font-bold" fill={color} fontSize="30">{value.toFixed(1)}</text>
      <text x="66" y="84" textAnchor="middle" fill="#8a9096" fontSize="9" letterSpacing="2">WINRATE %</text>
    </svg>
  );
}

function BigStat({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-[9px] border border-hairline/[0.07] bg-filmdark/30 px-3 py-3">
      <span className="text-[8px] font-chakrapetch tracking-[0.16em] uppercase text-flash/35">{label}</span>
      <span className="text-[24px] leading-none font-chakrapetch font-bold tabular-nums mt-1.5" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-[9px] font-chakrapetch text-flash/40 tabular-nums mt-1">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1 h-3.5 bg-jade rounded-full" />
      <span className="text-[11px] font-chakrapetch font-bold tracking-[0.2em] uppercase text-flash/55">{children}</span>
    </div>
  );
}

// ── query recap (the plain-words "what did I ask?" card) ──
const QUEUE_LABEL: Record<number, string> = {
  400: "Normal Draft", 420: "Ranked Solo/Duo", 430: "Normal Blind", 440: "Ranked Flex",
  450: "ARAM", 480: "Swiftplay", 490: "Quickplay", 700: "Clash", 720: "ARAM Clash",
  900: "ARURF", 1700: "Arena", 1900: "URF",
};

function QueryRecapInline({ graph, data, rank, baseline }: { graph: ExplorerGraph; data: QueryResult; rank: string | null; baseline: number | null }) {
  const subj = graph.subject;
  const allies = graph.constraints.filter((c) => c.type === "ally");
  const enemies = graph.constraints.filter((c) => c.type === "enemy");
  const cats = graph.categories ?? [];
  const items = subj.items ?? [];
  const exItems = subj.excludeItems ?? [];

  const scope = data.meta.mode === "all" ? "All patches" : data.meta.patch ? `Patch ${data.meta.patch}` : "Current patch";
  const queues = graph.filters?.queues ?? [];
  const queueLabel = queues.length === 0 ? "All queues" : queues.map((q) => QUEUE_LABEL[q] ?? `Queue ${q}`).join(", ");
  const regions = graph.filters?.platforms ?? [];
  const regionLabel = regions.length === 0 ? "All regions" : regions.map((r) => r.toUpperCase().replace(/\d+$/, "")).join(", ");
  const output =
    graph.output.kind === "rank"
      ? `Ranking ${graph.output.dimension === "item" ? "items" : graph.output.dimension === "ally" ? "allies" : "enemies"} by weighted lift`
      : "Champion stats";
  const outLimits =
    graph.output.kind === "rank"
      ? `top ${graph.output.limit ?? 25}${graph.output.minGames ? ` · ≥${graph.output.minGames}g` : ""}`
      : null;
  const hasConstraints = allies.length > 0 || enemies.length > 0 || cats.length > 0 || items.length > 0 || exItems.length > 0;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {/* one light line of filters — no card, low weight */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-chakrapetch text-flash/55 leading-tight">
        <span><b className="text-flash tabular-nums">{data.meta.games.toLocaleString()}</b> games</span>
        <Sep /><span>{scope}</span>
        <Sep /><span>{rank ?? "All ranks"}</span>
        <Sep /><span>{queueLabel}</span>
        <Sep /><span>{regionLabel}</span>
        <Sep /><span className="text-jade/75">{output}{outLimits ? <span className="text-jade/45"> · {outLimits}</span> : null}</span>
        {baseline != null && (
          <>
            <Sep />
            <CyberTip side="bottom" tip={<><b className="text-flash">Baseline winrate</b> — {graph.subject.champion}'s overall winrate in this filter. The <b className="text-jade">lift</b> on every item is measured against this.</>}>
              <span className="cursor-help text-flash/70 underline decoration-dotted decoration-flash/25 underline-offset-2">base {baseline}%</span>
            </CyberTip>
          </>
        )}
      </div>

      {/* constraint chips (only when the query has any) */}
      {hasConstraints && (
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((id) => <ChipMini key={`i${id}`} icon={itemIcon(id)} label={itemName(id)} />)}
          {exItems.map((id) => <ChipMini key={`x${id}`} icon={itemIcon(id)} label={itemName(id)} tone="bad" prefix="no" />)}
          {allies.map((c, i) => <ChipMini key={`a${i}`} icon={c.champion ? champIcon(c.champion) : undefined} label={c.champion ?? "any"} tone={c.negate ? "bad" : "ally"} prefix={c.negate ? "no ally" : "ally"} />)}
          {enemies.map((c, i) => <ChipMini key={`e${i}`} icon={c.champion ? champIcon(c.champion) : undefined} label={c.champion ?? "any"} tone={c.negate ? "bad" : "enemy"} prefix={c.negate ? "no vs" : "vs"} />)}
          {cats.map((cc, i) => <ChipMini key={`c${i}`} icon={categoryHasIcon(cc.cls) ? categoryIcon(cc.cls) : undefined} label={CATEGORY_LABEL[cc.cls] ?? cc.cls} tone="cat" prefix={`${cc.side === "ally" ? "ally" : "enemy"} ≥${cc.min}`} contain />)}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <span className="text-flash/25">·</span>;
}

function ChipMini({ icon, label, tone = "neutral", prefix, contain }: { icon?: string; label: string; tone?: "neutral" | "bad" | "ally" | "enemy" | "cat"; prefix?: string; contain?: boolean }) {
  const toneCls =
    tone === "bad" ? "border-error/25 bg-error/[0.05]"
      : tone === "enemy" ? "border-error/15 bg-error/[0.03]"
        : tone === "ally" ? "border-jade/20 bg-jade/[0.04]"
          : tone === "cat" ? "border-citrine/25 bg-citrine/[0.05]"
            : "border-hairline/10 bg-filmlight/[0.03]";
  const prefixCls = tone === "cat" ? "text-citrine/90" : tone === "bad" ? "text-error/75" : "text-flash/35";
  return (
    <span className={cn("flex items-center gap-1 pl-1 pr-1.5 py-[1px] rounded-[5px] border", toneCls)} title={label}>
      {prefix && <span className={cn("text-[8px] font-chakrapetch font-bold uppercase tracking-[0.06em]", prefixCls)}>{prefix}</span>}
      {icon && <img src={icon} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} className={cn("w-4 h-4", contain ? "object-contain" : "rounded-[3px] border border-hairline/10")} alt="" />}
      <span className="text-[9.5px] font-chakrapetch text-flash/75">{label}</span>
    </span>
  );
}

function summarise(g: ExplorerGraph): string {
  const bits: string[] = [];
  const allies = g.constraints.filter((c) => c.type === "ally").length;
  const enemies = g.constraints.filter((c) => c.type === "enemy").length;
  if (allies) bits.push(`${allies} ally${allies > 1 ? "s" : ""}`);
  if (enemies) bits.push(`${enemies} enemy${enemies > 1 ? "ies" : ""}`);
  const items = (g.subject.items?.length ?? 0) + g.constraints.reduce((s, c) => s + (c.items?.length ?? 0), 0);
  if (items) bits.push(`${items} item${items > 1 ? "s" : ""}`);
  if (g.output.kind === "rank") bits.push(`ranking ${g.output.dimension}`);
  return bits.length ? bits.join(" · ") : "subject only";
}
