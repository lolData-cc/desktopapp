// snapshots.ts — reusable Explorer query "snapshots".
//
// A snapshot is a saved data COMBINATION (the ExplorerGraph). It's stored in the
// browser (localStorage) and can be re-opened any day: opening it rebuilds the
// node canvas AND re-runs the query, so you always see fresh numbers for that
// exact combo. We only let meaningful combos be saved — a bare subject→output
// (e.g. "Lillia → stats") isn't worth a snapshot; "Lillia + an item / an ally"
// is.

import type { Node, Edge } from "@xyflow/react";
import type { ExplorerGraph } from "./types";
import { ROLE_LABEL, itemName } from "./catalog";

export type Snapshot = { id: string; name: string; graph: ExplorerGraph; savedAt: number };

const SNAP_KEY = "explorerSnapshots";

// Snapshottable = at least one variant beyond the bare subject: a constraint
// (ally/enemy), an attached item/rune, a rank-tier filter, or a ranking output.
export function isSnapshottable(g: ExplorerGraph): boolean {
  return (
    (g.constraints?.length ?? 0) > 0 ||
    (g.subject?.items?.length ?? 0) > 0 ||
    (g.subject?.keystones?.length ?? 0) > 0 ||
    (g.subject?.excludeItems?.length ?? 0) > 0 ||
    (g.subject?.excludeKeystones?.length ?? 0) > 0 ||
    (g.filters?.tiers?.length ?? 0) > 0 ||
    (g.filters?.platforms?.length ?? 0) > 0 ||
    g.output?.kind === "rank"
  );
}

// ── store ──
function read(): Snapshot[] {
  try { const v = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function write(list: Snapshot[]) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); } catch { /* storage full / disabled */ }
}

export function getSnapshots(): Snapshot[] {
  return read().sort((a, b) => b.savedAt - a.savedAt); // newest first
}

// A stable identity for a combo so saving the same thing twice updates it
// instead of duplicating (arrays sorted so order doesn't matter).
function signature(g: ExplorerGraph): string {
  const norm = {
    s: { c: g.subject?.champion ?? "", r: g.subject?.role ?? "", i: [...(g.subject?.items ?? [])].sort(), k: [...(g.subject?.keystones ?? [])].sort(), is: g.subject?.itemSlots ?? {}, xi: [...(g.subject?.excludeItems ?? [])].sort(), xk: [...(g.subject?.excludeKeystones ?? [])].sort() },
    c: (g.constraints ?? [])
      .map((c) => ({ t: c.type, c: c.champion ?? "", r: c.role ?? "", i: [...(c.items ?? [])].sort(), k: [...(c.keystones ?? [])].sort(), is: c.itemSlots ?? {}, xi: [...(c.excludeItems ?? [])].sort(), xk: [...(c.excludeKeystones ?? [])].sort(), n: c.negate ?? false }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    f: { sc: g.filters?.scope ?? "current_patch", t: [...(g.filters?.tiers ?? [])].sort(), q: [...(g.filters?.queues ?? [])].sort(), p: [...(g.filters?.platforms ?? [])].sort() },
    o: g.output,
  };
  return JSON.stringify(norm);
}

function autoName(g: ExplorerGraph): string {
  const role = g.subject?.role ? ` ${ROLE_LABEL[g.subject.role as keyof typeof ROLE_LABEL] ?? g.subject.role}` : "";
  const parts: string[] = [`${g.subject?.champion || "Subject"}${role}`];
  const allies = (g.constraints ?? []).filter((c) => c.type === "ally" && c.champion).map((c) => c.champion);
  const enemies = (g.constraints ?? []).filter((c) => c.type === "enemy" && c.champion).map((c) => c.champion);
  const anyAlly = (g.constraints ?? []).some((c) => c.type === "ally" && !c.champion);
  const anyEnemy = (g.constraints ?? []).some((c) => c.type === "enemy" && !c.champion);
  if (allies.length || anyAlly) parts.push(`w/ ${[...allies, anyAlly ? "any" : ""].filter(Boolean).join(", ")}`);
  if (enemies.length || anyEnemy) parts.push(`vs ${[...enemies, anyEnemy ? "any" : ""].filter(Boolean).join(", ")}`);
  const items = [...(g.subject?.items ?? []), ...(g.constraints ?? []).flatMap((c) => c.items ?? [])];
  if (items.length) parts.push(`+ ${items.map(itemName).join(", ")}`);
  if (g.output?.kind === "rank") parts.push(`→ top ${g.output.dimension}`);
  return parts.join("  ");
}

function uid(): string {
  try { return crypto.randomUUID(); } catch { return `${read().length}-${JSON.stringify(read()).length}`; }
}

/** Save (or refresh) the combo. `now` is passed in so the module stays free of
 *  ambient time. Returns the full, newest-first list. */
export function saveSnapshot(g: ExplorerGraph, now: number): Snapshot[] {
  const list = read();
  const sig = signature(g);
  const existing = list.find((s) => signature(s.graph) === sig);
  if (existing) {
    existing.savedAt = now;
    existing.name = autoName(g);
  } else {
    list.push({ id: uid(), name: autoName(g), graph: g, savedAt: now });
  }
  write(list);
  return getSnapshots();
}

export function deleteSnapshot(id: string): Snapshot[] {
  write(read().filter((s) => s.id !== id));
  return getSnapshots();
}

export function isSaved(g: ExplorerGraph): boolean {
  const sig = signature(g);
  return read().some((s) => signature(s.graph) === sig);
}

// ── rebuild a node canvas from a saved graph (reverse of compileGraph) ──
// Lays modules out in columns: attachments left, subject centre, output right;
// constraints stacked down the left with their own items/runes beside them.
export function graphToCanvas(g: ExplorerGraph): { nodes: Node[]; edges: Edge[] } {
  let seq = 0;
  const nid = (k: string) => `${k}-${++seq}`;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const wire = (source: string, target: string) =>
    edges.push({ id: `e-${source}-${target}`, source, target, type: "glow" });

  const subjectId = nid("subject");
  nodes.push({ id: subjectId, type: "subject", position: { x: 460, y: 250 }, data: { champion: g.subject?.champion ?? "", role: g.subject?.role ?? "" } });

  const outputId = nid("output");
  const od = g.output;
  nodes.push({
    id: outputId, type: "output", position: { x: 820, y: 250 },
    data: od?.kind === "rank"
      ? { mode: "rank", dimension: od.dimension, role: od.role ?? "", limit: od.limit ?? 5, minGames: od.minGames ?? 5 }
      : { mode: "stats" },
  });
  wire(subjectId, outputId);

  // subject's own items / runes, stacked top-left feeding the subject. The EXCLUDE
  // submodule is just a `data.exclude` flag on the module (renders as a strip).
  let topY = 40;
  for (const it of g.subject?.items ?? []) { const id = nid("item"); nodes.push({ id, type: "item", position: { x: 250, y: topY }, data: { itemId: it, slot: g.subject?.itemSlots?.[it] } }); wire(id, subjectId); topY += 120; }
  for (const ks of g.subject?.keystones ?? []) { const id = nid("rune"); nodes.push({ id, type: "rune", position: { x: 250, y: topY }, data: { keystone: ks } }); wire(id, subjectId); topY += 120; }
  for (const it of g.subject?.excludeItems ?? []) { const id = nid("item"); nodes.push({ id, type: "item", position: { x: 250, y: topY }, data: { itemId: it, exclude: true } }); wire(id, subjectId); topY += 120; }
  for (const ks of g.subject?.excludeKeystones ?? []) { const id = nid("rune"); nodes.push({ id, type: "rune", position: { x: 250, y: topY }, data: { keystone: ks, exclude: true } }); wire(id, subjectId); topY += 120; }

  // ally / enemy constraints down the left, each with its own attachments
  let cy = Math.max(topY + 30, 230);
  for (const c of g.constraints ?? []) {
    const cid = nid(c.type);
    nodes.push({ id: cid, type: c.type, position: { x: 250, y: cy }, data: { champion: c.champion ?? "", role: c.role ?? "", exclude: c.negate || undefined } });
    wire(cid, subjectId);
    let iy = cy - 20;
    for (const it of c.items ?? []) { const id = nid("item"); nodes.push({ id, type: "item", position: { x: 30, y: iy }, data: { itemId: it, slot: c.itemSlots?.[it] } }); wire(id, cid); iy += 110; }
    for (const ks of c.keystones ?? []) { const id = nid("rune"); nodes.push({ id, type: "rune", position: { x: 30, y: iy }, data: { keystone: ks } }); wire(id, cid); iy += 110; }
    for (const it of c.excludeItems ?? []) { const id = nid("item"); nodes.push({ id, type: "item", position: { x: 30, y: iy }, data: { itemId: it, exclude: true } }); wire(id, cid); iy += 110; }
    for (const ks of c.excludeKeystones ?? []) { const id = nid("rune"); nodes.push({ id, type: "rune", position: { x: 30, y: iy }, data: { keystone: ks, exclude: true } }); wire(id, cid); iy += 110; }
    cy += 200;
  }

  // filter, when the combo carried one
  const f = g.filters;
  if (f && ((f.tiers?.length ?? 0) > 0 || f.scope === "all" || (f.platforms?.length ?? 0) > 0)) {
    const id = nid("filter");
    nodes.push({ id, type: "filter", position: { x: 460, y: 520 }, data: { scope: f.scope ?? "current_patch", tiers: f.tiers ?? [], queues: f.queues ?? [420, 440], platforms: f.platforms ?? [] } });
    wire(id, subjectId);
  }

  return { nodes, edges };
}
