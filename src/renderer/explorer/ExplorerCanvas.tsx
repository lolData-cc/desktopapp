// ExplorerCanvas.tsx — the node-based query builder (Learn ▸ EXPLORER).
//
// Full-bleed canvas grid; floating UI (palette, run, zoom, minimap) is locked
// to the page content column so nothing hugs the screen edge. v1 runs on mock
// data; the same compiled graph will hit /api/explorer/query once wired.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  addEdge, reconnectEdge, useNodesState, useEdgesState, useReactFlow, type Connection, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./explorer.css";
import { Play, Loader2, X, Plus, Minus, Maximize, Eraser, Maximize2, BookmarkPlus, Check, Layers, Trash2, ChevronRight, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { showCyberToast } from "@/lib/toast-utils";
import { DiamondButton } from "@/ui/diamond-button";
import { MODULE_GLYPH, type ModuleIcon } from "./module-icons";
import { nodeTypes, ConnectingContext, ExcludeDragContext, isValidPair } from "./ExplorerNodes";
import { edgeTypes } from "./GlowEdge";
import { compileGraph, runQuery, runPatchVariation } from "./graph";
import { champIcon, itemIcon, itemName } from "./catalog";
import { DeepDive } from "./DeepDive";
import { MiniBuildPath } from "./MiniBuildPath";
import { CyberTip } from "./CyberTip";
import { isSnapshottable, isSaved, getSnapshots, saveSnapshot, deleteSnapshot, graphToCanvas, type Snapshot } from "./snapshots";
import type { ExplorerGraph, QueryResult, PatchVariationRow } from "./types";
import { ExplorerTutorial } from "@/explorer/explorer-tutorial";

const DEFAULTS: Record<string, Record<string, unknown>> = {
  subject: { champion: "", role: "" },
  ally: { champion: "", role: "" },
  enemy: { champion: "", role: "" },
  item: { itemId: undefined },
  rune: { keystone: undefined },
  filter: { scope: "current_patch", tiers: [], queues: [420, 440], platforms: [] },
  output: { mode: "rank", dimension: "ally", role: "UTILITY", limit: 5, minGames: 5 },
  exclude: {},
};

const PALETTE: { kind: string; label: string; Icon: ModuleIcon; accent: string }[] = [
  { kind: "subject", label: "Subject", Icon: MODULE_GLYPH.subject, accent: "#00d992" },
  { kind: "ally", label: "Ally", Icon: MODULE_GLYPH.ally, accent: "#36d3ff" },
  { kind: "enemy", label: "Enemy", Icon: MODULE_GLYPH.enemy, accent: "#ff6286" },
  { kind: "item", label: "Item", Icon: MODULE_GLYPH.item, accent: "#FFB615" },
  { kind: "rune", label: "Rune", Icon: MODULE_GLYPH.rune, accent: "#b483ff" },
  { kind: "filter", label: "Filter", Icon: MODULE_GLYPH.filter, accent: "#d7d8d9" },
  { kind: "output", label: "Output", Icon: MODULE_GLYPH.output, accent: "#00d992" },
];

// start empty — a centered "+" CTA shows until the first node lands
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// "2h ago" relative time for the snapshots list
function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Canvas({ onBack }: { onBack?: () => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [result, setResult] = useState<{ res: QueryResult; graph: ExplorerGraph } | null>(null);
  const [running, setRunning] = useState(false);
  // right-click menu. `target` = the negatable module under the cursor (item/rune/
  // ally/enemy), which unlocks the SUBMODULE section (attach/detach EXCLUDE).
  const [ctx, setCtx] = useState<{ x: number; y: number; target?: { id: string; type: string; exclude: boolean } } | null>(null);
  // negatable modules glow as drop targets while an Exclude block is dragged
  const [draggingExclude, setDraggingExclude] = useState(false);
  const [expanded, setExpanded] = useState(false); // deep-dive overlay
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => getSnapshots());
  const [snapsOpen, setSnapsOpen] = useState(false); // saved-snapshots list
  const [tutorialOpen, setTutorialOpen] = useState(false); // "what's that?" explorer tutorial
  const idRef = useRef(10);
  // touch long-press → opens the same context menu as desktop right-click
  // (so you can add a submodule by holding on empty canvas on a phone)
  const lpTimer = useRef<number | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const rf = useReactFlow();

  // The Exclude block (a real canvas node, no handles) attaches by being DROPPED
  // overlapping a negatable module: set that module's `exclude` flag, then remove
  // the block. No wires — it just docks.
  const onNodeDragStart = useCallback((_e: unknown, node: Node) => {
    if (node.type === "exclude") setDraggingExclude(true);
  }, []);
  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    if (node.type !== "exclude") return;
    setDraggingExclude(false);
    const hit = rf.getIntersectingNodes(node).find((n) => ["item", "rune", "ally", "enemy"].includes(n.type as string));
    if (hit) {
      rf.updateNodeData(hit.id, { exclude: true });
      rf.deleteElements({ nodes: [{ id: node.id }] });
    }
  }, [rf]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, type: "glow" }, eds)),
    [setEdges]
  );

  // Detach a wire: grab either endpoint and drop it in empty space to delete it.
  // reconnectDone tracks whether the drag landed on a valid handle; if it didn't
  // (= dropped in the void), onReconnectEnd removes the edge.
  const reconnectDone = useRef(true);
  const onReconnectStart = useCallback(() => { reconnectDone.current = false; }, []);
  const onReconnect = useCallback((oldEdge: Edge, newConn: Connection) => {
    reconnectDone.current = true;
    setEdges((els) => reconnectEdge(oldEdge, newConn, els));
  }, [setEdges]);
  const onReconnectEnd = useCallback((_: unknown, edge: Edge) => {
    if (!reconnectDone.current) setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    reconnectDone.current = true;
  }, [setEdges]);

  // While a wire is being dragged, remember the source node so valid target nodes
  // can pulse their input handle (drag from Subject's out → Output's in pulses).
  const [connecting, setConnecting] = useState<{ sourceId: string | null; sourceType: string | null }>({ sourceId: null, sourceType: null });
  const onConnectStart = useCallback((_: unknown, p: { nodeId: string | null }) => {
    setConnecting({ sourceId: p.nodeId ?? null, sourceType: nodes.find((n) => n.id === p.nodeId)?.type ?? null });
  }, [nodes]);
  const onConnectEnd = useCallback(() => setConnecting({ sourceId: null, sourceType: null }), []);

  // Topology guard (shared with each node's input-pulse via isValidPair):
  // ally/enemy/item/rune/filter feed the SUBJECT (items/runes also feed an
  // ally/enemy); only the Subject/filter feed the Output.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => isValidPair(
      nodes.find((n) => n.id === c.source)?.type,
      nodes.find((n) => n.id === c.target)?.type
    ),
    [nodes]
  );

  // Add a node — at the right-click spot if given, else a default position.
  const addNode = (kind: string, screen?: { x: number; y: number }) => {
    const id = `${kind}-${++idRef.current}`;
    const position = screen
      ? rf.screenToFlowPosition(screen)
      : { x: 200 + Math.random() * 140, y: 130 + Math.random() * 120 };
    setNodes((ns) => [...ns, { id, type: kind, position, data: { ...DEFAULTS[kind] } }]);
    setCtx(null);
  };

  // wipe the canvas — modules, wires, and any open result/overlay
  const clearCanvas = () => { setNodes([]); setEdges([]); setResult(null); setExpanded(false); };

  // ── snapshots: save the current combo, list them, re-open (rebuild + re-run) ──
  const onSaveSnapshot = () => {
    if (!result) return;
    setSnapshots(saveSnapshot(result.graph, Date.now()));
    showCyberToast({ title: "Snapshot saved", description: "Re-open it any day for fresh numbers.", tag: "Explorer", variant: "status" });
  };
  const onDeleteSnapshot = (id: string) => {
    const next = deleteSnapshot(id);
    setSnapshots(next);
    if (next.length === 0) setSnapsOpen(false); // trigger button is gone — close the now-empty panel
  };
  const onOpenSnapshot = async (snap: Snapshot) => {
    setSnapsOpen(false);
    const { nodes: n, edges: e } = graphToCanvas(snap.graph);
    setNodes(n);
    setEdges(e);
    setRunning(true);
    try {
      const res = await runQuery(snap.graph); // re-run for fresh numbers
      setResult({ res, graph: snap.graph });
    } catch (e: any) {
      showCyberToast({ title: "Query failed", description: e?.message || "Is the backend running?", tag: "Explorer", variant: "error" });
    } finally {
      setRunning(false);
    }
    setTimeout(() => rf.fitView({ duration: 400, padding: 0.25 }), 80);
  };

  const run = async () => {
    const { graph, error } = compileGraph(nodes as any, edges);
    if (error || !graph) {
      showCyberToast({ title: error ?? "Invalid graph", tag: "Explorer", variant: "error" });
      return;
    }
    setRunning(true);
    try {
      const res = await runQuery(graph);
      setResult({ res, graph });
    } catch (e: any) {
      showCyberToast({
        title: "Query failed",
        description: e?.message || "Is the backend running?",
        tag: "Explorer",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#05090b]"
      onContextMenu={(e) => {
        // override the native browser menu everywhere on the canvas (pane, nodes,
        // empty-state, controls) with our custom one — but keep native on text fields
        if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) return;
        e.preventDefault();
        // which module did we right-click? ReactFlow tags node DOM with data-id.
        const nodeId = (e.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id") ?? undefined;
        const node = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
        const negatable = node && ["item", "rune", "ally", "enemy"].includes(node.type as string);
        setCtx({
          x: e.clientX, y: e.clientY,
          target: negatable ? { id: node!.id, type: node!.type as string, exclude: (node!.data as any)?.exclude === true } : undefined,
        });
      }}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true'], button, a")) return;
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const sx = t.clientX, sy = t.clientY;
        lpStart.current = { x: sx, y: sy };
        if (lpTimer.current) clearTimeout(lpTimer.current);
        lpTimer.current = window.setTimeout(() => {
          const el = document.elementFromPoint(sx, sy) as HTMLElement | null;
          const nodeId = el?.closest(".react-flow__node")?.getAttribute("data-id") ?? undefined;
          const node = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
          const negatable = node && ["item", "rune", "ally", "enemy"].includes(node.type as string);
          setCtx({ x: sx, y: sy, target: negatable ? { id: node!.id, type: node!.type as string, exclude: (node!.data as any)?.exclude === true } : undefined });
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
          lpTimer.current = null;
        }, 450);
      }}
      onTouchMove={(e) => {
        if (lpTimer.current && lpStart.current) {
          const t = e.touches[0];
          if (Math.hypot(t.clientX - lpStart.current.x, t.clientY - lpStart.current.y) > 12) {
            clearTimeout(lpTimer.current); lpTimer.current = null;
          }
        }
      }}
      onTouchEnd={() => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } }}
    >
      <ExcludeDragContext.Provider value={draggingExclude}>
      <ConnectingContext.Provider value={connecting}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "glow" }}
        defaultViewport={{ x: 90, y: 70, zoom: 0.72 }}
        minZoom={0.3}
        maxZoom={1.6}
        onPaneClick={() => setCtx(null)}
        proOptions={{ hideAttribution: true }}
        className="explorer-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="rgba(0,217,146,0.13)" />
      </ReactFlow>
      </ConnectingContext.Provider>
      </ExcludeDragContext.Provider>

      {/* floating UI — controls aligned to the content-column edges, in tune:
          a single diamond rail center-left (back + zoom), run top-right. */}
      <div className="absolute inset-0 pointer-events-none z-[2]">
        <div className="relative h-full w-full lg:w-[65%] mx-auto px-3 lg:px-0">
          {/* run — primary action, bottom right (desktop) */}
          <div className="hidden lg:block absolute bottom-4 right-0 pointer-events-auto">
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 rounded-[5px] font-chakrapetch text-[12px] font-bold tracking-[0.1em] uppercase text-jade border border-jade/40 bg-jade/10 hover:bg-jade/20 transition-all cursor-clicker disabled:opacity-50"
              style={{ boxShadow: "0 0 16px rgba(0,217,146,0.2)" }}
            >
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? "Crunching…" : "Run query"}
            </button>
          </div>

          {/* run — phone-only rhomboid, centred at the bottom */}
          <div className="lg:hidden absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={run}
              disabled={running}
              aria-label="Run query"
              className="grid place-items-center w-[68px] h-[68px] rotate-45 rounded-[16px] border border-jade/50 bg-jade/15 active:bg-jade/30 transition-all cursor-clicker disabled:opacity-50"
              style={{ boxShadow: "0 0 26px rgba(0,217,146,0.32)" }}
            >
              <span className="-rotate-45 flex flex-col items-center gap-0.5 text-jade">
                {running ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} className="ml-0.5" />}
                <span className="text-[8px] font-chakrapetch font-bold tracking-[0.12em] uppercase">{running ? "…" : "Run"}</span>
              </span>
            </button>
          </div>

          {/* back — diamond, center-left (desktop only; on phone you use the navbar) */}
          {onBack && (
            <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto">
              <DiamondButton icon="back" onClick={onBack} aria-label="Back to Learn" />
            </div>
          )}

          {/* zoom + clear — secondary controls, bottom-left.
              Desktop only: on phone you pinch-to-zoom and the eraser just clutters. */}
          <div className="absolute bottom-4 left-0 pointer-events-auto flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 rounded-[7px] border border-hairline/10 bg-[rgba(8,14,16,0.8)] backdrop-blur-md p-1 shadow-[0_6px_18px_rgba(var(--c-shadow),0.4)]">
              <button onClick={() => rf.zoomIn({ duration: 200 })} aria-label="Zoom in" className="grid place-items-center w-7 h-7 rounded-[5px] text-flash/45 hover:text-jade hover:bg-jade/10 transition-colors cursor-clicker"><Plus size={14} /></button>
              <button onClick={() => rf.zoomOut({ duration: 200 })} aria-label="Zoom out" className="grid place-items-center w-7 h-7 rounded-[5px] text-flash/45 hover:text-jade hover:bg-jade/10 transition-colors cursor-clicker"><Minus size={14} /></button>
              <span className="w-px h-4 bg-filmlight/10 mx-0.5" />
              <button onClick={() => rf.fitView({ duration: 300, padding: 0.2 })} aria-label="Fit view" className="grid place-items-center w-7 h-7 rounded-[5px] text-flash/45 hover:text-jade hover:bg-jade/10 transition-colors cursor-clicker"><Maximize size={12} /></button>
            </div>
            {/* clear screen — separate square box, same chrome (desktop only) */}
            <div className="hidden lg:block rounded-[7px] border border-hairline/10 bg-[rgba(8,14,16,0.8)] backdrop-blur-md p-1 shadow-[0_6px_18px_rgba(var(--c-shadow),0.4)]">
              <button onClick={clearCanvas} aria-label="Clear canvas" title="Clear canvas" className="grid place-items-center w-7 h-7 rounded-[5px] text-flash/45 hover:text-error hover:bg-error/10 transition-colors cursor-clicker"><Eraser size={13} /></button>
            </div>
            {/* what's that? — same box chrome as clear, but jade hover since it's
                informational; opens the Explorer tutorial (desktop only). */}
            <div className="hidden lg:block rounded-[7px] border border-hairline/10 bg-[rgba(8,14,16,0.8)] backdrop-blur-md p-1 shadow-[0_6px_18px_rgba(var(--c-shadow),0.4)]">
              <button onClick={() => setTutorialOpen(true)} aria-label="What's this?" title="What's this?" className="grid place-items-center w-7 h-7 rounded-[5px] text-flash/45 hover:text-jade hover:bg-jade/10 transition-colors cursor-clicker"><HelpCircle size={14} /></button>
            </div>
            {/* saved snapshots — appears once at least one snapshot exists */}
            {snapshots.length > 0 && (
              <div className="rounded-[7px] border border-hairline/10 bg-[rgba(8,14,16,0.8)] backdrop-blur-md p-1 shadow-[0_6px_18px_rgba(var(--c-shadow),0.4)]">
                <button onClick={() => setSnapsOpen((v) => !v)} aria-label="Saved snapshots" title="Saved snapshots" className={cn("relative grid place-items-center w-7 h-7 rounded-[5px] transition-colors cursor-clicker", snapsOpen ? "text-jade bg-jade/10" : "text-flash/45 hover:text-jade hover:bg-jade/10")}>
                  <Layers size={14} />
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 grid place-items-center rounded-full bg-jade text-[8px] font-chakrapetch font-bold text-[#03110c] leading-none">{snapshots.length}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* empty state — centered + with quick-add chips */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-5 pointer-events-auto">
            <button
              type="button"
              onClick={() => setCtx({ x: window.innerWidth / 2, y: window.innerHeight / 2 })}
              aria-label="Add module"
              className="group relative flex items-center justify-center w-16 h-16 rounded-full border border-jade/40 bg-jade/[0.08] hover:bg-jade/[0.15] hover:border-jade/70 transition-all cursor-clicker"
              style={{ boxShadow: "0 0 22px rgba(0,217,146,0.18)" }}
            >
              <Plus size={26} className="text-jade transition-transform duration-200 group-hover:scale-110" />
              <span className="absolute inset-[-6px] rounded-full border border-jade/25 animate-ping pointer-events-none" />
            </button>
            <div className="text-center">
              <p className="text-[15px] font-chakrapetch font-bold text-flash tracking-wide">Build a query from modules</p>
              <p className="text-[12px] font-chakrapetch text-flash/60 mt-1.5">
                Start with a <span className="text-jade font-semibold">Subject</span>, wire in constraints → an <span className="text-jade font-semibold">Output</span>
              </p>
              <p className="text-[10px] font-chakrapetch text-flash/45 mt-2 tracking-wide">
                <span className="lg:hidden">Tap ＋ or long-press the canvas to add modules</span>
                <span className="hidden lg:inline">Click ＋ or right-click the canvas to add modules</span>
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-[440px]">
              {PALETTE.map((p) => (
                <button
                  key={p.kind}
                  onClick={() => addNode(p.kind)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] border border-hairline/10 bg-[rgba(8,14,16,0.82)] hover:bg-filmlight/[0.06] hover:border-hairline/20 transition-colors cursor-clicker"
                >
                  <p.Icon size={12} style={{ color: p.accent }} />
                  <span className="text-[11px] font-chakrapetch text-flash/75">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* right-click context menu — add a node where you clicked */}
      {ctx && (
        <>
          <div
            className="fixed inset-0 z-[8]"
            onClick={() => setCtx(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}
          />
          <div
            className="explorer-surface outline-none fixed z-[9] w-[230px] sm:w-[248px] p-2 rounded-[8px] border border-jade/25 bg-[rgba(6,12,14,0.97)] backdrop-blur-xl shadow-[0_16px_44px_rgba(var(--c-shadow),0.7)] animate-in fade-in-0 zoom-in-95 duration-100"
            style={{ left: Math.min(ctx.x, window.innerWidth - 260), top: Math.min(ctx.y, window.innerHeight - 330) }}
          >
            {/* ADD MODULE — the usual modules, dropped where you clicked */}
            <div className="px-1 pb-1.5 mb-1.5 border-b border-hairline/[0.07] text-[8px] font-chakrapetch font-semibold tracking-[0.18em] uppercase text-jade/55">Add module</div>
            <div className="grid grid-cols-2 gap-1">
              {PALETTE.map((p) => (
                <button
                  key={p.kind}
                  onClick={() => addNode(p.kind, ctx)}
                  className="group flex items-center gap-2 px-2 py-2 rounded-[5px] border border-hairline/[0.05] bg-filmlight/[0.02] hover:bg-filmlight/[0.07] hover:border-hairline/15 transition-colors cursor-clicker text-left"
                >
                  <span className="grid place-items-center w-5 h-5 rounded-[4px] shrink-0" style={{ background: `${p.accent}1f` }}>
                    <p.Icon size={12} style={{ color: p.accent }} />
                  </span>
                  <span className="text-[11px] font-chakrapetch text-flash/75 group-hover:text-flash">{p.label}</span>
                </button>
              ))}
            </div>

            {/* ADD SUBMODULE — attaches onto the module you right-clicked */}
            <div className="px-1 pt-2.5 pb-1.5 mb-1.5 border-b border-hairline/[0.07] text-[8px] font-chakrapetch font-semibold tracking-[0.18em] uppercase text-error/55">Add submodule</div>
            <button
              onClick={() => addNode("exclude", ctx)}
              className="group w-full flex items-center gap-2 px-2 py-2 rounded-[5px] border border-error/25 bg-error/[0.07] hover:bg-error/[0.13] hover:border-error/45 transition-colors cursor-clicker text-left"
            >
              <span className="grid place-items-center w-5 h-5 rounded-[4px] shrink-0 bg-error/15">
                <MODULE_GLYPH.exclude size={12} style={{ color: "#ff5470" }} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-chakrapetch text-flash/85 group-hover:text-flash">Exclude</span>
                <span className="text-[8px] font-chakrapetch text-flash/40 leading-none mt-0.5 truncate">adds a block — drag it onto a module</span>
              </div>
            </button>
          </div>
        </>
      )}

      {/* results */}
      {result && (
        <ResultsPanel
          data={result.res}
          graph={result.graph}
          onClose={() => setResult(null)}
          onExpand={() => setExpanded(true)}
          onSave={onSaveSnapshot}
          canSave={isSnapshottable(result.graph)}
          saved={isSaved(result.graph)}
        />
      )}

      {/* deep dive — full-page expanded analysis, wipes in from the right sheet */}
      {expanded && result && (
        <DeepDive
          data={result.res}
          graph={result.graph}
          onClose={() => setExpanded(false)}
          onSave={onSaveSnapshot}
          canSave={isSnapshottable(result.graph)}
          saved={isSaved(result.graph)}
        />
      )}

      {/* saved snapshots list — floats above the bottom-left controls */}
      {snapsOpen && (
        <>
          <div className="absolute inset-0 z-[7] pointer-events-auto" onClick={() => setSnapsOpen(false)} />
          <div className="absolute bottom-[58px] left-4 z-[8] w-[calc(100vw-2rem)] sm:w-[300px] max-h-[52vh] flex flex-col rounded-[10px] border border-jade/20 bg-[rgba(6,12,14,0.97)] backdrop-blur-xl shadow-[0_18px_50px_rgba(var(--c-shadow),0.7)] overflow-hidden pointer-events-auto animate-[snapPanelIn_0.18s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline/[0.07]">
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-jade" />
                <span className="text-[10px] font-chakrapetch font-bold tracking-[0.2em] uppercase text-jade/70">Snapshots</span>
                <span className="text-[10px] font-chakrapetch text-flash/30 tabular-nums">{snapshots.length}</span>
              </div>
              <button onClick={() => setSnapsOpen(false)} className="text-flash/40 hover:text-flash cursor-clicker"><X size={13} /></button>
            </div>
            <div className="flex-1 overflow-y-auto cyber-scrollbar p-2 flex flex-col gap-1.5">
              {snapshots.length === 0 ? (
                <div className="px-3 py-6 text-center text-[10px] font-chakrapetch text-flash/35 leading-relaxed">
                  No snapshots yet. Build a combo with an item, rune, or ally, then hit <span className="text-jade/70">Save snapshot</span>.
                </div>
              ) : (
                snapshots.map((s) => (
                  <div key={s.id} className="group flex items-center gap-2 px-2.5 py-2 rounded-[6px] border border-hairline/[0.06] bg-filmlight/[0.02] hover:border-jade/30 hover:bg-jade/[0.05] transition-colors">
                    <button onClick={() => onOpenSnapshot(s)} className="flex-1 min-w-0 flex flex-col items-start text-left cursor-clicker">
                      <span className="text-[11px] font-chakrapetch font-semibold text-flash/90 truncate max-w-full group-hover:text-jade transition-colors">{s.name}</span>
                      <span className="text-[8px] font-chakrapetch uppercase tracking-[0.14em] text-flash/30 mt-0.5">saved {timeAgo(s.savedAt)} · re-runs live</span>
                    </button>
                    <button onClick={() => onOpenSnapshot(s)} title="Open & refresh" className="grid place-items-center w-6 h-6 rounded-[5px] text-flash/40 hover:text-jade hover:bg-jade/10 transition-colors cursor-clicker"><ChevronRight size={14} /></button>
                    <button onClick={() => onDeleteSnapshot(s.id)} title="Delete snapshot" className="grid place-items-center w-6 h-6 rounded-[5px] text-flash/30 hover:text-error hover:bg-error/10 transition-colors cursor-clicker"><Trash2 size={12} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* "What's that?" — the Explorer tutorial, opened from the help control.
          We're already on /learn/explorer, so DIVE INTO IT just closes it. */}
      <ExplorerTutorial
        open={tutorialOpen}
        champion="Ahri"
        onClose={() => setTutorialOpen(false)}
        onDive={() => setTutorialOpen(false)}
      />
    </div>
  );
}

function ResultsPanel({ data, graph, onClose, onExpand, onSave, canSave, saved }: { data: QueryResult; graph: ExplorerGraph; onClose: () => void; onExpand: () => void; onSave: () => void; canSave: boolean; saved: boolean }) {
  const isRank = data.columns.includes("dimension");
  const isItemDim = isRank && graph.output.kind === "rank" && graph.output.dimension === "item";
  const stat = data.rows[0] as Record<string, number | null> | undefined;
  // 0-game combos come back with null aggregates (avg_gold/winrate = null) —
  // an empty state avoids calling .toLocaleString() on null (which blanked the page).
  const empty = isRank ? data.rows.length === 0 : !stat || Number(stat.games) === 0;
  // the rank band the result was filtered to (from the Filter module's tiers)
  const rank = (() => {
    const t = graph.filters?.tiers;
    if (!t?.length) return null;
    const s = new Set(t);
    if (s.has("MASTER")) return "Master+";
    if (s.has("GRANDMASTER")) return "GM+";
    if (s.has("CHALLENGER")) return "Challenger";
    return t[0];
  })();

  return (
    <div className="absolute inset-x-0 bottom-0 lg:inset-x-auto lg:right-0 lg:top-0 h-[58%] lg:h-full w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-jade/15 bg-[rgba(5,10,12,0.94)] backdrop-blur-xl flex flex-col animate-[slideUp_0.3s_ease-out] lg:animate-[slideIn_0.25s_ease] z-[5]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline/[0.06]">
        <div className="flex flex-col">
          <span className="text-[10px] font-chakrapetch font-semibold tracking-[0.22em] uppercase text-jade/65">Result</span>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[19px] font-chakrapetch font-bold tabular-nums leading-none text-flash">{data.meta.games.toLocaleString()}</span>
            <span className="text-[9px] font-chakrapetch uppercase tracking-[0.18em] text-flash/40 -ml-0.5">games</span>
            <span className="px-2 py-0.5 rounded-[4px] bg-jade/10 border border-jade/30 text-[9px] font-chakrapetch font-bold uppercase tracking-[0.12em] text-jade">
              {data.meta.mode === "all" ? "all patches" : data.meta.patch ? `patch ${data.meta.patch}` : "current patch"}
            </span>
            {rank && (
              <span className="px-2 py-0.5 rounded-[4px] bg-citrine/10 border border-citrine/30 text-[9px] font-chakrapetch font-bold uppercase tracking-[0.12em] text-citrine">
                {rank}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-flash/40 hover:text-flash cursor-clicker"><X size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto cyber-scrollbar p-4">
        {graph.subject.champion && (
          <div className="flex items-center gap-2 mb-4">
            <img src={champIcon(graph.subject.champion)} className="w-8 h-8 rounded-[4px] border border-jade/30" alt="" />
            <div className="flex flex-col">
              <span className="text-[13px] font-chakrapetch font-semibold text-flash">{graph.subject.champion}</span>
              <span className="text-[9px] font-chakrapetch text-flash/35 uppercase tracking-wider">
                {graph.constraints.length} constraint{graph.constraints.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        )}

        {empty ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-3 gap-2.5">
            <span className="text-[30px] leading-none text-jade/40">∅</span>
            <span className="text-[12px] font-chakrapetch text-flash/70">No games match this combo</span>
            <span className="text-[10px] font-chakrapetch text-flash/35 leading-relaxed">
              Each item, rune, and ally narrows the pool — remove a constraint or widen the scope to All patches.
            </span>
          </div>
        ) : !isRank ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col items-center py-3 rounded-[6px] border border-jade/15 bg-jade/[0.04]">
              <span className="text-[42px] leading-none font-chakrapetch font-bold tabular-nums text-jade">{stat!.winrate ?? 0}%</span>
              <span className="text-[9px] font-chakrapetch tracking-[0.2em] uppercase text-flash/40 mt-1.5">winrate</span>
            </div>
            {(() => {
              const k = Number(stat!.avg_kills ?? 0), d = Number(stat!.avg_deaths ?? 0), a = Number(stat!.avg_assists ?? 0);
              const ratio = d > 0 ? (k + a) / d : k + a;
              const rc = ratio >= 5 ? "#FFB615" : ratio >= 3 ? "#00d992" : ratio >= 2 ? "#d7d8d9" : "#8a9096";
              return (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-[6px] border border-hairline/[0.07] bg-filmdark/30">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8px] font-chakrapetch tracking-[0.16em] uppercase text-flash/35">Avg · kills / deaths / assists</span>
                    <div className="flex items-baseline gap-1.5 font-chakrapetch tabular-nums text-[18px] leading-none">
                      <span className="text-flash">{k.toFixed(1)}</span>
                      <span className="text-flash/25 text-[12px]">/</span>
                      <span className="text-error/80">{d.toFixed(1)}</span>
                      <span className="text-flash/25 text-[12px]">/</span>
                      <span className="text-flash">{a.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end leading-none pl-3 border-l border-hairline/[0.06]">
                    <span className="text-[24px] font-bold font-chakrapetch tabular-nums" style={{ color: rc }}>{ratio.toFixed(2)}</span>
                    <span className="text-[8px] font-chakrapetch tracking-[0.18em] uppercase text-flash/35 mt-1.5">KDA</span>
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Avg CS", Number(stat!.avg_cs ?? 0).toLocaleString()],
                ["Avg Gold", Number(stat!.avg_gold ?? 0).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 px-2.5 py-2 rounded-[5px] border border-hairline/[0.07] bg-filmdark/30">
                  <span className="text-[8px] font-chakrapetch tracking-[0.16em] uppercase text-flash/35">{k}</span>
                  <span className="text-[14px] font-chakrapetch text-flash tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <PatchVariation graph={graph} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {isItemDim && <MiniBuildPath graph={graph} />}
            {isItemDim && (
              <p className="text-[8.5px] font-chakrapetch text-flash/35 leading-snug mb-1">
                Ranked by <b className="text-flash/55">lift × confidence</b>, not raw winrate. <b className="text-jade/70">+N</b> = winrate above {graph.subject.champion}'s average. Open <b className="text-jade/70">Deep dive</b> for the full path + matchups.
              </p>
            )}
            {data.rows.map((r, i) => {
              const raw = r.dimension as string | number;
              const icon = isItemDim ? itemIcon(Number(raw)) : champIcon(String(raw));
              const label = isItemDim ? itemName(Number(raw)) : String(raw);
              const wr = Number(r.winrate);
              const lift = r.lift != null ? Number(r.lift) : null;
              const pick = r.pickrate != null ? Number(r.pickrate) : null;
              return (
                <div
                  key={String(raw)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-[5px] hover:bg-filmlight/[0.04]"
                >
                  <span className="text-[10px] font-chakrapetch text-flash/30 w-4 tabular-nums">{i + 1}</span>
                  <img src={icon} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} className="w-7 h-7 rounded-[4px] border border-hairline/10" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-chakrapetch text-flash truncate">{label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {lift != null && (
                          <CyberTip tip={<><b className="text-flash">Lift {lift > 0 ? "+" : ""}{lift.toFixed(1)}</b> — winrate {lift >= 0 ? "above" : "below"} {graph.subject.champion}'s average. The ranking weights this by sample size, not raw winrate.</>}>
                            <span className={cn("text-[10px] font-chakrapetch font-bold tabular-nums cursor-help", lift > 0.05 ? "text-jade/80" : lift < -0.05 ? "text-error/80" : "text-flash/40")}>
                              {lift > 0 ? "+" : ""}{lift.toFixed(1)}
                            </span>
                          </CyberTip>
                        )}
                        <span className={cn("text-[12px] font-chakrapetch tabular-nums", wr >= 50 ? "text-jade" : "text-error")}>{wr}%</span>
                      </div>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-filmlight/[0.06] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, wr)}%`, background: wr >= 50 ? "#00d992" : "#ff6286" }} />
                    </div>
                  </div>
                  {isItemDim && pick != null ? (
                    <CyberTip tip={<><b className="text-flash">{pick}% pick</b> · {Number(r.games).toLocaleString()} games — how often {graph.subject.champion} players built this, and the sample behind it.</>}>
                      <span className="text-[9px] font-chakrapetch text-flash/35 tabular-nums w-9 text-right cursor-help">{pick}%</span>
                    </CyberTip>
                  ) : (
                    <span className="text-[9px] font-chakrapetch text-flash/30 tabular-nums w-9 text-right">{Number(r.games)}g</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* footer — Deep dive (80%) + Save snapshot (20%), one line. Hidden on an
          empty combo (nothing to expand or snapshot). */}
      {!empty && (
        <div className="flex items-stretch gap-2 px-4 py-3 border-t border-hairline/[0.06]">
          <button
            onClick={onExpand}
            className="group basis-[80%] grow flex items-center justify-center gap-2 h-10 rounded-[7px] border border-jade/35 bg-jade/[0.08] hover:bg-jade/[0.16] hover:border-jade/60 transition-all cursor-clicker outline-none focus:outline-none focus-visible:outline-none shadow-[0_0_0_rgba(0,217,146,0)] hover:shadow-[0_0_22px_rgba(0,217,146,0.25)]"
          >
            <Maximize2 size={13} className="text-jade transition-transform group-hover:scale-110" />
            <span className="text-[11px] font-chakrapetch font-bold tracking-[0.14em] uppercase text-jade">Deep dive</span>
          </button>
          {canSave && (
            <button
              onClick={onSave}
              title={saved ? "Snapshot saved — click to refresh" : "Save this combo as a snapshot"}
              className={cn(
                "basis-[20%] shrink-0 flex items-center justify-center gap-1.5 h-10 rounded-[7px] border transition-all cursor-clicker outline-none focus:outline-none focus-visible:outline-none",
                saved
                  ? "border-jade/45 bg-jade/15 text-jade"
                  : "border-jade/20 bg-jade/[0.05] text-flash/60 hover:text-jade hover:border-jade/45 hover:bg-jade/[0.1]"
              )}
            >
              {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── PATCH VARIATION ────────────────────────────────────────────────────────
// How the selected stats drift across recent patches. Instant subject-level
// (champion + role + rank) by default; when the graph carries ally/item/rune
// constraints, a button fetches the exact (slow) per-combo trend.
type PVMetric = "winrate" | "kda" | "cs" | "gold";
// `floor` = the smallest span the bar scale uses, so a tiny real range (e.g. a
// 0.2pt winrate wobble) maps to a tiny bar difference instead of being blown up
// to the full width. `eps` = below this, a patch-over-patch delta reads as flat.
const PV_METRICS: {
  key: PVMetric; label: string; get: (r: PatchVariationRow) => number; fmt: (v: number) => string; eps: number; floor: number;
}[] = [
  { key: "winrate", label: "WR", get: (r) => Number(r.winrate ?? 0), fmt: (v) => `${v.toFixed(1)}%`, eps: 0.05, floor: 5 },
  { key: "kda", label: "KDA", get: (r) => { const d = Number(r.avg_deaths ?? 0); const ka = Number(r.avg_kills ?? 0) + Number(r.avg_assists ?? 0); return d > 0 ? ka / d : ka; }, fmt: (v) => v.toFixed(2), eps: 0.01, floor: 0.4 },
  { key: "cs", label: "CS", get: (r) => Number(r.avg_cs ?? 0), fmt: (v) => v.toFixed(0), eps: 0.5, floor: 20 },
  { key: "gold", label: "Gold", get: (r) => Number(r.avg_gold ?? 0), fmt: (v) => `${(v / 1000).toFixed(1)}k`, eps: 50, floor: 1000 },
];

function PatchVariation({ graph }: { graph: ExplorerGraph }) {
  const [rows, setRows] = useState<PatchVariationRow[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [exact, setExact] = useState(false);
  const [exactLoading, setExactLoading] = useState(false);
  const [metric, setMetric] = useState<PVMetric>("winrate");

  const hasConstraints =
    graph.constraints.length > 0 ||
    (graph.subject.items?.length ?? 0) > 0 ||
    (graph.subject.keystones?.length ?? 0) > 0;

  // instant subject-level fetch whenever the result graph changes
  useEffect(() => {
    let cancelled = false;
    setPhase("loading"); setRows(null); setExact(false); setMetric("winrate");
    runPatchVariation(graph, false)
      .then((r) => { if (cancelled) return; setRows(r.rows); setPhase(r.rows.length >= 2 ? "ready" : "empty"); })
      .catch(() => { if (!cancelled) setPhase("error"); });
    return () => { cancelled = true; };
  }, [graph]);

  const loadExact = async () => {
    setExactLoading(true);
    try {
      const r = await runPatchVariation(graph, true);
      if (r.rows.length >= 2) { setRows(r.rows); setExact(true); setPhase("ready"); }
      else showCyberToast({ title: "Not enough data", description: "This exact combo has too few games per patch to chart.", tag: "PATCH", variant: "error" });
    } catch (e: any) {
      showCyberToast({ title: "Exact trend failed", description: e?.message ?? "Too heavy — try fewer constraints.", tag: "PATCH", variant: "error" });
    } finally {
      setExactLoading(false);
    }
  };

  const header = (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-chakrapetch font-bold tracking-[0.2em] uppercase text-flash/45">Patch variation</span>
      {exact
        ? <span className="text-[8px] font-chakrapetch uppercase tracking-[0.14em] text-jade/80 px-1.5 py-0.5 rounded-[3px] bg-jade/10 border border-jade/25">exact</span>
        : <span className="text-[8px] font-chakrapetch uppercase tracking-[0.14em] text-flash/30 truncate max-w-[140px]">{graph.subject.champion}{graph.subject.role ? ` · ${graph.subject.role}` : ""}</span>}
    </div>
  );

  if (phase === "loading") {
    return (
      <div className="mt-1 flex flex-col gap-2 pt-3 border-t border-hairline/[0.06]">
        {header}
        <div className="flex items-center gap-2 text-flash/40 text-[10px] font-chakrapetch py-1.5">
          <Loader2 size={12} className="animate-spin" /> loading patch trend…
        </div>
      </div>
    );
  }
  if (phase !== "ready" || !rows) {
    return (
      <div className="mt-1 flex flex-col gap-2 pt-3 border-t border-hairline/[0.06]">
        {header}
        <span className="text-[10px] font-chakrapetch text-flash/35 py-0.5">
          {phase === "error" ? "Patch trend unavailable." : "Not enough patches to chart a trend."}
        </span>
      </div>
    );
  }

  const m = PV_METRICS.find((x) => x.key === metric)!;
  const vals = rows.map(m.get);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(max - min, m.floor); // never over-amplify a tiny range
  const totalGames = rows.reduce((a, r) => a + r.games, 0);

  return (
    <div className="mt-1 flex flex-col gap-2.5 pt-3 border-t border-hairline/[0.06]">
      {header}

      {/* metric selector */}
      <div className="flex gap-1">
        {PV_METRICS.map((x) => (
          <button
            key={x.key}
            onClick={() => setMetric(x.key)}
            className={cn(
              "flex-1 py-1 rounded-[4px] text-[9px] font-chakrapetch font-bold tracking-[0.1em] uppercase transition-colors cursor-clicker",
              metric === x.key ? "bg-jade/15 text-jade border border-jade/35" : "text-flash/40 border border-hairline/[0.07] hover:text-flash/70"
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* per-patch rows (oldest → newest) */}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => {
          const v = m.get(r);
          const prev = i > 0 ? m.get(rows[i - 1]) : null;
          const delta = prev == null ? null : v - prev;
          const w = 14 + ((v - min) / span) * 86; // keep even the min visible
          const barColor = metric === "winrate" ? (v >= 50 ? "#00d992" : "#ff6286") : "#00d992";
          const low = r.games < 100;
          return (
            <div key={r.patch} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-[10px] font-chakrapetch tabular-nums text-flash/55">{r.patch}</span>
              <div className="flex-1 h-2.5 rounded-[3px] bg-filmlight/[0.05] overflow-hidden">
                <div className="h-full rounded-[3px] transition-all duration-300" style={{ width: `${w}%`, background: barColor, opacity: low ? 0.4 : 0.85 }} />
              </div>
              <span className={cn(
                "w-11 shrink-0 text-right text-[11px] font-chakrapetch font-bold tabular-nums",
                metric === "winrate" ? (v >= 50 ? "text-jade" : "text-error") : "text-flash"
              )}>
                {m.fmt(v)}
              </span>
              <span className="w-10 shrink-0 text-right text-[9px] font-chakrapetch tabular-nums">
                {delta == null ? (
                  <span className="text-flash/20">—</span>
                ) : Math.abs(delta) < m.eps ? (
                  <span className="text-flash/25">·</span>
                ) : (
                  <span className={delta > 0 ? "text-jade/80" : "text-error/80"}>
                    {delta > 0 ? "▲" : "▼"}{m.fmt(Math.abs(delta)).replace("%", "")}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <span className="text-[8px] font-chakrapetch text-flash/25 uppercase tracking-[0.12em]">
        {totalGames.toLocaleString()} games · faded bar = &lt;100 / patch
      </span>

      {hasConstraints && !exact && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={loadExact}
            disabled={exactLoading}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-[5px] border border-citrine/30 bg-citrine/[0.06] text-citrine text-[9px] font-chakrapetch font-bold uppercase tracking-[0.12em] hover:bg-citrine/[0.12] transition-colors cursor-clicker disabled:opacity-50"
          >
            {exactLoading ? <><Loader2 size={11} className="animate-spin" /> computing exact…</> : <>◆ compute exact (allies / items)</>}
          </button>
          <span className="text-[8px] font-chakrapetch text-flash/25 leading-snug">
            Trend is the champion only — it ignores your allies/items. Exact is slower.
          </span>
        </div>
      )}
    </div>
  );
}

export default function ExplorerCanvas({ onBack }: { onBack?: () => void }) {
  return (
    <ReactFlowProvider>
      <Canvas onBack={onBack} />
    </ReactFlowProvider>
  );
}
