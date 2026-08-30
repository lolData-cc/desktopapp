// types.ts — the EXPLORER graph contract.
//
// The node editor builds these node data shapes; `compileGraph` (in
// graph.ts) folds the connected nodes into an `ExplorerGraph`, which is the
// exact JSON the backend `/api/explorer/query` compiler consumes.

import type { Role, Category } from "./catalog";

// ── node data (what each node on the canvas holds) ──
export type NodeKind = "subject" | "ally" | "enemy" | "item" | "rune" | "filter" | "output" | "exclude";

// `exclude` is an attached SUBMODULE flag (rendered as a strip on the module's
// bottom) — negates the module: "winrate WITHOUT this item/rune/ally/enemy".
export type SubjectData = { kind: "subject"; champion?: string; role?: Role | "" };
// `category` + `categoryMin` make an ally/enemy node a TEAM-COMPOSITION filter:
// "the ally/enemy team has ≥categoryMin champions of class `category`" — independent
// of (and combinable with) a specific champion pick on the same node.
export type AllyData = { kind: "ally"; champion?: string; role?: Role | ""; category?: Category; categoryMin?: number; exclude?: boolean };
export type EnemyData = { kind: "enemy"; champion?: string; role?: Role | ""; category?: Category; categoryMin?: number; exclude?: boolean };
export type ItemData = { kind: "item"; itemId?: number; slot?: number; exclude?: boolean }; // slot 1-6 = Nth completed item; undefined/0 = any slot
export type RuneData = { kind: "rune"; keystone?: number; exclude?: boolean };
export type FilterData = {
  kind: "filter";
  scope: "current_patch" | "all";
  tiers: string[];
  queues: number[];
  platforms?: string[]; // region filter: lowercase platform codes (e.g. "euw1"); empty = all regions
};
export type OutputData = {
  kind: "output";
  mode: "stats" | "rank";
  dimension: "ally" | "enemy" | "item";
  role?: Role | "";
  limit: number;
  minGames: number;
};
// A standalone "Exclude" block you drag onto a module to negate it (sets the
// module's `exclude` flag on drop-overlap, then removes itself). No handles → it
// never wires; it just attaches. Lives in canvas coords like any module.
export type ExcludeData = { kind: "exclude" };

export type ExplorerNodeData =
  | SubjectData | AllyData | EnemyData | ItemData | RuneData | FilterData | OutputData | ExcludeData;

// ── the compiled graph (sent to the backend) ──
// Item/Rune modules attach to a champion node (subject OR an ally/enemy), so
// each champion carries its own item + keystone constraints.
export type ChampSpec = {
  champion?: string;
  role?: Role;
  items?: number[];
  keystones?: number[];
  itemSlots?: Record<number, number>; // itemId → required build slot (1-6); item not listed here = any slot
  excludeItems?: number[];    // items this champ must NOT have built (item + EXCLUDE)
  excludeKeystones?: number[]; // keystones this champ must NOT have run (rune + EXCLUDE)
};

export type Constraint =
  | ({ type: "ally"; negate?: boolean } & ChampSpec)   // negate = "WITHOUT such an ally" (ally + EXCLUDE)
  | ({ type: "enemy"; negate?: boolean } & ChampSpec);  // negate = "NOT against such an enemy"

// team-composition constraint: "the <side> team has ≥<min> champions of class <cls>"
export type CategoryConstraint = { side: "ally" | "enemy"; cls: Category; min: number };

export type ExplorerGraph = {
  subject: ChampSpec;
  constraints: Constraint[];
  categories?: CategoryConstraint[];
  filters: { scope?: "current_patch" | "all"; tiers?: string[]; queues?: number[]; platforms?: string[] };
  itemPool?: number[]; // completed-item id set (current build items); sent when any build-slot filter is used, so the backend can order "Nth completed item"
  output:
    | { kind: "stats" }
    | {
        kind: "rank";
        dimension: "ally" | "enemy" | "item";
        role?: Role;
        limit?: number;
        minGames?: number;
        itemPool?: number[]; // dimension "item" only: restrict the ranking to these item ids (current build items)
      };
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  meta: { games: number; ms: number; mode: string; patch?: string };
};

// ── PATCH VARIATION ──
// One row per recent patch. The instant (subject-level) and exact (full-combo)
// endpoints both return this shape; `exact` says which one produced it.
export type PatchVariationRow = {
  patch: string;
  games: number;
  winrate: number | null;
  avg_kills: number | null;
  avg_deaths: number | null;
  avg_assists: number | null;
  avg_cs: number | null;
  avg_gold: number | null;
};

export type PatchVariationResult = { rows: PatchVariationRow[]; exact: boolean };

// ── weighted item ranking row (the /query item-rank output) ──
// rows still arrive as Record<string, unknown>; this is the shape after Number()ing.
export type RankItemRow = {
  dimension: number; // item id
  games: number;
  winrate: number; // 0..100
  lift: number; // pp vs champ baseline
  pickrate: number; // 0..100
  baseline: number; // champ baseline WR, 0..100
  score: number; // confidence-weighted lift
};

// ── BUILD PATH (/api/explorer/buildpath) ──
export type BuildSlotItem = {
  item: number;
  games: number;
  winrate: number; // 0..100
  lift: number; // pp vs cohort baseline
  pickrate: number; // 0..100 of covered games
  score: number;
};
export type BuildPathResult = {
  slots: BuildSlotItem[][]; // slots[0] = 1st-item options (sorted by games desc), …
  cohortGames: number;
  coveredGames: number;
  coverage: number; // %
  baseline: number; // cohort WR, 0..100
  patch: string;
  mode: "current_patch" | "all";
  ms?: number;
};

// ── CONDITIONAL ITEM STRENGTH (/api/explorer/itemstrength) ──
export type StrengthVerdict = {
  category: string; // class or "AD"/"AP"
  label: string;
  threshold: number;
  gamesIn: number;
  winrateIn: number;
  gamesOut: number;
  winrateOut: number;
  delta: number; // shrunk in−out, pp
  z: number;
  significant: boolean;
  direction: "strong" | "weak" | "neutral";
};
export type ItemStrengthResult = {
  item: number;
  builderGames: number;
  builderWinrate: number;
  baseline: number;
  verdicts: StrengthVerdict[];
  ready: boolean;
  patch: string;
  mode: "current_patch" | "all";
  ms?: number;
};
