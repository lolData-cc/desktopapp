// useItems — single source of truth for the items that are ACTUALLY in the game
// right now. Mirrors useChampions: fetches the live `item.json` for the current
// patch ONCE (module cache + in-flight dedupe), then filters to the build-defining
// set so the picker never shows removed items (Duskblade) or misses new ones
// (Death's Dance, Blackfire Torch) — the static catalog list went stale.
//
// "In the game" = on Summoner's Rift (map 11), purchasable, not a consumable or
// trinket, and a real build item — meaning EITHER:
//   • a "leaf" item that doesn't build into anything (no `into`): legendaries,
//     completed support items, Doran's, jungle pets, tier-3 (upgraded) boots; OR
//   • a tier-2 boot (tag "Boots", ≥1000g) — these DO upgrade to tier-3 now, so
//     they carry an `into` and the leaf test alone would wrongly drop them.
// A small gold floor removes wards / potions / sub-component junk. This also
// drops the Arena duplicates (id 22xxxx / 44xxxx), which carry maps["11"] = false,
// and components (B.F. Sword, Pickaxe, …) which build into something and aren't boots.

import { useEffect, useState } from "react";
import { cdnBaseUrl } from "@/config";

export type GameItem = {
  id: number;
  name: string;
  total: number; // gold cost
  tags: string[];
};

const MIN_GOLD = 400;       // keeps support items / Doran's (400g), drops wards (75g)
const BOOTS_MIN_GOLD = 1000; // tier-2 boots
// Arena / event-mode variants are ID-prefixed into the 6-digit range (e.g. 323004
// Manamune, 663146 Hextech Gunblade, plus Arena-only items like Zephyr / Flesheater)
// even though ddragon still flags them maps["11"]=true. Real SR items are all
// ≤ ~8100, so this single cut removes every alternate-mode item.
const SR_MAX_ID = 100000;

function isInGame(it: any): boolean {
  if (it?.maps?.["11"] !== true) return false;
  if (it?.gold?.purchasable !== true) return false;
  const total = it?.gold?.total ?? 0;
  if (total < MIN_GOLD) return false;
  const tags: string[] = it?.tags ?? [];
  if (tags.includes("Consumable") || tags.includes("Trinket")) return false;
  const isLeaf = !it.into || it.into.length === 0;       // doesn't build into anything
  const isTier2Boot = tags.includes("Boots") && total >= BOOTS_MIN_GOLD;
  return isLeaf || isTier2Boot;
}

let _cache: GameItem[] | null = null;
let _byId: Map<number, GameItem> | null = null;
let _promise: Promise<GameItem[]> | null = null;

export function loadItems(): Promise<GameItem[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`${cdnBaseUrl()}/data/en_US/item.json`)
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load item.json");
      return r.json();
    })
    .then((data) => {
      const raw = (data.data ?? {}) as Record<string, any>;
      const candidates: GameItem[] = Object.entries(raw)
        .filter(([id, it]) => Number(id) < SR_MAX_ID && isInGame(it))
        .map(([id, it]) => ({
          id: Number(id),
          name: it.name as string,
          total: Number(it.gold?.total ?? 0),
          tags: (it.tags ?? []) as string[],
        }))
        .sort((a, b) => a.id - b.id); // canonical Ranked-SR item has the smallest id

      // Same display name with different ids = alternate-mode variants (Arena /
      // event, 6-digit ids like 323004) and jungle-pet stages (1101/1107). Keep
      // exactly ONE per name — the smallest id, which is what ranked SR match
      // data actually records. Without this the picker showed every item twice.
      const seen = new Map<string, GameItem>();
      for (const it of candidates) if (!seen.has(it.name)) seen.set(it.name, it);
      const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

      _cache = list;
      _byId = new Map(list.map((i) => [i.id, i]));
      return list;
    })
    .catch((e) => {
      _promise = null; // allow a retry on next caller
      throw e;
    });
  return _promise;
}

export function useItems() {
  const [items, setItems] = useState<GameItem[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    let alive = true;
    loadItems()
      .then((l) => alive && (setItems(l), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { items, loading };
}

/** Synchronous name lookup from the loaded cache (or null if not loaded / not a
 *  current build item). Kick off loadItems() once so it's warm for callers. */
export function itemDisplayName(id: number): string | null {
  if (!_cache) { void loadItems().catch(() => {}); return null; }
  return _byId?.get(id)?.name ?? null;
}

/** Ids of every item currently in the game (completed items + boots, no
 *  components/trinkets). Passed to the backend so the "rank by Items" output only
 *  ranks real build items. Empty until loadItems() resolves; kicks it off. */
export function getLoadedItemIds(): number[] {
  if (!_cache) { void loadItems().catch(() => {}); return []; }
  return _cache.map((i) => i.id);
}

/** Ids of LEGENDARY/core items only (≥2000g, no boots) — the set used to define
 *  "1st item, 2nd item…" build slots. Excludes starters (Doran's, tear), boots and
 *  cheap support items, which are bought first and would otherwise BE the "1st
 *  item". This is what makes the build-slot filter mean what players expect. */
export function getSlotPoolIds(): number[] {
  if (!_cache) { void loadItems().catch(() => {}); return []; }
  return _cache.filter((i) => i.total >= 2000 && !i.tags.includes("Boots")).map((i) => i.id);
}
