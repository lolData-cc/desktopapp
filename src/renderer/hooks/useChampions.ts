// useChampions — single source of truth for the champion roster.
//
// Every champion picker on the site used to fetch `champion.json` independently.
// This hook fetches it ONCE (module-level cache + in-flight promise dedupe) and
// hands back a normalized, alphabetically sorted list. Icons and the champion
// page route both key off `slug` (the ddragon id, e.g. "Aatrox" / "MonkeyKing").

import { useEffect, useState } from "react";
import { cdnBaseUrl, champDisplayName } from "@/config";

export type Champion = {
  slug: string; // ddragon id — used in icon URLs (/img/champion/{slug}.png) and the /champions/{slug} route
  key: number; // numeric champion id, e.g. 266
  name: string; // display name (champDisplayName applied: MonkeyKing → Wukong)
};

let _cache: Champion[] | null = null;
let _promise: Promise<Champion[]> | null = null;

export function loadChampions(): Promise<Champion[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`${cdnBaseUrl()}/data/en_US/champion.json`)
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load champion.json");
      return r.json();
    })
    .then((data) => {
      const list: Champion[] = Object.values(data.data as Record<string, any>)
        .map((c) => ({ slug: c.id as string, key: Number(c.key), name: champDisplayName(c.id as string) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      _cache = list;
      return list;
    })
    .catch((e) => {
      _promise = null; // allow a retry on next caller
      throw e;
    });
  return _promise;
}

export function useChampions() {
  const [champions, setChampions] = useState<Champion[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    let alive = true;
    loadChampions()
      .then((l) => alive && (setChampions(l), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { champions, loading };
}
