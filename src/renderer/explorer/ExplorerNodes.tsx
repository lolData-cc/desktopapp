// ExplorerNodes.tsx — the glass/glow node cards. One component switches on the
// node type; `nodeTypes` maps every kind to it. Dropdowns use the shared
// searchdialog-style pickers; type is chakrapetch throughout.

import { createContext, useContext, useState, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow, type NodeProps, type Edge } from "@xyflow/react";
import { X, ChevronDown } from "lucide-react";
import { MODULE_GLYPH, type ModuleIcon } from "./module-icons";
import { cn } from "@/lib/utils";
import { champDisplayName } from "@/config";
import { ChampionDialog } from "@/ui/champion-dialog";
import { KeystoneDialog } from "@/ui/keystone-dialog";
import { getKeystoneIcon, getKeystoneName } from "@/constants/runes";
import {
  ROLES, ROLE_LABEL, champIcon, itemIcon, itemName, CATEGORY_GROUPS, CATEGORY_LABEL,
} from "./catalog";
import { ExplorerSelect } from "./Pickers";
import { categoryGlyph } from "./category-glyphs";
import { ItemDialog } from "@/ui/item-dialog";

type Meta = { label: string; accent: string; Icon: ModuleIcon };
const META: Record<string, Meta> = {
  subject: { label: "SUBJECT", accent: "#00d992", Icon: MODULE_GLYPH.subject },
  ally: { label: "WITH · ALLY", accent: "#36d3ff", Icon: MODULE_GLYPH.ally },
  enemy: { label: "VS · ENEMY", accent: "#ff6286", Icon: MODULE_GLYPH.enemy },
  item: { label: "ITEM", accent: "#FFB615", Icon: MODULE_GLYPH.item },
  rune: { label: "RUNE", accent: "#b483ff", Icon: MODULE_GLYPH.rune },
  filter: { label: "FILTER", accent: "#d7d8d9", Icon: MODULE_GLYPH.filter },
  output: { label: "OUTPUT", accent: "#00d992", Icon: MODULE_GLYPH.output },
  exclude: { label: "EXCLUDE", accent: "#ff5470", Icon: MODULE_GLYPH.exclude },
};

// Connection topology rule, shared by the canvas's isValidConnection AND each
// node (so a node can tell when it's a valid drop target for the wire currently
// being dragged, and pulse its input). ally/enemy/item/rune/filter feed the
// Subject; items/runes also feed an ally/enemy; only Subject/filter feed Output.
export function isValidPair(sourceType?: string | null, targetType?: string | null): boolean {
  if (!sourceType || !targetType) return false;
  if (targetType === "output") return sourceType === "subject" || sourceType === "filter";
  if (targetType === "subject") return ["ally", "enemy", "item", "rune", "filter"].includes(sourceType);
  if (targetType === "ally" || targetType === "enemy") return sourceType === "item" || sourceType === "rune";
  return false;
}

// The node currently being dragged FROM (set by the canvas on connect-start), so
// valid target nodes can pulse their input handle.
export const ConnectingContext = createContext<{ sourceId: string | null; sourceType: string | null }>({
  sourceId: null,
  sourceType: null,
});

// true while the EXCLUDE submodule chip is being dragged → negatable modules glow
// as valid drop targets.
export const ExcludeDragContext = createContext<boolean>(false);

// ── option sets (built once) ──
const ROLE_OPTS = [{ value: "", label: "Any role" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))];
const SCOPE_OPTS = [{ value: "current_patch", label: "Current patch · fast" }, { value: "all", label: "All patches · season" }];
const TIER_OPTS = [{ value: "", label: "All ranks" }, { value: "CHALLENGER,GRANDMASTER,MASTER", label: "Master+" }, { value: "CHALLENGER,GRANDMASTER", label: "GM+" }, { value: "CHALLENGER", label: "Challenger" }];
const QUEUE_OPTS = [{ value: "420,440", label: "Ranked · Solo+Flex" }, { value: "420", label: "Solo / Duo" }, { value: "440", label: "Flex" }];
// Region = the match's platform (stored lowercase on `matches.platform`, e.g.
// "euw1"). "All regions" = no filter. Values can be comma lists (a routing region
// like Europe = euw1,eun1) but single-platform is the common pick.
const REGION_OPTS = [
  { value: "", label: "All regions" },
  { value: "euw1", label: "EUW" },
  { value: "eun1", label: "EUNE" },
  { value: "na1", label: "NA" },
  { value: "kr", label: "KR" },
  { value: "oc1", label: "OCE" },
  { value: "br1", label: "BR" },
];
// Build slot = the Nth COMPLETED item a champion bought (purchase order from the
// timeline). "Any slot" = the old "owns this item in final inventory" behaviour.
const SLOT_OPTS = [
  { value: "0", label: "Any slot" },
  { value: "1", label: "1st item" },
  { value: "2", label: "2nd item" },
  { value: "3", label: "3rd item" },
  { value: "4", label: "4th item" },
  { value: "5", label: "5th item" },
  { value: "6", label: "6th item" },
];
const MODE_OPTS = [{ value: "stats", label: "Winrate + stats" }, { value: "rank", label: "Top-N ranking" }];
const DIM_OPTS = [{ value: "ally", label: "Allies" }, { value: "enemy", label: "Enemies" }, { value: "item", label: "Items" }];
// Champion-category team-comp filter on an ally/enemy node: "the team has ≥N of
// this category" (e.g. enemy ≥3 Assassins, ally ≥2 AP). Grouped into Damage /
// Class / Range so the 10 options read as 3 short sections; each option's leading
// glyph (class crest, or gold AD/AP/Melee/Ranged emblem) comes from categoryGlyph.
const CATEGORY_GROUPED = [
  { options: [{ value: "", label: "any comp" }] },
  ...CATEGORY_GROUPS.map((g) => ({
    label: g.label,
    options: g.members.map((m) => ({ value: m, label: CATEGORY_LABEL[m] })),
  })),
];
const CAT_MIN_OPTS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n}` }));

const dotStyle = (accent: string): React.CSSProperties => ({
  width: 11, height: 11, background: "#05100d",
  border: `2px solid ${accent}`, boxShadow: `0 0 7px ${accent}aa`,
});

const numCls =
  "nodrag w-full h-8 bg-filmdark/40 border border-jade/25 rounded-[4px] px-2 " +
  "font-chakrapetch text-[12px] text-flash outline-none focus:border-jade/50";

// Walk edges backward from a node to collect it + everything attached UPSTREAM
// of it: its own items/runes, and (for a champion) its ally/enemy sub-modules
// and THEIR items/runes. Used by the ✕ long-press to cascade-remove a module
// together with its inputs. The Output sits DOWNSTREAM, so it's never swept up;
// an attached EXCLUDE is a flag on the host node and goes when the host goes.
function nodeWithUpstream(rootId: string, edges: Edge[]): string[] {
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const t = stack.pop()!;
    for (const e of edges) {
      if (e.target === t && !ids.has(e.source)) { ids.add(e.source); stack.push(e.source); }
    }
  }
  return [...ids];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[8px] font-chakrapetch font-semibold tracking-[0.14em] uppercase text-flash/35">{label}</span>
      {children}
    </label>
  );
}

export function ExplorerNode({ id, type, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const set = (patch: Record<string, unknown>) => rf.updateNodeData(id, patch);
  const meta = META[type as string] ?? META.subject;

  // ✕ behaviour: a quick click removes JUST this module. The ring stays HIDDEN
  // until you've held past REVEAL_MS (so a fast click never flashes it); then it
  // appears and fills over RING_MS, and holding to the end (HOLD_MS) removes this
  // module + everything attached upstream. Released before the ring shows → single
  // delete; released once it's charging, or dragged off → cancel (no delete).
  const REVEAL_MS = 500;            // ring hidden until held at least this long
  const RING_MS = 500;              // then it fills over this
  const HOLD_MS = REVEAL_MS + RING_MS;
  const [holding, setHolding] = useState(false);
  const revealRef = useRef<number | undefined>(undefined);
  const cascadeRef = useRef<number | undefined>(undefined);
  const chargingRef = useRef(false);
  const clearHold = () => {
    if (revealRef.current) clearTimeout(revealRef.current);
    if (cascadeRef.current) clearTimeout(cascadeRef.current);
    revealRef.current = cascadeRef.current = undefined;
  };
  useEffect(() => clearHold, []);
  const startHold = (e: React.PointerEvent) => {
    e.stopPropagation();
    chargingRef.current = false;
    revealRef.current = window.setTimeout(() => {
      revealRef.current = undefined;
      chargingRef.current = true;
      setHolding(true); // ring appears + animates over RING_MS
    }, REVEAL_MS);
    cascadeRef.current = window.setTimeout(() => {
      clearHold();
      chargingRef.current = false;
      setHolding(false);
      rf.deleteElements({ nodes: nodeWithUpstream(id, rf.getEdges()).map((n) => ({ id: n })) });
    }, HOLD_MS);
  };
  const endHold = (e: React.PointerEvent, fromLeave: boolean) => {
    e.stopPropagation();
    if (!revealRef.current && !cascadeRef.current) return; // already cascaded / nothing pending
    const wasCharging = chargingRef.current;
    clearHold();
    chargingRef.current = false;
    setHolding(false);
    // quick tap (released before the ring showed, on the button) → just this module.
    // released while the ring was charging, or dragged off → cancel.
    if (!wasCharging && !fromLeave) rf.deleteElements({ nodes: [{ id }] });
  };
  const d = data as any;
  // ally/enemy can stay champion-agnostic ("Any") and rely on an attached item /
  // rune — e.g. "vs ANY enemy that builds Death's Dance". The Subject must be a
  // concrete champion.
  const anyChamp = type === "ally" || type === "enemy";
  // champion nodes accept Item/Rune attachments; everything still feeds Output
  const hasIn = type === "output" || type === "subject" || type === "ally" || type === "enemy";
  const hasOut = type !== "output" && type !== "exclude"; // the Exclude block has no handles — it attaches by drop, never wires

  // the EXCLUDE submodule (data.exclude, attached via right-click) negates this
  // module → renders a strip on its bottom and means "winrate WITHOUT this".
  const canExclude = type === "item" || type === "rune" || type === "ally" || type === "enemy";
  const excluded = canExclude && d.exclude === true;
  // glow as a drop target while an EXCLUDE chip is being dragged
  const excludeDragging = useContext(ExcludeDragContext);
  const droppable = excludeDragging && canExclude && !excluded;

  // while a wire is being dragged from another node, pulse this node's input if
  // it's a valid drop target — so it's obvious where the connection should land.
  const connecting = useContext(ConnectingContext);
  const pulseIn = hasIn && !!connecting.sourceId && connecting.sourceId !== id && isValidPair(connecting.sourceType, type as string);

  return (
    <div
      className={cn(
        "group relative w-[224px] rounded-[7px] border bg-[rgba(8,14,16,0.86)] backdrop-blur-md transition-colors",
        selected ? "border-transparent" : excluded ? "border-error/45" : "border-hairline/10",
        excluded && "rounded-b-none border-b-error/30", // bottom edge mates with the EXCLUDE piece keyed beneath
        droppable && "ring-2 ring-error/70 ring-offset-2 ring-offset-[#05090b] border-error/50"
      )}
      style={{
        boxShadow: selected
          ? `0 0 0 1px ${meta.accent}, 0 8px 30px rgba(0,0,0,.55), 0 0 22px ${meta.accent}33`
          : "0 8px 26px rgba(0,0,0,.5)",
      }}
    >
      {/* accent header */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-[7px]"
        style={{ background: `linear-gradient(90deg, ${meta.accent}22, transparent)`, borderBottom: `1px solid ${meta.accent}33` }}
      >
        <meta.Icon size={12} style={{ color: meta.accent }} />
        <span className="text-[10px] font-chakrapetch font-bold tracking-[0.16em]" style={{ color: meta.accent }}>
          {meta.label}
        </span>
        {/* remove module — anchored right inside the header, shown on node hover.
            Click = remove this module; HOLD = remove it + everything attached. */}
        <button
          type="button"
          title="Click to remove · hold to remove with everything attached"
          onPointerDown={startHold}
          onPointerUp={(e) => endHold(e, false)}
          onPointerLeave={(e) => endHold(e, true)}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "nodrag nopan relative ml-auto -mr-1 grid place-items-center w-4 h-4 rounded-[3px] transition-all cursor-clicker",
            holding ? "text-error bg-error/10 opacity-100" : "text-flash/45 opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10"
          )}
        >
          <X size={11} strokeWidth={2.5} />
          {holding && (
            <svg className="absolute inset-[-4px] pointer-events-none" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,84,112,0.2)" strokeWidth="2" />
              <circle
                cx="12" cy="12" r="10" stroke="#ff5470" strokeWidth="2" strokeLinecap="round"
                strokeDasharray="62.83" transform="rotate(-90 12 12)"
                className="explorer-hold-ring" style={{ animationDuration: `${RING_MS}ms` }}
              />
            </svg>
          )}
        </button>
      </div>

      {/* body */}
      <div className="flex flex-col gap-2 p-2.5">
        {type === "exclude" && (
          <p className="text-[10px] font-chakrapetch text-flash/50 leading-snug">
            Drag onto an <span className="text-citrine/80">item</span>, <span className="text-[#b483ff]">rune</span> or <span className="text-error/80">ally/enemy</span> to negate it — the winrate <span className="text-flash/80">without</span> it.
          </p>
        )}
        {(type === "subject" || type === "ally" || type === "enemy") && (
          <>
            <Field label="Champion">
              <ChampionDialog
                value={d.champion || null}
                onSelect={(c) => set({ champion: c.slug })}
                allowAny={anyChamp}
                onAny={anyChamp ? () => set({ champion: undefined }) : undefined}
                title={anyChamp ? "Select champion · or Any" : "Select champion"}
                trigger={
                  <button
                    className={cn(
                      "nodrag group w-full h-9 px-2 gap-2 rounded-[4px] cursor-clicker outline-none flex items-center border bg-filmdark/40 backdrop-blur-lg transition-all duration-200",
                      d.champion ? "border-jade/30 hover:border-jade/50" : anyChamp ? "border-jade/20 hover:border-jade/40" : "border-hairline/10 hover:border-hairline/20"
                    )}
                  >
                    {d.champion ? (
                      <img src={champIcon(d.champion)} className="w-6 h-6 rounded-[3px] border border-hairline/10 shrink-0" alt="" draggable={false} />
                    ) : anyChamp ? (
                      <div className="w-6 h-6 rounded-[3px] grid place-items-center bg-jade/[0.06] border border-jade/25 shrink-0">
                        <span className="text-jade text-[13px] leading-none font-chakrapetch">∀</span>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-[3px] bg-filmdark/40 border border-hairline/10 shrink-0" />
                    )}
                    <span className={cn("flex-1 text-left truncate font-chakrapetch text-[12px]", d.champion ? "text-flash" : anyChamp ? "text-jade/70" : "text-flash/40")}>
                      {d.champion ? champDisplayName(d.champion) : anyChamp ? "Any champion" : "Pick a champion"}
                    </span>
                    <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                }
              />
            </Field>
            <Field label="Role">
              <ExplorerSelect value={d.role ?? ""} onChange={(v) => set({ role: v })} options={ROLE_OPTS} placeholder="Any role" />
            </Field>
          </>
        )}

        {(type === "ally" || type === "enemy") && (
          <Field label="Team comp">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <ExplorerSelect
                  value={d.category ?? ""}
                  onChange={(v) => set({ category: v || undefined })}
                  groups={CATEGORY_GROUPED}
                  renderIcon={categoryGlyph}
                  placeholder="any comp"
                />
              </div>
              {d.category && (
                <div className="w-[68px] shrink-0">
                  <ExplorerSelect value={String(d.categoryMin ?? 2)} onChange={(v) => set({ categoryMin: Number(v) || 2 })} options={CAT_MIN_OPTS} />
                </div>
              )}
            </div>
          </Field>
        )}

        {type === "item" && (
          <>
            <Field label="Item">
              <ItemDialog
                value={d.itemId ?? null}
                onSelect={(it) => set({ itemId: it.id })}
                title="Select item"
                trigger={
                  <button
                    className={cn(
                      "nodrag group w-full h-9 px-2 gap-2 rounded-[4px] cursor-clicker outline-none flex items-center border bg-filmdark/40 backdrop-blur-lg transition-all duration-200",
                      d.itemId ? "border-citrine/30 hover:border-citrine/50" : "border-hairline/10 hover:border-hairline/20"
                    )}
                  >
                    {d.itemId ? (
                      <img src={itemIcon(d.itemId)} className="w-6 h-6 rounded-[3px] border border-hairline/10 shrink-0" alt="" draggable={false} />
                    ) : (
                      <div className="w-6 h-6 rounded-[3px] bg-filmdark/40 border border-hairline/10 shrink-0" />
                    )}
                    <span className={cn("flex-1 text-left truncate font-chakrapetch text-[12px]", d.itemId ? "text-flash" : "text-flash/40")}>
                      {d.itemId ? itemName(d.itemId) : "Pick an item"}
                    </span>
                    <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                }
              />
            </Field>
            <Field label="Build slot">
              <ExplorerSelect value={String(d.slot ?? 0)} onChange={(v) => set({ slot: Number(v) || undefined })} options={SLOT_OPTS} />
            </Field>
          </>
        )}

        {type === "rune" && (
          <Field label="Keystone">
            <KeystoneDialog
              selectedKeystone={d.keystone ?? null}
              onSelect={(_treeId, keystoneId) => set({ keystone: keystoneId })}
              trigger={
                <button
                  className={cn(
                    "nodrag group w-full h-9 px-2 gap-2 rounded-[4px] cursor-clicker outline-none flex items-center border bg-filmdark/40 backdrop-blur-lg transition-all duration-200",
                    d.keystone ? "border-jade/30 hover:border-jade/50" : "border-hairline/10 hover:border-hairline/20"
                  )}
                >
                  {d.keystone && getKeystoneIcon(d.keystone) ? (
                    <img src={getKeystoneIcon(d.keystone)!} className="w-6 h-6 rounded-full border border-hairline/10 shrink-0" alt="" draggable={false} />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-filmdark/40 border border-hairline/10 shrink-0" />
                  )}
                  <span className={cn("flex-1 text-left truncate font-chakrapetch text-[12px]", d.keystone ? "text-flash" : "text-flash/40")}>
                    {d.keystone ? (getKeystoneName(d.keystone) ?? "Keystone") : "Pick a keystone"}
                  </span>
                  <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              }
            />
          </Field>
        )}

        {type === "filter" && (
          <>
            <Field label="Scope">
              <ExplorerSelect value={d.scope ?? "current_patch"} onChange={(v) => set({ scope: v })} options={SCOPE_OPTS} />
            </Field>
            <Field label="Tier">
              <ExplorerSelect value={(d.tiers ?? []).join(",")} onChange={(v) => set({ tiers: v ? v.split(",") : [] })} options={TIER_OPTS} placeholder="All ranks" />
            </Field>
            <Field label="Queue">
              <ExplorerSelect value={(d.queues ?? [420, 440]).join(",")} onChange={(v) => set({ queues: v.split(",").map(Number) })} options={QUEUE_OPTS} />
            </Field>
            <Field label="Region">
              <ExplorerSelect value={(d.platforms ?? []).join(",")} onChange={(v) => set({ platforms: v ? v.split(",") : [] })} options={REGION_OPTS} placeholder="All regions" />
            </Field>
          </>
        )}

        {type === "output" && (
          <>
            <Field label="Result">
              <ExplorerSelect value={d.mode ?? "stats"} onChange={(v) => set({ mode: v })} options={MODE_OPTS} />
            </Field>
            {d.mode === "rank" && (
              <>
                <Field label="Rank by">
                  <ExplorerSelect value={d.dimension ?? "ally"} onChange={(v) => set({ dimension: v })} options={DIM_OPTS} />
                </Field>
                {(d.dimension ?? "ally") !== "item" && (
                  <Field label="Restrict role">
                    <ExplorerSelect value={d.role ?? ""} onChange={(v) => set({ role: v })} options={ROLE_OPTS} placeholder="Any role" />
                  </Field>
                )}
                <div className="flex gap-2">
                  <Field label="Top N">
                    <input type="number" min={1} max={50} className={numCls} value={d.limit ?? 5}
                      onChange={(e) => set({ limit: Math.max(1, Math.min(50, Number(e.target.value) || 5)) })} />
                  </Field>
                  <Field label="Min games">
                    <input type="number" min={1} className={numCls} value={d.minGames ?? 5}
                      onChange={(e) => set({ minGames: Math.max(1, Number(e.target.value) || 5) })} />
                  </Field>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* EXCLUDE submodule — a riveted red panel keyed onto the module's bottom
          edge ("winrate WITHOUT this module"). Borders run to the module's outer
          edge (left/right -1px) so the seam lines up exactly. */}
      {excluded && (
        <div className="absolute top-full left-[-1px] right-[-1px] z-10 -mt-px select-none">
          <div className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-b-[7px] border border-t-0 border-error/45 bg-[rgba(13,13,15,0.9)] shadow-[0_3px_8px_rgba(var(--c-shadow),0.3)]">
            <span className="absolute left-1.5 bottom-1.5 w-[3px] h-[3px] rounded-full bg-[#1a0408] border border-error/45" />
            <span className="absolute right-1.5 bottom-1.5 w-[3px] h-[3px] rounded-full bg-[#1a0408] border border-error/45" />
            <span className="grid place-items-center w-5 h-5 rounded-[3px] bg-error/15 border border-error/30 shrink-0">
              <MODULE_GLYPH.exclude size={12} style={{ color: "#ff5470" }} />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] font-chakrapetch font-bold tracking-[0.16em] uppercase text-error">Excluded</span>
              <span className="text-[7px] font-chakrapetch uppercase tracking-[0.12em] text-error/55 mt-0.5">winrate without</span>
            </div>
            <button
              type="button"
              title="Remove exclude submodule"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); set({ exclude: false }); }}
              className="nodrag nopan ml-auto grid place-items-center w-4 h-4 rounded-[3px] text-error/55 hover:text-error hover:bg-error/15 transition-colors cursor-clicker"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {hasIn && <Handle type="target" position={Position.Left} style={dotStyle(meta.accent)} className={pulseIn ? "explorer-handle-pulse" : undefined} />}
      {hasOut && <Handle type="source" position={Position.Right} style={dotStyle(meta.accent)} />}
    </div>
  );
}

export const nodeTypes = {
  subject: ExplorerNode, ally: ExplorerNode, enemy: ExplorerNode,
  item: ExplorerNode, rune: ExplorerNode, filter: ExplorerNode, output: ExplorerNode,
  exclude: ExplorerNode,
};
