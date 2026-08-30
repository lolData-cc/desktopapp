// graph.ts — fold the canvas (nodes + edges) into an ExplorerGraph, and a
// mock runner so the editor is fully alive before the backend endpoint lands.
//
// Topology: constraints + filter wire INTO the Subject; the Subject wires INTO
// the Output. compileGraph walks Output ← Subject ← {constraints, filter}.

import type { Node, Edge } from "@xyflow/react";
import type { ExplorerGraph, ExplorerNodeData, OutputData, QueryResult, PatchVariationResult, BuildPathResult, ItemStrengthResult } from "./types";
import { CHAMPIONS, ITEMS } from "./catalog";
import { getLoadedItemIds, getSlotPoolIds, loadItems } from "@/hooks/useItems";
import { EXPLORER_API_BASE_URL } from "@/config";

/** POST the compiled graph to the live query engine. Throws on error (the
 *  backend returns { error } with a friendly message). */
export async function runQuery(graph: ExplorerGraph): Promise<QueryResult> {
  await ensurePools(graph);
  const res = await fetch(`${EXPLORER_API_BASE_URL}/api/explorer/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (json?.error) throw new Error(json.error);
  return json as QueryResult;
}

/** PATCH VARIATION — how the result drifts across recent patches.
 *  exact=false → instant, subject-level (champion+role+rank) from the precomputed
 *  table; exact=true → slow, honours the full graph (allies/items/runes). */
export async function runPatchVariation(graph: ExplorerGraph, exact = false): Promise<PatchVariationResult> {
  if (exact) await ensurePools(graph);
  const path = exact ? "/api/explorer/patches/exact" : "/api/explorer/patches";
  const res = await fetch(`${EXPLORER_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (json?.error) throw new Error(json.error);
  return json as PatchVariationResult;
}

/** BUILD PATH — the cohort's ordered core-item build (per-slot items + alternatives,
 *  weighted). Ships the legendary pool so "1st item" means 1st completed item. */
export async function runBuildPath(graph: ExplorerGraph): Promise<BuildPathResult> {
  await loadItems().catch(() => {});
  const g: ExplorerGraph = { ...graph, itemPool: graph.itemPool?.length ? graph.itemPool : getSlotPoolIds() };
  const res = await fetch(`${EXPLORER_API_BASE_URL}/api/explorer/buildpath`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(g),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (json?.error) throw new Error(json.error);
  return json as BuildPathResult;
}

/** CONDITIONAL ITEM STRENGTH — when an item is statistically good/bad for the
 *  subject champ depending on the enemy composition (class/damage buckets). */
export async function runItemStrength(graph: ExplorerGraph, itemId: number): Promise<ItemStrengthResult> {
  const res = await fetch(`${EXPLORER_API_BASE_URL}/api/explorer/itemstrength`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, itemId }),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (json?.error) throw new Error(json.error);
  return json as ItemStrengthResult;
}

type N = Node<ExplorerNodeData>;

export function compileGraph(
  nodes: N[],
  edges: Edge[]
): { graph?: ExplorerGraph; error?: string } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inputsOf = (id: string) =>
    edges.filter((e) => e.target === id).map((e) => byId.get(e.source)).filter((n): n is N => !!n);

  // A module with its EXCLUDE submodule on (data.exclude) becomes a NEGATIVE
  // constraint — "winrate WITHOUT this".
  const isExcluded = (n: N) => (n.data as any).exclude === true;

  // Item / Rune modules wired INTO a champion (or the Output) node.
  const attach = (id: string) => {
    const a = inputsOf(id);
    const items: number[] = [], excludeItems: number[] = [];
    const itemSlots: Record<number, number> = {}; // 1-6 = Nth completed item; 0/undefined = any
    for (const n of a.filter((n) => n.type === "item" && (n.data as any).itemId)) {
      const itemId = (n.data as any).itemId as number;
      if (isExcluded(n)) { excludeItems.push(itemId); continue; } // excluded → no slot
      items.push(itemId);
      const s = Number((n.data as any).slot) | 0;
      if (s >= 1 && s <= 6) itemSlots[itemId] = s;
    }
    const keystones: number[] = [], excludeKeystones: number[] = [];
    for (const n of a.filter((n) => n.type === "rune" && (n.data as any).keystone)) {
      (isExcluded(n) ? excludeKeystones : keystones).push((n.data as any).keystone as number);
    }
    return { items, excludeItems, keystones, excludeKeystones, itemSlots };
  };

  const output = nodes.find((n) => n.type === "output");
  if (!output) return { error: "Add an Output node" };

  const outInputs = inputsOf(output.id);
  const subjectNode = outInputs.find((n) => n.type === "subject");
  if (!subjectNode) return { error: "Connect a Subject → Output" };
  const sd = subjectNode.data as any;
  if (!sd.champion) return { error: "Pick a champion on the Subject" };

  // subject's items/runes = wired into it, plus any wired straight to Output
  const sAtt = attach(subjectNode.id);
  const oAtt = attach(output.id);
  const graph: ExplorerGraph = {
    subject: {
      champion: sd.champion,
      role: sd.role || undefined,
      items: [...sAtt.items, ...oAtt.items],
      keystones: [...sAtt.keystones, ...oAtt.keystones],
      itemSlots: { ...sAtt.itemSlots, ...oAtt.itemSlots },
      excludeItems: [...sAtt.excludeItems, ...oAtt.excludeItems],
      excludeKeystones: [...sAtt.excludeKeystones, ...oAtt.excludeKeystones],
    },
    constraints: [],
    categories: [],
    filters: {},
    output: { kind: "stats" },
  };

  // ally / enemy / filter modules may be wired into the Output OR straight into
  // the Subject (the Subject accepts inputs too). Gather constraint nodes from
  // both, deduped by id, so an ally attached to the Subject still counts.
  const outInputIds = new Set(outInputs.map((n) => n.id));
  const constraintNodes = [...outInputs, ...inputsOf(subjectNode.id)].filter(
    (n, i, arr) => arr.findIndex((m) => m.id === n.id) === i
  );
  for (const n of constraintNodes) {
    const d = n.data as any;
    if (n.type === "ally" || n.type === "enemy") {
      const a = attach(n.id);
      // EXCLUDE submodule on the ally/enemy itself negates the WHOLE constraint
      // ("WITHOUT such an ally" / "NOT against such an enemy").
      const negate = isExcluded(n);
      // Keep the constraint if it actually narrows: a named champion, OR an
      // attached item/rune ("vs ANY enemy that builds Death's Dance"). A bare
      // ally/enemy with no champion and nothing attached is "anyone" = no-op, so
      // we drop it (every game has allies/enemies). Role alone is just a refiner.
      if (d.champion || a.items.length || a.keystones.length || a.excludeItems.length || a.excludeKeystones.length) {
        graph.constraints.push({ type: n.type, champion: d.champion || undefined, role: d.role || undefined, items: a.items, keystones: a.keystones, itemSlots: a.itemSlots, excludeItems: a.excludeItems, excludeKeystones: a.excludeKeystones, negate: negate || undefined });
      }
      // a category set on the node = a team-composition filter ("≥N of class X"),
      // independent of (and combinable with) any specific champion on the node.
      if (d.category) {
        graph.categories!.push({ side: n.type, cls: d.category, min: Math.max(1, Math.min(5, Number(d.categoryMin) || 2)) });
      }
    }
  }

  // A Filter scopes the WHOLE query, so it's logically singular. But the canvas
  // lets you drop more than one (and wire them to Subject AND Output), and the old
  // "graph.filters = …" overwrote on every filter node — so a second, stale filter
  // silently clobbered the one you were editing (queue/tier changes did nothing).
  // Merge instead: an explicitly-narrowed field beats a default, and the
  // Output-attached filter wins ties (it's the one you steer the query with).
  const DEFAULT_QUEUES = [420, 440];
  const isDefaultQueues = (q: number[]) =>
    q.length === DEFAULT_QUEUES.length && [...q].map(Number).sort().join() === DEFAULT_QUEUES.join();
  const filterNodes = constraintNodes
    .filter((n) => n.type === "filter")
    .sort((a, b) => Number(outInputIds.has(a.id)) - Number(outInputIds.has(b.id))); // Output-attached processed last → wins ties
  if (filterNodes.length) {
    const merged: { scope?: "current_patch" | "all"; tiers: string[]; queues: number[]; platforms: string[] } = { tiers: [], queues: DEFAULT_QUEUES, platforms: [] };
    for (const fn of filterNodes) {
      const d = fn.data as any;
      if (d.scope) merged.scope = d.scope;                                   // last scope wins
      if (d.tiers?.length) merged.tiers = d.tiers;                           // last explicit tier set wins (empty = "all ranks" = no-op)
      if (d.queues?.length && !isDefaultQueues(d.queues)) merged.queues = d.queues; // last *narrowed* queue wins over the Solo+Flex default
      if (d.platforms?.length) merged.platforms = d.platforms;              // last explicit region set wins (empty = all regions = no-op)
    }
    graph.filters = { scope: merged.scope, tiers: merged.tiers, queues: merged.queues, platforms: merged.platforms };
  }

  const od = output.data as OutputData;
  graph.output =
    od.mode === "rank"
      ? {
          kind: "rank",
          dimension: od.dimension,
          role: od.role || undefined,
          limit: od.limit,
          minGames: od.minGames,
          // ranking items: restrict to real build items (completed + boots), so
          // components and the trinket slot don't show up in the ranking
          ...(od.dimension === "item" ? { itemPool: getLoadedItemIds() } : {}),
        }
      : { kind: "stats" };

  // If any build-slot constraint is in play, ship the LEGENDARY pool so the backend
  // orders "Nth core item" (ignoring starters/boots/components). Union the slot
  // targets so a non-legendary pick (e.g. a boot) is still orderable. runQuery
  // re-derives this after awaiting loadItems(), so an empty cache here is fine.
  if (slotTargets(graph).length) graph.itemPool = slotPool(graph);

  return { graph };
}

// the item ids that carry a build-slot constraint (subject + constraints)
function slotTargets(graph: ExplorerGraph): number[] {
  return [
    ...Object.keys(graph.subject.itemSlots ?? {}),
    ...graph.constraints.flatMap((c) => Object.keys(c.itemSlots ?? {})),
  ].map(Number);
}
// legendary pool (for ordering) ∪ the slot targets (so any pick is orderable)
function slotPool(graph: ExplorerGraph): number[] {
  return Array.from(new Set([...getSlotPoolIds(), ...slotTargets(graph)]));
}
// item pools depend on the async item cache; ensure it's warm + re-derive so the
// pool is never empty/stale at send time (an empty pool would silently fall back
// to "any purchase", making "1st item" = a starter and returning 0 games).
async function ensurePools(graph: ExplorerGraph): Promise<void> {
  const needsSlot = slotTargets(graph).length > 0;
  const needsRankItem = graph.output.kind === "rank" && graph.output.dimension === "item";
  if (!needsSlot && !needsRankItem) return;
  await loadItems().catch(() => {});
  if (needsSlot) graph.itemPool = slotPool(graph);
  if (needsRankItem && graph.output.kind === "rank") graph.output.itemPool = getLoadedItemIds();
}

// deterministic pseudo-random in [0,1) from a string (so mock data is stable)
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Plausible fake results — replaced by the real /api/explorer/query fetch. */
export function mockRun(graph: ExplorerGraph): QueryResult {
  const key = JSON.stringify(graph);
  const constraintTightness =
    (graph.subject.items?.length ?? 0) +
    (graph.subject.keystones?.length ?? 0) +
    graph.constraints.length +
    graph.constraints.reduce((s, c) => s + (c.items?.length ?? 0) + (c.keystones?.length ?? 0), 0);
  const baseGames = Math.round(8000 / Math.pow(3, constraintTightness) * (0.6 + seed(key)));

  if (graph.output.kind === "rank") {
    const pool =
      graph.output.dimension === "item"
        ? ITEMS.map((i) => i.name)
        : CHAMPIONS;
    const n = Math.min(graph.output.limit ?? 10, 12);
    const picks = [...pool]
      .sort((a, b) => seed(b + key) - seed(a + key))
      .slice(0, n)
      .map((name, i) => ({
        dimension: name,
        games: Math.max(graph.output.kind === "rank" ? graph.output.minGames ?? 5 : 5, Math.round(baseGames / (i + 2) * (0.4 + seed(name)))),
        winrate: Math.round((68 - i * 1.6 + (seed(name + "wr") - 0.5) * 6) * 10) / 10,
      }))
      .sort((a, b) => b.winrate - a.winrate);
    return {
      columns: ["dimension", "games", "winrate"],
      rows: picks,
      meta: { games: baseGames, ms: Math.round(120 + seed(key) * 400), mode: graph.filters.scope ?? "current_patch" },
    };
  }

  const wr = Math.round((46 + seed(key) * 10) * 100) / 100;
  return {
    columns: ["games", "winrate", "avg_kills", "avg_deaths", "avg_assists", "avg_cs", "avg_gold"],
    rows: [{
      games: baseGames,
      winrate: wr,
      avg_kills: Math.round((5 + seed(key + "k") * 6) * 10) / 10,
      avg_deaths: Math.round((4 + seed(key + "d") * 4) * 10) / 10,
      avg_assists: Math.round((6 + seed(key + "a") * 8) * 10) / 10,
      avg_cs: Math.round((180 + seed(key + "cs") * 80) * 10) / 10,
      avg_gold: Math.round(11000 + seed(key + "g") * 5000),
    }],
    meta: { games: baseGames, ms: Math.round(120 + seed(key) * 400), mode: graph.filters.scope ?? "current_patch" },
  };
}
