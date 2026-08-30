// runeData.ts — the live rune roster, driven off OUR CDN's runesReforged.json.
//
// Riot reworks the rune trees every few patches (16.10 added Deathfire Touch,
// renamed Phase Rush → Stormraider's Surge, reshuffled Domination). The old
// hardcoded lists silently went stale. This module fetches the current
// runesReforged.json once and serves it through the same helpers the app
// already uses, so the rune picker and match cards stay correct automatically.
// The hardcoded RUNE_TREES remain the synchronous fallback until the fetch lands
// (and if it ever fails / the user is offline).

import { useSyncExternalStore } from "react";
import { cdnBaseUrl, cdnVersionReady, PERK_CDN } from "@/config";
import { RUNE_TREES as STATIC_TREES, type RuneTree } from "./rune-tree-data";

type RawRune = { id: number; icon: string; name: string };
type RawTree = { id: number; icon: string; name: string; slots: { runes: RawRune[] }[] };

// runesReforged icons carry a "perk-images/" prefix; PERK_CDN already ends in
// /perk-images and our static `icon` fields are "Styles/…", so normalize to that.
const stripPrefix = (icon: string) => icon.replace(/^perk-images\//, "");

function mapsFromTrees(trees: RuneTree[]) {
  const icon = new Map<number, string>();
  const name = new Map<number, string>();
  for (const t of trees) {
    icon.set(t.id, t.icon);
    name.set(t.id, t.name);
    for (const r of [...t.keystones, ...t.rows.flat()]) {
      icon.set(r.id, r.icon);
      name.set(r.id, r.name);
    }
  }
  return { icon, name };
}

// initial state = the hardcoded fallback; swapped to live data once fetched
let _trees: RuneTree[] = STATIC_TREES;
let _maps = mapsFromTrees(STATIC_TREES);
const listeners = new Set<() => void>();
let _started = false;

export function ensureRuneData() {
  if (_started) return;
  _started = true;
  // wait for the resolved CDN version so we fetch the CURRENT patch's runes
  cdnVersionReady
    .then(() => fetch(`${cdnBaseUrl()}/data/en_US/runesReforged.json`))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("runesReforged"))))
    .then((raw: RawTree[]) => {
      _trees = raw.map((t) => ({
        id: t.id,
        name: t.name,
        icon: stripPrefix(t.icon),
        color: STATIC_TREES.find((s) => s.id === t.id)?.color ?? "flash", // Riot has no color; keep ours
        keystones: t.slots[0].runes.map((r) => ({ id: r.id, name: r.name, icon: stripPrefix(r.icon) })),
        rows: t.slots.slice(1).map((s) => s.runes.map((r) => ({ id: r.id, name: r.name, icon: stripPrefix(r.icon) }))),
      }));
      _maps = mapsFromTrees(_trees);
      listeners.forEach((l) => l());
    })
    .catch(() => {
      /* keep the static fallback */
    });
}

function subscribe(cb: () => void) {
  ensureRuneData();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive trees — live once loaded, hardcoded fallback until then. */
export function useRuneTrees(): RuneTree[] {
  return useSyncExternalStore(subscribe, () => _trees, () => _trees);
}

// ── id → asset lookups (live-first, static fallback). Cover styles (tree ids),
//    keystones and minor runes alike, since the maps are built from full trees. ──
export function getRuneIcon(id: number): string | null {
  ensureRuneData();
  const p = _maps.icon.get(id);
  return p ? `${PERK_CDN}/${p}` : null;
}
export function getRuneName(id: number): string | null {
  ensureRuneData();
  return _maps.name.get(id) ?? null;
}
export function getRuneTree(id: number): RuneTree | undefined {
  ensureRuneData();
  return _trees.find((t) => t.id === id);
}
