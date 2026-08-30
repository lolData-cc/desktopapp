// Thin re-export over the live rune store (runeData). Keystone/style icons +
// names now come from the current runesReforged.json (our CDN) instead of a
// hardcoded map, so newly added/renamed runes resolve correctly. Signatures are
// unchanged, so every match-card consumer keeps working untouched.

import { getRuneIcon, getRuneName } from "./runeData";

export function getKeystoneIcon(perkId: number): string | null {
  return getRuneIcon(perkId);
}

export function getStyleIcon(styleId: number): string | null {
  return getRuneIcon(styleId);
}

export function getKeystoneName(perkId: number): string | null {
  return getRuneName(perkId);
}

export function getStyleName(styleId: number): string | null {
  return getRuneName(styleId);
}
